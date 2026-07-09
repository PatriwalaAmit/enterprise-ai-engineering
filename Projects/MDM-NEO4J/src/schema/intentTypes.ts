// ─────────────────────────────────────────────────────────────────────────────
// Intent Types — MoE-style routing classification
// ─────────────────────────────────────────────────────────────────────────────

export enum IntentType {
  /** Simple factual lookup — expects a direct graph hit (UC1) */
  INFORMATION_RETRIEVAL = 'INFORMATION_RETRIEVAL',

  /** Conceptual/explanatory questions — often triggers Gemini fallback (UC2) */
  CONCEPTUAL = 'CONCEPTUAL',

  /** Multi-hop reasoning across connected nodes (UC3) */
  MULTI_HOP = 'MULTI_HOP',

  /** Triggers an action node (reminder, command, etc.) (UC4) */
  ACTION = 'ACTION',

  /** Multiple possible intents — routed to disambiguation (UC5) */
  AMBIGUOUS = 'AMBIGUOUS',

  /** Knowledge update / correction request (UC6) */
  KNOWLEDGE_UPDATE = 'KNOWLEDGE_UPDATE',

  /** Unclassified — falls through to Gemini */
  UNKNOWN = 'UNKNOWN',
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent Detection Result
// ─────────────────────────────────────────────────────────────────────────────

export interface IntentResult {
  /** Primary detected intent */
  intent: IntentType;
  /** Confidence score 0–1 */
  confidence: number;
  /** Secondary intents if ambiguous */
  secondaryIntents?: IntentType[];
  /** Extracted entities from the query */
  entities: string[];
  /** Detected domain/module hint (e.g. "geography", "ai", "calendar") */
  domain?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent Routing Configuration
// Maps intents to routing strategies
// ─────────────────────────────────────────────────────────────────────────────

export interface IntentRoutingConfig {
  intent: IntentType;
  /** Try graph traversal first */
  tryGraph: boolean;
  /** Fall back to Gemini if graph miss */
  allowGeminiFallback: boolean;
  /** Create temp nodes from Gemini response */
  createTempNodes: boolean;
  /** Execute action nodes if found */
  executeActions: boolean;
}

export const INTENT_ROUTING_MAP: Record<IntentType, IntentRoutingConfig> = {
  [IntentType.INFORMATION_RETRIEVAL]: {
    intent: IntentType.INFORMATION_RETRIEVAL,
    tryGraph: true,
    allowGeminiFallback: true,
    createTempNodes: true,
    executeActions: false,
  },
  [IntentType.CONCEPTUAL]: {
    intent: IntentType.CONCEPTUAL,
    tryGraph: true,
    allowGeminiFallback: true,
    createTempNodes: true,
    executeActions: false,
  },
  [IntentType.MULTI_HOP]: {
    intent: IntentType.MULTI_HOP,
    tryGraph: true,
    allowGeminiFallback: true,
    createTempNodes: true,
    executeActions: false,
  },
  [IntentType.ACTION]: {
    intent: IntentType.ACTION,
    tryGraph: true,
    allowGeminiFallback: false,
    createTempNodes: false,
    executeActions: true,
  },
  [IntentType.AMBIGUOUS]: {
    intent: IntentType.AMBIGUOUS,
    tryGraph: true,
    allowGeminiFallback: true,
    createTempNodes: false,
    executeActions: false,
  },
  [IntentType.KNOWLEDGE_UPDATE]: {
    intent: IntentType.KNOWLEDGE_UPDATE,
    tryGraph: false,
    allowGeminiFallback: false,
    createTempNodes: true,
    executeActions: false,
  },
  [IntentType.UNKNOWN]: {
    intent: IntentType.UNKNOWN,
    tryGraph: true,          // Always try graph — even unknown queries may match entities
    allowGeminiFallback: true,
    createTempNodes: true,
    executeActions: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Keyword hint maps used by IntentDetector
// ─────────────────────────────────────────────────────────────────────────────

export const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  [IntentType.INFORMATION_RETRIEVAL]: [
    'what is', 'who is', 'where is', 'when is', 'capital of',
    'population of', 'define', 'tell me about', 'what are',
  ],
  [IntentType.CONCEPTUAL]: [
    'explain', 'how does', 'describe', 'why does', 'concept of',
    'difference between', 'compare', 'understand',
  ],
  [IntentType.MULTI_HOP]: [
    'leader of', 'capital and', 'party of', 'belongs to',
    'relationship between', 'connected to',
    'skip-level', 'skip level', 'management chain', 'matrix report',
    'job shadow', 'reports to', 'report to', 'cover for', 'covers for',
  ],
  [IntentType.ACTION]: [
    'set reminder', 'create', 'schedule', 'book', 'send',
    'delete', 'update', 'execute', 'run',
  ],
  [IntentType.AMBIGUOUS]: [],
  [IntentType.KNOWLEDGE_UPDATE]: [
    'update', 'correct', 'the new', 'has changed', 'now is',
  ],
  [IntentType.UNKNOWN]: [],
};
