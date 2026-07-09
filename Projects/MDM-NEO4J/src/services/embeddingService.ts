import { logger } from '../monitoring/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Embedding Service
// Supports: "stub" (POC cosine-ready vectors), "ollama" (local LLM embedding)
// ─────────────────────────────────────────────────────────────────────────────

export type EmbeddingProvider = 'stub' | 'ollama';

const VECTOR_DIM = 384; // nomic-embed-text dimension

export class EmbeddingService {
  private provider: EmbeddingProvider;
  private ollamaUrl: string;
  private model: string;

  constructor() {
    this.provider = (process.env.EMBEDDING_PROVIDER as EmbeddingProvider) || 'stub';
    this.ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
  }

  // ── Public API ──────────────────────────────────────────────

  async embed(text: string): Promise<number[]> {
    if (this.provider === 'ollama') {
      return this.embedWithOllama(text);
    }
    return this.stubEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  // ── Cosine similarity ───────────────────────────────────────

  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  // ── Stub: deterministic pseudo-embedding from character codes ──

  private stubEmbed(text: string): number[] {
    const vec = new Array<number>(VECTOR_DIM).fill(0);
    const normalized = text.toLowerCase().trim();
    for (let i = 0; i < normalized.length; i++) {
      const code = normalized.charCodeAt(i);
      vec[i % VECTOR_DIM] += code / 255;
    }
    // L2 normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  // ── Ollama HTTP embedding ────────────────────────────────────

  private async embedWithOllama(text: string): Promise<number[]> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = (await res.json()) as { embedding: number[] };
      return data.embedding;
    } catch (err) {
      logger.warn('Ollama embedding failed, falling back to stub', { err: String(err) });
      return this.stubEmbed(text);
    }
  }
}

export const embeddingService = new EmbeddingService();
