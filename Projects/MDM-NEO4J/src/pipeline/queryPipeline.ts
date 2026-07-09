import 'dotenv/config';
import { embeddingService } from '../services/embeddingService';
import { intentDetector } from '../services/intentDetector';
import { graphService, resolveTraversalOptions } from '../services/graphService';
import { geminiService } from '../services/geminiService';
import { responseBuilder } from '../services/responseBuilder';
import { QueryResult } from '../schema/nodeSchema';
import { IntentType, INTENT_ROUTING_MAP } from '../schema/intentTypes';
import { logger, logQuery, logGeminiFallback } from '../monitoring/logger';
import { metrics } from '../monitoring/metrics';
import { createClient } from 'redis';

// ─────────────────────────────────────────────────────────────────────────────
// Query Pipeline — Full BOS orchestration
//
// Flow:
//  Query → Embed → Detect Intent → Route
//    ├─ [Graph hit]   → Traverse → Build Response
//    └─ [Graph miss]  → Gemini Fallback → Store Temp Nodes → Build Response
// ─────────────────────────────────────────────────────────────────────────────

export class QueryPipeline {
  private redis: ReturnType<typeof createClient> | null = null;
  private initialized = false;

  // ── Init ────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return;

    // Connect Neo4j
    await graphService.connect();

    // Connect Redis (optional — degrade gracefully if unavailable)
    try {
      let redisRetries = 0;
      const MAX_REDIS_RETRIES = 5;

      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries: number) => {
            redisRetries = retries;
            if (retries >= MAX_REDIS_RETRIES) {
              logger.warn(`Redis max reconnect attempts (${MAX_REDIS_RETRIES}) reached — disabling cache`);
              return false; // Stop reconnecting — prevents AggregateError spam
            }
            const delay = Math.min(retries * 500, 3000);
            logger.debug(`Redis reconnecting in ${delay}ms (attempt ${retries + 1}/${MAX_REDIS_RETRIES})`);
            return delay;
          },
          connectTimeout: 5000,
        },
      });

      this.redis.on('error', (err) => {
        // Only log unique error types, not every retry attempt
        if (redisRetries <= 1) {
          logger.warn('Redis unavailable — cache degraded gracefully', { err: String(err) });
        }
      });

      // When Redis permanently closes (after max retries), null out the reference
      this.redis.on('end', () => {
        logger.warn('Redis connection closed — cache disabled for this session');
        this.redis = null;
      });

      await this.redis.connect();
      logger.info('Redis cache connected');
    } catch {
      logger.warn('Redis unavailable — cache disabled');
      this.redis = null;
    }

    this.initialized = true;
    logger.info('QueryPipeline initialized');
  }

  async shutdown(): Promise<void> {
    await graphService.disconnect();
    await this.redis?.quit();
  }

  // ── Main entry point ────────────────────────────────────────

  async run(query: string): Promise<QueryResult> {
    const start = Date.now();
    logger.info('Pipeline started', { query });

    try {
      // ── Step 1: Cache check ──────────────────────────────────
      const cached = await this.getCached(query);
      if (cached) {
        const latencyMs = Date.now() - start;
        metrics.recordQuery(cached.intent as IntentType, latencyMs, 'cache');
        logQuery(query, cached.intent, 'cache', latencyMs);
        return { ...cached, latencyMs };
      }

      // ── Step 2: Generate embedding ───────────────────────────
      const embedding = await embeddingService.embed(query);

      // ── Step 3: Detect intent ────────────────────────────────
      const intentResult = await intentDetector.detect(query);
      const routing = INTENT_ROUTING_MAP[intentResult.intent];
      logger.debug('Intent resolved', { intent: intentResult.intent, routing });

      // ── Step 4: Graph traversal ──────────────────────────────
      let graphPath = null;
      if (routing.tryGraph) {
        // Try entity-based traversal first
        const traversalOpts = resolveTraversalOptions(query, intentResult.intent);
        graphPath = await graphService.traverseByEntities(
          intentResult.entities,
          intentResult.domain,
          traversalOpts
        );

        // If no entity hit, try semantic search
        if (!graphPath) {
          const similarNodes = await graphService.semanticSearch(embedding, 3);
          if (similarNodes.length > 0) {
            graphPath = {
              nodes: similarNodes,
              edges: [],
              score: similarNodes[0].properties.confidence,
            };
          }
        }
      }

      // ── Step 5a: Graph hit — build response ──────────────────
      if (graphPath && graphPath.nodes.length > 0) {
        const answer = responseBuilder.buildFromGraph(graphPath, intentResult);
        const latencyMs = Date.now() - start;

        const result: QueryResult = {
          answer,
          source: 'graph',
          intent: intentResult.intent,
          confidence: graphPath.score,
          graphPath,
          latencyMs,
        };

        await this.cacheResult(query, result);
        metrics.recordQuery(intentResult.intent, latencyMs, 'graph');
        logQuery(query, intentResult.intent, 'graph', latencyMs);
        return result;
      }

      // ── Step 5b: Gemini fallback ─────────────────────────────
      if (routing.allowGeminiFallback) {
        logger.info('Graph miss — falling back to Gemini', { query });
        const geminiResp = await geminiService.query(query, intentResult);

        // ── Step 6: Store temp nodes ─────────────────────────────
        let tempNodesCreated = 0;
        if (routing.createTempNodes && geminiResp.nodes.length > 0) {
          for (const node of geminiResp.nodes) {
            node.properties.embedding = embedding;
            await graphService.upsertNode(node);
          }
          for (const edge of geminiResp.edges) {
            await graphService.upsertEdge(edge);
          }
          tempNodesCreated = geminiResp.nodes.length;
          metrics.recordTempNodes(tempNodesCreated);
          logGeminiFallback(query, tempNodesCreated);
        }

        const answer = responseBuilder.buildFromGemini(geminiResp.answer, tempNodesCreated);
        const latencyMs = Date.now() - start;

        const result: QueryResult = {
          answer,
          source: 'gemini',
          intent: intentResult.intent,
          confidence: geminiResp.confidence,
          tempNodesCreated,
          latencyMs,
        };

        metrics.recordQuery(intentResult.intent, latencyMs, 'gemini');
        logQuery(query, intentResult.intent, 'gemini', latencyMs);
        return result;
      }

      // ── Step 5c: No answer ───────────────────────────────────
      const latencyMs = Date.now() - start;
      return {
        answer: 'I could not find an answer for this query. Please try rephrasing.',
        source: 'graph',
        intent: intentResult.intent,
        confidence: 0,
        latencyMs,
      };

    } catch (err) {
      metrics.recordError();
      logger.error('Pipeline error', { query, err: String(err) });
      throw err;
    }
  }

  // ── Redis Cache ─────────────────────────────────────────────

  private async getCached(query: string): Promise<QueryResult | null> {
    if (!this.redis) return null;
    try {
      const key = `bos:query:${Buffer.from(query).toString('base64')}`;
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  private async cacheResult(query: string, result: QueryResult): Promise<void> {
    if (!this.redis) return;
    try {
      const key = `bos:query:${Buffer.from(query).toString('base64')}`;
      const ttl = parseInt(process.env.CACHE_TTL_SECONDS || '300');
      await this.redis.setEx(key, ttl, JSON.stringify(result));
    } catch {
      // Cache failures are non-fatal
    }
  }
}

export const queryPipeline = new QueryPipeline();
