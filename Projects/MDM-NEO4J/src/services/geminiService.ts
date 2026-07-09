import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { GraphNode, GraphEdge, createNode, createEdge } from '../schema/nodeSchema';
import { IntentResult } from '../schema/intentTypes';
import { logger, logGeminiFallback } from '../monitoring/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Gemini Service — Fallback LLM with structured response extraction
// ─────────────────────────────────────────────────────────────────────────────

export interface GeminiResponse {
  answer: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  confidence: number;
}

const SYSTEM_PROMPT = `You are a knowledge extraction assistant for a graph-based RAG system.
When answering a question:
1. Provide a clear, concise answer.
2. Extract key ENTITIES and FACTS as structured nodes.
3. Identify relationships between them as edges.

Respond in this JSON format:
{
  "answer": "The concise answer to the question",
  "nodes": [
    {"type": "Entity|Fact|Intent|Module|Action", "label": "Node label", "description": "brief description"},
    ...
  ],
  "edges": [
    {"fromLabel": "source node label", "toLabel": "target node label", "type": "has_capital|related_to|explains|part_of|located_in|has_fact"},
    ...
  ],
  "confidence": 0.0-1.0
}
Only include the JSON, no surrounding text.`;

export class GeminiService {
  private client: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private mockMode: boolean;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      logger.warn('GEMINI_API_KEY not set — running in mock mode');
      this.mockMode = true;
    } else {
      this.mockMode = false;
      this.client = new GoogleGenerativeAI(apiKey);
      this.model = this.client.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────

  async query(userQuery: string, intentResult: IntentResult): Promise<GeminiResponse> {
    if (this.mockMode) {
      return this.mockResponse(userQuery);
    }
    return this.liveQuery(userQuery, intentResult);
  }

  // ── Live Gemini call ────────────────────────────────────────

  private async liveQuery(
    userQuery: string,
    intentResult: IntentResult
  ): Promise<GeminiResponse> {
    const prompt = `${SYSTEM_PROMPT}\n\nQuestion: ${userQuery}\nDetected intent: ${intentResult.intent}\nEntities: ${intentResult.entities.join(', ')}`;

    try {
      const result = await this.model!.generateContent(prompt);
      const text = result.response.text().trim();
      const parsed = this.parseStructuredResponse(text, userQuery);
      logGeminiFallback(userQuery, parsed.nodes.length);
      return parsed;
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('401') || errStr.includes('403') || errStr.includes('API_KEY')) {
        logger.error('Gemini API key invalid or unauthorized — check GEMINI_API_KEY in .env', { err: errStr });
      } else {
        logger.error('Gemini API error', { err: errStr });
      }
      return this.mockResponse(userQuery);
    }
  }

  // ── Parse JSON from Gemini ──────────────────────────────────

  private parseStructuredResponse(text: string, query: string): GeminiResponse {
    let raw: any;
    try {
      // Strip markdown code fences if present
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      raw = JSON.parse(clean);
    } catch {
      logger.warn('Gemini response not valid JSON, using raw answer');
      return {
        answer: text,
        nodes: [],
        edges: [],
        confidence: 0.5,
      };
    }

    // Build GraphNode objects
    const nodeMap = new Map<string, GraphNode>();
    const nodes: GraphNode[] = (raw.nodes || []).map((n: any) => {
      const node = createNode(n.type || 'Fact', n.label || 'Unknown', {
        source: 'gemini',
        status: 'temp',
        confidence: raw.confidence || 0.7,
        description: n.description,
      });
      nodeMap.set(n.label, node);
      return node;
    });

    // Build GraphEdge objects
    const edges: GraphEdge[] = (raw.edges || [])
      .map((e: any) => {
        const fromNode = nodeMap.get(e.fromLabel);
        const toNode = nodeMap.get(e.toLabel);
        if (!fromNode || !toNode) return null;
        return createEdge(fromNode.id, toNode.id, e.type || 'related_to', {
          weight: raw.confidence || 0.7,
          evidence: `Gemini: ${query}`,
        });
      })
      .filter(Boolean) as GraphEdge[];

    return {
      answer: raw.answer || 'No answer extracted.',
      nodes,
      edges,
      confidence: raw.confidence || 0.7,
    };
  }

  // ── Mock mode (no API key) ──────────────────────────────────

  private mockResponse(query: string): GeminiResponse {
    logger.info('[MOCK] Gemini stub response', { query });

    const factNode = createNode('Fact', `Stub answer for: ${query}`, {
      source: 'gemini',
      status: 'temp',
      confidence: 0.6,
      description: `Mock response — set GEMINI_API_KEY for real answers`,
    });

    return {
      answer: `[MOCK] This is a stub answer for "${query}". Configure GEMINI_API_KEY for real responses.`,
      nodes: [factNode],
      edges: [],
      confidence: 0.6,
    };
  }
}

export const geminiService = new GeminiService();
