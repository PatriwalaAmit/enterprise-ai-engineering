import {
  IntentType,
  IntentResult,
  INTENT_KEYWORDS,
} from '../schema/intentTypes';
import { embeddingService, EmbeddingService } from './embeddingService';
import { logger } from '../monitoring/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Intent Detector — MoE-style routing via keyword + embedding similarity
// ─────────────────────────────────────────────────────────────────────────────

// Pre-computed stub embeddings for each intent prototype phrase
const INTENT_PROTOTYPES: Record<IntentType, string> = {
  [IntentType.INFORMATION_RETRIEVAL]: 'what is the capital tell me about factual information',
  [IntentType.CONCEPTUAL]: 'explain how does describe the concept difference between',
  [IntentType.MULTI_HOP]: 'leader of connected to relationship between belongs to skip-level manager reports to chain',
  [IntentType.ACTION]: 'set reminder create schedule book send execute run',
  [IntentType.AMBIGUOUS]: 'maybe both options could be either',
  [IntentType.KNOWLEDGE_UPDATE]: 'update correct the new value has changed now is',
  [IntentType.UNKNOWN]: 'unclassified other',
};

// Domain keyword hints
const DOMAIN_HINTS: Record<string, string[]> = {
  mdm: ['employee', 'report', 'manager', 'hierarchy', 'shadow', 'matrix', 'department', 'org'],
  geography: ['capital', 'country', 'city', 'located', 'region', 'state', 'india', 'delhi'],
  ai: ['model', 'llm', 'mixture of experts', 'neural', 'transformer', 'embedding'],
  politics: ['prime minister', 'president', 'party', 'government', 'election'],
  calendar: ['reminder', 'schedule', 'trip', 'meeting', 'appointment'],
};

export class IntentDetector {
  private prototypeEmbeddings: Map<IntentType, number[]> = new Map();
  private initialized = false;

  // ── Init: pre-compute prototype embeddings ──────────────────

  async init(): Promise<void> {
    if (this.initialized) return;
    logger.debug('Initializing intent prototype embeddings...');
    for (const [intent, phrase] of Object.entries(INTENT_PROTOTYPES)) {
      const vec = await embeddingService.embed(phrase);
      this.prototypeEmbeddings.set(intent as IntentType, vec);
    }
    this.initialized = true;
    logger.debug('Intent prototypes ready');
  }

  // ── Detect ──────────────────────────────────────────────────

  async detect(query: string): Promise<IntentResult> {
    await this.init();
    const lower = query.toLowerCase();

    // 1. Keyword scan (fast path)
    const keywordScores = this.keywordScan(lower);

    // 2. Embedding similarity
    const queryVec = await embeddingService.embed(lower);
    const embeddingScores = this.embeddingScan(queryVec);

    // 3. Blend scores (60% keyword, 40% embedding)
    const blended = this.blendScores(keywordScores, embeddingScores, 0.6, 0.4);

    // 4. Pick top intents
    const sorted = Object.entries(blended).sort(([, a], [, b]) => b - a);
    const [topIntent, topScore] = sorted[0];
    const secondaryIntents = sorted
      .slice(1, 3)
      .filter(([, s]) => s > 0.3)
      .map(([i]) => i as IntentType);

    // 5. Entity extraction
    const entities = this.extractEntities(query);

    // 6. Domain detection
    const domain = this.detectDomain(lower);

    // 7. MDM / multi-hop phrase override (before short-query fallback)
    let finalIntent = topIntent as IntentType;
    let finalEntities = entities;

    if (
      /skip[- ]?level|management chain|matrix report|job shadow|cover(s)? for/.test(lower)
    ) {
      finalIntent = IntentType.MULTI_HOP;
    } else if (
      /report(s)? to/.test(lower) ||
      (lower.includes('who does') && lower.includes('report'))
    ) {
      finalIntent = IntentType.MULTI_HOP;
    } else if (
      topIntent === IntentType.AMBIGUOUS ||
      (topScore < 0.2 && secondaryIntents && secondaryIntents.length > 0)
    ) {
      // Prefer MULTI_HOP or INFORMATION_RETRIEVAL over AMBIGUOUS when MDM context
      if (domain === 'mdm' || /manager|report|employee/.test(lower)) {
        finalIntent = /skip[- ]?level|chain|matrix|shadow|cover/.test(lower)
          ? IntentType.MULTI_HOP
          : IntentType.INFORMATION_RETRIEVAL;
      }
    }

    // 8. Short-query fallback:
    //    Single or two-word queries rarely match any keyword pattern but are almost
    //    always factual lookups (e.g. "Capital?", "India?", "MoE").
    //    Upgrade UNKNOWN → INFORMATION_RETRIEVAL and add all clean tokens as entities.
    const tokens = lower.split(/\s+/).filter((t) => t.length > 1);
    if (tokens.length <= 2 && (finalIntent === IntentType.UNKNOWN || topScore < 0.15)) {
      finalIntent = IntentType.INFORMATION_RETRIEVAL;
      // Add all cleaned tokens as entity hints for graph traversal
      const tokenEntities = tokens.map((t) => t.replace(/[^a-zA-Z'-]/g, '')).filter((t) => t.length > 1);
      finalEntities = [...new Set([...entities, ...tokenEntities])];
    }

    const result: IntentResult = {
      intent: finalIntent,
      confidence: Math.min(topScore, 1.0),
      secondaryIntents: secondaryIntents.length ? secondaryIntents : undefined,
      entities: finalEntities,
      domain,
    };

    logger.debug('Intent detected', { query, ...result });
    return result;
  }

  // ── Keyword scan ────────────────────────────────────────────

  private keywordScan(lower: string): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const intent of Object.values(IntentType)) {
      const keywords = INTENT_KEYWORDS[intent] || [];
      const hits = keywords.filter((kw) => lower.includes(kw)).length;
      scores[intent] = keywords.length > 0 ? hits / keywords.length : 0;
    }
    return scores;
  }

  // ── Embedding scan ──────────────────────────────────────────

  private embeddingScan(queryVec: number[]): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const [intent, protoVec] of this.prototypeEmbeddings.entries()) {
      scores[intent] = EmbeddingService.cosineSimilarity(queryVec, protoVec);
    }
    return scores;
  }

  // ── Score blending ──────────────────────────────────────────

  private blendScores(
    a: Record<string, number>,
    b: Record<string, number>,
    wA: number,
    wB: number
  ): Record<string, number> {
    const result: Record<string, number> = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      result[k] = (a[k] || 0) * wA + (b[k] || 0) * wB;
    }
    return result;
  }

  // ── Entity extraction (simple NER via capitalization + noun phrases) ──

  private extractEntities(query: string): string[] {
    const entities: string[] = [];

    // Multi-word proper names first (e.g. "Alex Kim")
    const fullNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = fullNamePattern.exec(query)) !== null) {
      entities.push(match[1]);
    }

    // Single capitalized tokens as fallback
    for (const token of query.split(/\s+/)) {
      const clean = token.replace(/[^a-zA-Z'-]/g, '');
      if (
        clean.length > 2 &&
        clean[0] === clean[0].toUpperCase() &&
        clean[0] !== clean[0].toLowerCase()
      ) {
        entities.push(clean);
      }
    }

    return [...new Set(entities)];
  }

  // ── Domain detection ────────────────────────────────────────

  private detectDomain(lower: string): string | undefined {
    for (const [domain, hints] of Object.entries(DOMAIN_HINTS)) {
      if (hints.some((h) => lower.includes(h))) return domain;
    }
    return undefined;
  }
}

export const intentDetector = new IntentDetector();
