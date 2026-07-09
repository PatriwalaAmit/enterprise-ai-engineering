import { GraphPath, GraphNode, GraphEdge } from '../schema/nodeSchema';
import { IntentResult, IntentType } from '../schema/intentTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Response Builder — Decodes graph paths into human-readable answers
// ─────────────────────────────────────────────────────────────────────────────

export class ResponseBuilder {
  /**
   * Synthesize a response from a graph path + intent context.
   */
  buildFromGraph(path: GraphPath, intentResult: IntentResult): string {
    const { nodes, edges } = path;
    if (nodes.length === 0) return 'No relevant information found in the knowledge graph.';

    switch (intentResult.intent) {
      case IntentType.INFORMATION_RETRIEVAL:
        return this.buildFactualResponse(nodes, edges, intentResult);

      case IntentType.CONCEPTUAL:
        return this.buildConceptualResponse(nodes, edges, intentResult);

      case IntentType.MULTI_HOP:
        return this.buildMultiHopResponse(nodes, edges, intentResult);

      case IntentType.ACTION:
        return this.buildActionResponse(nodes, intentResult);

      default:
        if (edges.length >= 1) {
          return this.buildMultiHopResponse(nodes, edges, intentResult);
        }
        return this.buildGenericResponse(nodes, edges);
    }
  }

  /**
   * Synthesize a response when the source is Gemini (for transparency).
   */
  buildFromGemini(answer: string, tempNodesCreated: number): string {
    const note =
      tempNodesCreated > 0
        ? `\n\n> 📝 *${tempNodesCreated} new knowledge node(s) stored for future reference.*`
        : '';
    return `${answer}${note}`;
  }

  // ── Intent-specific builders ────────────────────────────────

  private buildFactualResponse(
    nodes: GraphNode[],
    edges: GraphEdge[],
    intent: IntentResult
  ): string {
    if (nodes.length === 0) return 'No relevant information found.';

    // ── Single node (0-hop match — node itself was the answer) ───
    if (edges.length === 0) {
      const n = nodes[0];
      return `**${n.label}**${n.properties.description ? `\n\n${n.properties.description}` : ''}`;
    }

    // ── Follow the actual edge chain in traversal order ──────────
    // edges[i].from / edges[i].to are the real node IDs from the path.
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // 1-hop: single direct relationship (e.g. India → has_capital → New Delhi)
    if (edges.length === 1) {
      const edge = edges[0];
      const source = nodeById.get(edge.from);
      const target = nodeById.get(edge.to);
      if (source && target) {
        const relType = edge.type.replace(/_/g, ' ');
        return `**${source.label}** ${relType} **${target.label}**.${
          target.properties.description ? `\n\n${target.properties.description}` : ''
        }`;
      }
    }

    // Multi-hop: render each step in the chain
    const steps: string[] = [];
    for (const edge of edges) {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (from && to) {
        steps.push(`**${from.label}** → *(${edge.type.replace(/_/g, ' ')})* → **${to.label}**`);
      }
    }
    const finalNode = nodeById.get(edges[edges.length - 1].to);
    return steps.join('\n') + (finalNode?.properties.description ? `\n\n${finalNode.properties.description}` : '');
  }


  private buildConceptualResponse(
    nodes: GraphNode[],
    edges: GraphEdge[],
    intent: IntentResult
  ): string {
    const main = nodes[0];
    const parts: string[] = [`**${main.label}**`];

    if (main.properties.description) {
      parts.push(main.properties.description);
    }

    const related = nodes.slice(1).map((n) => n.label);
    if (related.length > 0) {
      parts.push(`\nRelated concepts: ${related.join(', ')}.`);
    }

    return parts.join('\n\n');
  }

  private buildMultiHopResponse(
    nodes: GraphNode[],
    edges: GraphEdge[],
    intent: IntentResult
  ): string {
    if (nodes.length < 2) return this.buildGenericResponse(nodes, edges);

    const steps: string[] = [];
    for (let i = 0; i < edges.length; i++) {
      const fromNode = nodes.find((n) => n.id === edges[i].from);
      const toNode = nodes.find((n) => n.id === edges[i].to);
      if (fromNode && toNode) {
        const rel = edges[i].type.replace(/_/g, ' ');
        steps.push(`**${fromNode.label}** → *(${rel})* → **${toNode.label}**`);
      }
    }

    return `**Multi-hop reasoning path:**\n\n${steps.join('\n')}${
      steps.length > 0
        ? `\n\n**Answer:** ${nodes[nodes.length - 1]?.label}`
        : ''
    }`;
  }

  private buildActionResponse(nodes: GraphNode[], intent: IntentResult): string {
    const actionNode = nodes.find((n) => n.type === 'Action');
    if (actionNode) {
      return `**Action triggered:** ${actionNode.label}\n\n${
        actionNode.properties.description || 'Action node found but no execution handler registered.'
      }`;
    }
    return `No action handler found for this request. Entities detected: ${intent.entities.join(', ')}.`;
  }

  private buildGenericResponse(nodes: GraphNode[], edges: GraphEdge[]): string {
    const labels = nodes.map((n) => `**${n.label}**`).join(', ');
    return `Found related knowledge: ${labels}.`;
  }

  // ── Metadata footer ─────────────────────────────────────────

  buildMetadataFooter(
    source: string,
    intent: string,
    confidence: number,
    latencyMs: number
  ): string {
    return `\n\n---\n*Source: ${source} | Intent: ${intent} | Confidence: ${(confidence * 100).toFixed(0)}% | Latency: ${latencyMs}ms*`;
  }
}

export const responseBuilder = new ResponseBuilder();
