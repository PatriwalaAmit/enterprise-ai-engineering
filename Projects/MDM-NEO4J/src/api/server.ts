import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { queryPipeline } from '../pipeline/queryPipeline';
import { graphService } from '../services/graphService';
import { adminRouter } from './adminRoutes';
import { mergeCurator } from '../jobs/mergeCurator';
import { logger } from '../monitoring/logger';
import { metrics } from '../monitoring/metrics';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Express REST API Server
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// Request logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug(`${req.method} ${req.path}`, { body: req.body });
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /api — API info (UI served from /index.html)
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    name: 'MDM Graph Console API',
    version: '1.0.0',
    status: 'running',
    ui: '/',
    endpoints: {
      query: 'POST /query',
      status: 'GET /graph/status',
      admin: {
        graph: 'GET /admin/graph',
        stats: 'GET /admin/stats',
        nodes: 'GET|POST /admin/nodes',
        edges: 'POST /admin/edges',
        merge: 'POST /admin/merge',
        tempNodes: 'GET /admin/temp-nodes',
        promote: 'POST /admin/promote/:id',
        deleteNode: 'DELETE /admin/node/:id',
        deleteEdge: 'DELETE /admin/edge',
        resetMetrics: 'POST /admin/reset-metrics',
      },
    },
  });
});

// POST /query — Main query endpoint
const QueryRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  includeMetadata: z.boolean().optional().default(false),
});

app.post('/query', async (req: Request, res: Response) => {
  try {
    const parsed = QueryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const { query, includeMetadata } = parsed.data;
    const result = await queryPipeline.run(query);

    const response: any = {
      answer: result.answer,
      source: result.source,
      intent: result.intent,
      confidence: result.confidence,
      latencyMs: result.latencyMs,
    };

    if (result.tempNodesCreated) {
      response.tempNodesCreated = result.tempNodesCreated;
    }

    if (includeMetadata && result.graphPath) {
      response.graphPath = {
        nodes: result.graphPath.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          label: n.label,
          description: n.properties.description,
          confidence: n.properties.confidence,
          status: n.properties.status,
        })),
        edges: result.graphPath.edges.map((e) => ({
          from: e.from,
          to: e.to,
          type: e.type,
          weight: e.properties.weight,
          evidence: e.properties.evidence,
        })),
        score: result.graphPath.score,
      };
    }

    return res.json(response);
  } catch (err) {
    logger.error('Query endpoint error', { err: String(err) });
    return res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
});

// GET /graph/status — Graph connectivity status
app.get('/graph/status', async (_req: Request, res: Response) => {
  try {
    const stats = await graphService.getStats();
    const summary = metrics.getSummary();
    res.json({
      status: 'healthy',
      graph: stats,
      metrics: {
        totalQueries: summary.totalQueries,
        graphHitRate: `${(metrics.getGraphHitRate() * 100).toFixed(1)}%`,
        avgLatencyMs: summary.avgLatencyMs,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) });
  }
});

// Admin routes
app.use('/admin', adminRouter);

// ── 404 handler ─────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ─────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { err: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function start() {
  try {
    logger.info('Starting Graph-RAG BOS...');
    await queryPipeline.init();
    mergeCurator.start();

    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      console.log(`\n🚀 Graph-RAG BOS running at http://localhost:${PORT}`);
      console.log(`🖥️  Admin UI:        http://localhost:${PORT}/`);
      console.log(`📊 Neo4j Browser:   http://localhost:7474\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received — shutting down');
      mergeCurator.stop();
      await queryPipeline.shutdown();
      process.exit(0);
    });
    process.on('SIGINT', async () => {
      logger.info('SIGINT received — shutting down');
      mergeCurator.stop();
      await queryPipeline.shutdown();
      process.exit(0);
    });
  } catch (err) {
    logger.error('Startup failed', { err: String(err) });
    process.exit(1);
  }
}

start();

export default app;
