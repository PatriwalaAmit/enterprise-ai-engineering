import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Node Types
// ─────────────────────────────────────────────────────────────────────────────

export const NodeType = z.enum([
  'Intent',
  'Entity',
  'Fact',
  'Module',
  'Action',
  'Session',
]);
export type NodeType = z.infer<typeof NodeType>;

// ─────────────────────────────────────────────────────────────────────────────
// Node Status
// ─────────────────────────────────────────────────────────────────────────────

export const NodeStatus = z.enum(['main', 'temp']);
export type NodeStatus = z.infer<typeof NodeStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// Node Source
// ─────────────────────────────────────────────────────────────────────────────

export const NodeSource = z.enum(['gemini', 'manual', 'verified', 'seed']);
export type NodeSource = z.infer<typeof NodeSource>;

// ─────────────────────────────────────────────────────────────────────────────
// Edge Types
// ─────────────────────────────────────────────────────────────────────────────

export const EdgeType = z.enum([
  'has_capital',
  'requires_expert',
  'next_intent',
  'part_of',
  'has_leader',
  'member_of',
  'triggers_action',
  'related_to',
  'explains',
  'located_in',
  'has_fact',
  // MDM — employee hierarchy & network relationships
  'reports_to',
  'matrix_reports_to',
  'job_shadows',
  'covers_for',
  'belongs_to',
]);
export type EdgeType = z.infer<typeof EdgeType>;

// ─────────────────────────────────────────────────────────────────────────────
// Canonical Node Schema
// ─────────────────────────────────────────────────────────────────────────────

export const NodePropertiesSchema = z.object({
  embedding: z.array(z.number()).optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  timestamp: z.string().datetime().optional(),
  source: NodeSource.default('manual'),
  status: NodeStatus.default('main'),
  accessCount: z.number().int().min(0).default(0),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type NodeProperties = z.infer<typeof NodePropertiesSchema>;

export const GraphNodeSchema = z.object({
  id: z.string().uuid(),
  type: NodeType,
  label: z.string().min(1),
  properties: NodePropertiesSchema,
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Canonical Edge Schema
// ─────────────────────────────────────────────────────────────────────────────

export const EdgePropertiesSchema = z.object({
  weight: z.number().min(0).max(1).default(1.0),
  evidence: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});
export type EdgeProperties = z.infer<typeof EdgePropertiesSchema>;

export const GraphEdgeSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  type: EdgeType,
  properties: EdgePropertiesSchema,
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Graph Path (result of traversal)
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Result (pipeline output)
// ─────────────────────────────────────────────────────────────────────────────

export interface QueryResult {
  answer: string;
  source: 'graph' | 'gemini' | 'cache';
  intent: string;
  confidence: number;
  graphPath?: GraphPath;
  tempNodesCreated?: number;
  latencyMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory helpers
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';

export function createNode(
  type: NodeType,
  label: string,
  overrides: Partial<NodeProperties> = {}
): GraphNode {
  return GraphNodeSchema.parse({
    id: uuidv4(),
    type,
    label,
    properties: {
      timestamp: new Date().toISOString(),
      ...overrides,
    },
  });
}

export function createEdge(
  from: string,
  to: string,
  type: EdgeType,
  overrides: Partial<EdgeProperties> = {}
): GraphEdge {
  return GraphEdgeSchema.parse({
    from,
    to,
    type,
    properties: {
      timestamp: new Date().toISOString(),
      ...overrides,
    },
  });
}
