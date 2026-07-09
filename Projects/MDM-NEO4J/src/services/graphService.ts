import neo4j, { Driver, Session, QueryResult as NeoQueryResult } from 'neo4j-driver';
import { GraphNode, GraphEdge, GraphPath, NodeType, EdgeType, createEdge } from '../schema/nodeSchema';
import { EmbeddingService } from './embeddingService';
import { logger } from '../monitoring/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Graph Service — Neo4j CRUD, traversal, similarity search
// ─────────────────────────────────────────────────────────────────────────────

export interface TraversalOptions {
  minHops?: number;
  maxHops?: number;
  edgeTypes?: EdgeType[];
}

/** Derive traversal depth and edge filters from query phrasing + intent. */
export function resolveTraversalOptions(
  query: string,
  intent: string
): TraversalOptions {
  const lower = query.toLowerCase();

  if (/skip[- ]?level/.test(lower)) {
    return { minHops: 2, maxHops: 4, edgeTypes: ['reports_to'] };
  }
  if (/management chain|chain (from|to)/.test(lower)) {
    return { minHops: 1, maxHops: 6, edgeTypes: ['reports_to'] };
  }
  if (/matrix report/.test(lower)) {
    return { minHops: 1, maxHops: 2, edgeTypes: ['matrix_reports_to'] };
  }
  if (/job shadow/.test(lower)) {
    return { minHops: 1, maxHops: 2, edgeTypes: ['job_shadows'] };
  }
  if (/cover(s)? for/.test(lower)) {
    return { minHops: 1, maxHops: 2, edgeTypes: ['covers_for'] };
  }
  if (
    intent === 'MULTI_HOP' ||
    /report(s)? to/.test(lower) ||
    (lower.includes('who does') && lower.includes('report'))
  ) {
    return { minHops: 1, maxHops: 3, edgeTypes: ['reports_to'] };
  }

  return { minHops: 0, maxHops: 2 };
}

/** Prefer full names (e.g. "Alex Kim") over partial tokens ("Alex", "Kim"). */
export function prioritizeEntities(entities: string[]): string[] {
  const unique = [...new Set(entities)];
  return unique.filter(
    (entity) =>
      !unique.some(
        (other) =>
          other !== entity &&
          other.length > entity.length &&
          other.toLowerCase().includes(entity.toLowerCase())
      )
  );
}

export class GraphService {
  private driver: Driver | null = null;

  // ── Connection ──────────────────────────────────────────────

  async connect(): Promise<void> {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'graphbos2026';

    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    await this.driver.verifyConnectivity();
    logger.info('Neo4j connected', { uri });
    await this.ensureConstraintsAndIndexes();
  }

  async disconnect(): Promise<void> {
    await this.driver?.close();
    logger.info('Neo4j disconnected');
  }

  private session(): Session {
    if (!this.driver) throw new Error('GraphService not connected');
    return this.driver.session();
  }

  // ── Schema: constraints & indexes ──────────────────────────

  private async ensureConstraintsAndIndexes(): Promise<void> {
    const s = this.session();
    try {
      // Unique constraint on node id
      await s.run(
        `CREATE CONSTRAINT node_id_unique IF NOT EXISTS FOR (n:GraphNode) REQUIRE n.id IS UNIQUE`
      );
      // Index on label for full-text search
      await s.run(
        `CREATE INDEX node_label_idx IF NOT EXISTS FOR (n:GraphNode) ON (n.label)`
      );
      // Index on status for curator queries
      await s.run(
        `CREATE INDEX node_status_idx IF NOT EXISTS FOR (n:GraphNode) ON (n.status)`
      );
      logger.debug('Neo4j constraints and indexes ensured');
    } catch (e) {
      logger.warn('Index setup warning (may already exist)', { err: String(e) });
    } finally {
      await s.close();
    }
  }

  // ── Node CRUD ───────────────────────────────────────────────

  async upsertNode(node: GraphNode): Promise<void> {
    const s = this.session();
    try {
      await s.run(
        `MERGE (n:GraphNode {id: $id})
         SET n += $props, n.type = $type, n.label = $label`,
        {
          id: node.id,
          type: node.type,
          label: node.label,
          props: {
            ...node.properties,
            embedding: node.properties.embedding
              ? JSON.stringify(node.properties.embedding)
              : null,
            metadata: node.properties.metadata
              ? JSON.stringify(node.properties.metadata)
              : null,
          },
        }
      );
    } finally {
      await s.close();
    }
  }

  async upsertEdge(edge: GraphEdge): Promise<void> {
    const s = this.session();
    try {
      await s.run(
        `MATCH (a:GraphNode {id: $from}), (b:GraphNode {id: $to})
         MERGE (a)-[r:EDGE {type: $type}]->(b)
         SET r += $props`,
        {
          from: edge.from,
          to: edge.to,
          type: edge.type,
          props: { ...edge.properties },
        }
      );
    } finally {
      await s.close();
    }
  }

  async getNodeById(id: string): Promise<GraphNode | null> {
    const s = this.session();
    try {
      const result = await s.run(
        `MATCH (n:GraphNode {id: $id}) RETURN n`,
        { id }
      );
      if (result.records.length === 0) return null;
      return this.recordToNode(result.records[0].get('n'));
    } finally {
      await s.close();
    }
  }

  async deleteNode(id: string): Promise<void> {
    const s = this.session();
    try {
      await s.run(
        `MATCH (n:GraphNode {id: $id}) DETACH DELETE n`,
        { id }
      );
    } finally {
      await s.close();
    }
  }

  // ── Graph traversal ─────────────────────────────────────────

  /**
   * Find nodes whose labels match extracted entities, then traverse outgoing edges.
   * Returns the single best path (shortest path that satisfies minHops + edge filters).
   */
  async traverseByEntities(
    entities: string[],
    domain?: string,
    options: TraversalOptions | number = {}
  ): Promise<GraphPath | null> {
    const resolved: TraversalOptions =
      typeof options === 'number'
        ? { minHops: 0, maxHops: options }
        : { minHops: 0, maxHops: 2, ...options };

    const prioritized = prioritizeEntities(entities);
    if (prioritized.length === 0) return null;

    const minHops = resolved.minHops ?? 0;
    const maxHops = resolved.maxHops ?? 2;
    const edgeTypes = resolved.edgeTypes;

    const s = this.session();
    try {
      const entityMatch = prioritized
        .map((_, i) => `start.label =~ $e${i}`)
        .join(' OR ');

      const edgeFilter = edgeTypes?.length
        ? `AND ALL(r IN relationships(path) WHERE r.type IN $edgeTypes)`
        : '';

      const result = await s.run(
        `MATCH path = (start:GraphNode)-[:EDGE*${minHops}..${maxHops}]->(end:GraphNode)
         WHERE start.status = 'main'
           AND (${entityMatch})
           ${edgeFilter}
         WITH path, start, end, length(path) AS pathLen
         RETURN path, start, end, pathLen
         ORDER BY pathLen ASC, start.confidence DESC
         LIMIT 5`,
        {
          ...Object.fromEntries(
            prioritized.map((e, i) => [`e${i}`, `(?i).*${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`])
          ),
          ...(edgeTypes?.length ? { edgeTypes } : {}),
        }
      );

      if (result.records.length === 0) return null;

      const bestRecord = result.records[0];
      const pathObj = bestRecord.get('path');
      const segments: any[] = pathObj.segments || [];

      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const seenNodes = new Set<string>();

      for (const seg of segments) {
        const startNode = this.recordToNode(seg.start);
        const endNode = this.recordToNode(seg.end);
        const rel = seg.relationship;

        if (!seenNodes.has(startNode.id)) {
          nodes.push(startNode);
          seenNodes.add(startNode.id);
        }
        if (!seenNodes.has(endNode.id)) {
          nodes.push(endNode);
          seenNodes.add(endNode.id);
        }
        edges.push({
          from: startNode.id,
          to: endNode.id,
          type: (rel.properties?.type || rel.type) as EdgeType,
          properties: {
            weight: rel.properties?.weight ?? 1.0,
            evidence: rel.properties?.evidence,
          },
        });
      }

      if (nodes.length === 0) return null;

      await this.incrementAccessCounts(nodes.map((n) => n.id));

      const terminal = nodes[nodes.length - 1];
      return { nodes, edges, score: terminal?.properties.confidence || 0 };
    } finally {
      await s.close();
    }
  }


  /**
   * Semantic similarity search using stored embeddings.
   * Falls back to label-based search on Community Edition.
   */
  async semanticSearch(
    queryEmbedding: number[],
    topK = 5
  ): Promise<GraphNode[]> {
    const s = this.session();
    try {
      // Fetch all main nodes with embeddings (POC: in-memory cosine)
      const result = await s.run(
        `MATCH (n:GraphNode) WHERE n.status = 'main' AND n.embedding IS NOT NULL RETURN n LIMIT 200`
      );

      const nodes = result.records.map((r) => this.recordToNode(r.get('n')));

      // Score by cosine similarity
      const scored = nodes
        .filter((n) => n.properties.embedding && n.properties.embedding.length > 0)
        .map((n) => ({
          node: n,
          score: EmbeddingService.cosineSimilarity(queryEmbedding, n.properties.embedding!),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      return scored.map((s) => s.node);
    } finally {
      await s.close();
    }
  }

  // ── Temp node management ────────────────────────────────────

  async getTempNodes(minConfidence = 0): Promise<GraphNode[]> {
    const s = this.session();
    try {
      const result = await s.run(
        `MATCH (n:GraphNode) WHERE n.status = 'temp' AND n.confidence >= $minConfidence RETURN n`,
        { minConfidence }
      );
      return result.records.map((r) => this.recordToNode(r.get('n')));
    } finally {
      await s.close();
    }
  }

  async promoteToMain(id: string): Promise<void> {
    const s = this.session();
    try {
      await s.run(
        `MATCH (n:GraphNode {id: $id}) SET n.status = 'main', n.source = 'verified'`,
        { id }
      );
    } finally {
      await s.close();
    }
  }

  // ── Admin: full graph access ─────────────────────────────────

  async getAllNodes(): Promise<GraphNode[]> {
    const s = this.session();
    try {
      const result = await s.run(
        `MATCH (n:GraphNode) RETURN n ORDER BY n.label`
      );
      return result.records.map((r) => this.recordToNode(r.get('n')));
    } finally {
      await s.close();
    }
  }

  async getAllEdges(): Promise<
    Array<GraphEdge & { fromLabel: string; toLabel: string }>
  > {
    const s = this.session();
    try {
      const result = await s.run(
        `MATCH (a:GraphNode)-[r:EDGE]->(b:GraphNode)
         RETURN a.id AS fromId, a.label AS fromLabel,
                b.id AS toId, b.label AS toLabel,
                r.type AS type, r.weight AS weight, r.evidence AS evidence`
      );
      return result.records.map((rec) => ({
        from: rec.get('fromId'),
        to: rec.get('toId'),
        fromLabel: rec.get('fromLabel'),
        toLabel: rec.get('toLabel'),
        type: rec.get('type') as EdgeType,
        properties: {
          weight: rec.get('weight') ?? 1.0,
          evidence: rec.get('evidence') ?? undefined,
        },
      }));
    } finally {
      await s.close();
    }
  }

  async deleteEdge(from: string, to: string, type: EdgeType): Promise<void> {
    const s = this.session();
    try {
      await s.run(
        `MATCH (a:GraphNode {id: $from})-[r:EDGE {type: $type}]->(b:GraphNode {id: $to})
         DELETE r`,
        { from, to, type }
      );
    } finally {
      await s.close();
    }
  }

  /** Promotion / reorg: replace primary reports_to edge for an employee. */
  async reassignManager(
    employeeId: string,
    newManagerId: string,
    evidence = 'Manager reassignment'
  ): Promise<void> {
    const edges = await this.getAllEdges();
    const current = edges.find(
      (e) => e.from === employeeId && e.type === 'reports_to'
    );
    if (current) {
      await this.deleteEdge(current.from, current.to, 'reports_to');
    }
    await this.upsertEdge(
      createEdge(employeeId, newManagerId, 'reports_to', { weight: 1.0, evidence })
    );
  }

  // ── Helpers ─────────────────────────────────────────────────

  private recordToNode(record: any): GraphNode {
    const props = record.properties;
    return {
      id: props.id,
      type: props.type as NodeType,
      label: props.label,
      properties: {
        confidence: props.confidence ?? 1.0,
        timestamp: props.timestamp,
        source: props.source ?? 'manual',
        status: props.status ?? 'main',
        accessCount: props.accessCount?.toNumber?.() ?? props.accessCount ?? 0,
        description: props.description,
        embedding: props.embedding ? JSON.parse(props.embedding) : undefined,
        metadata: props.metadata ? JSON.parse(props.metadata) : undefined,
      },
    };
  }

  private async incrementAccessCounts(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const s = this.session();
    try {
      await s.run(
        `UNWIND $ids AS id
         MATCH (n:GraphNode {id: id})
         SET n.accessCount = coalesce(n.accessCount, 0) + 1`,
        { ids }
      );
    } finally {
      await s.close();
    }
  }

  // ── Stats ────────────────────────────────────────────────────

  async getStats(): Promise<{
    totalNodes: number;
    mainNodes: number;
    tempNodes: number;
    totalEdges: number;
  }> {
    const s = this.session();
    try {
      const result = await s.run(
        `MATCH (n:GraphNode)
         RETURN
           count(n) AS total,
           sum(CASE WHEN n.status = 'main' THEN 1 ELSE 0 END) AS main,
           sum(CASE WHEN n.status = 'temp' THEN 1 ELSE 0 END) AS temp`
      );
      const edgeResult = await s.run(`MATCH ()-[r:EDGE]->() RETURN count(r) AS total`);
      const r = result.records[0];
      return {
        totalNodes: r.get('total').toNumber(),
        mainNodes: r.get('main').toNumber(),
        tempNodes: r.get('temp').toNumber(),
        totalEdges: edgeResult.records[0].get('total').toNumber(),
      };
    } finally {
      await s.close();
    }
  }
}

export const graphService = new GraphService();
