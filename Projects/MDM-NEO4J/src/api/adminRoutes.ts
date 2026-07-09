import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { graphService } from '../services/graphService';
import { mergeCurator } from '../jobs/mergeCurator';
import { metrics } from '../monitoring/metrics';
import { logger } from '../monitoring/logger';
import { embeddingService } from '../services/embeddingService';
import {
  createNode,
  createEdge,
  NodeType,
  EdgeType,
  NodeSource,
  NodeStatus,
  GraphNode,
} from '../schema/nodeSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Routes — Graph management, inspection, metrics
// ─────────────────────────────────────────────────────────────────────────────

export const adminRouter = Router();

const MDM_EDGE_TYPES: EdgeType[] = [
  'reports_to',
  'matrix_reports_to',
  'job_shadows',
  'covers_for',
  'belongs_to',
];

// GET /admin/stats
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const graphStats = await graphService.getStats();
    const runtimeMetrics = metrics.getSummary();
    res.json({
      graph: graphStats,
      runtime: {
        ...runtimeMetrics,
        graphHitRate: `${(metrics.getGraphHitRate() * 100).toFixed(1)}%`,
        geminiCallReduction: `${(metrics.getGeminiCallReduction() * 100).toFixed(1)}%`,
      },
    });
  } catch (err) {
    logger.error('Admin stats error', { err: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// GET /admin/graph — Full graph for UI visualization
adminRouter.get('/graph', async (_req: Request, res: Response) => {
  try {
    const [nodes, edges] = await Promise.all([
      graphService.getAllNodes(),
      graphService.getAllEdges(),
    ]);
    res.json({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label,
        description: n.properties.description,
        status: n.properties.status,
        source: n.properties.source,
        confidence: n.properties.confidence,
        accessCount: n.properties.accessCount,
        metadata: n.properties.metadata,
      })),
      edges: edges.map((e) => ({
        from: e.from,
        to: e.to,
        fromLabel: e.fromLabel,
        toLabel: e.toLabel,
        type: e.type,
        weight: e.properties.weight,
        evidence: e.properties.evidence,
      })),
      edgeTypes: MDM_EDGE_TYPES,
    });
  } catch (err) {
    logger.error('Admin graph fetch error', { err: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// GET /admin/nodes
adminRouter.get('/nodes', async (_req: Request, res: Response) => {
  try {
    const nodes = await graphService.getAllNodes();
    res.json({ count: nodes.length, nodes });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/nodes — Create or update a node
const CreateNodeSchema = z.object({
  type: NodeType.default('Entity'),
  label: z.string().min(1),
  description: z.string().optional(),
  status: NodeStatus.default('main'),
  source: NodeSource.default('manual'),
  confidence: z.number().min(0).max(1).default(1.0),
  metadata: z.record(z.unknown()).optional(),
});

adminRouter.post('/nodes', async (req: Request, res: Response) => {
  try {
    const parsed = CreateNodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid node', details: parsed.error.errors });
    }

    const { type, label, description, status, source, confidence, metadata } = parsed.data;
    const node = createNode(type, label, {
      description,
      status,
      source,
      confidence,
      metadata,
    });
    node.properties.embedding = await embeddingService.embed(
      `${label} ${description || ''}`
    );
    await graphService.upsertNode(node);
    logger.info('Node created via admin', { id: node.id, label });
    res.status(201).json({ success: true, node });
  } catch (err) {
    logger.error('Create node error', { err: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// PUT /admin/node/:id — Update an existing node
const UpdateNodeSchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  status: NodeStatus.optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

adminRouter.put('/node/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = UpdateNodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid update', details: parsed.error.errors });
    }

    const existing = await graphService.getNodeById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Node not found' });
    }

    const updates = parsed.data;
    const updated: GraphNode = {
      ...existing,
      label: updates.label ?? existing.label,
      properties: {
        ...existing.properties,
        description: updates.description ?? existing.properties.description,
        status: updates.status ?? existing.properties.status,
        confidence: updates.confidence ?? existing.properties.confidence,
        metadata: updates.metadata ?? existing.properties.metadata,
      },
    };

    if (updates.label || updates.description) {
      updated.properties.embedding = await embeddingService.embed(
        `${updated.label} ${updated.properties.description || ''}`
      );
    }

    await graphService.upsertNode(updated);
    res.json({ success: true, node: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/reassign-manager — Change primary manager (promotion / reorg)
const ReassignManagerSchema = z.object({
  employeeId: z.string().uuid(),
  newManagerId: z.string().uuid(),
  evidence: z.string().optional(),
});

adminRouter.post('/reassign-manager', async (req: Request, res: Response) => {
  try {
    const parsed = ReassignManagerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const { employeeId, newManagerId, evidence } = parsed.data;
    await graphService.reassignManager(employeeId, newManagerId, evidence);
    logger.info('Manager reassigned', { employeeId, newManagerId });
    res.json({ success: true, employeeId, newManagerId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/edges — Create a relationship
const CreateEdgeSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  type: EdgeType,
  weight: z.number().min(0).max(1).default(1.0),
  evidence: z.string().optional(),
});

adminRouter.post('/edges', async (req: Request, res: Response) => {
  try {
    const parsed = CreateEdgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid edge', details: parsed.error.errors });
    }

    const { from, to, type, weight, evidence } = parsed.data;
    const edge = createEdge(from, to, type, { weight, evidence });
    await graphService.upsertEdge(edge);
    logger.info('Edge created via admin', { from, to, type });
    res.status(201).json({ success: true, edge });
  } catch (err) {
    logger.error('Create edge error', { err: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /admin/edge — Delete a relationship
adminRouter.delete('/edge', async (req: Request, res: Response) => {
  try {
    const { from, to, type } = req.query;
    if (!from || !to || !type) {
      return res.status(400).json({ error: 'from, to, and type query params required' });
    }
    await graphService.deleteEdge(
      String(from),
      String(to),
      type as EdgeType
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/merge
adminRouter.post('/merge', async (_req: Request, res: Response) => {
  try {
    const report = await mergeCurator.runMerge();
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /admin/temp-nodes
adminRouter.get('/temp-nodes', async (req: Request, res: Response) => {
  try {
    const minConf = parseFloat((req.query.minConfidence as string) || '0');
    const nodes = await graphService.getTempNodes(minConf);
    res.json({ count: nodes.length, nodes });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/promote/:id
adminRouter.post('/promote/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await graphService.promoteToMain(id);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /admin/node/:id
adminRouter.delete('/node/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await graphService.deleteNode(id);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/reset-metrics
adminRouter.post('/reset-metrics', (_req: Request, res: Response) => {
  metrics.reset();
  res.json({ success: true, message: 'Metrics reset' });
});
