import { IntentType } from '../schema/intentTypes';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory metrics store (swap for Prometheus/InfluxDB in production)
// ─────────────────────────────────────────────────────────────────────────────

interface MetricsSummary {
  totalQueries: number;
  graphHits: number;
  geminiFallbacks: number;
  cacheHits: number;
  intentDistribution: Record<string, number>;
  avgLatencyMs: number;
  tempNodesCreated: number;
  tempNodesPromoted: number;
  errors: number;
  startedAt: Date;
}

class MetricsStore {
  private totalQueries = 0;
  private graphHits = 0;
  private geminiFallbacks = 0;
  private cacheHits = 0;
  private intentCounts: Record<string, number> = {};
  private totalLatencyMs = 0;
  private tempNodesCreated = 0;
  private tempNodesPromoted = 0;
  private errors = 0;
  private readonly startedAt = new Date();

  // ── Incrementors ────────────────────────────────────────────

  recordQuery(intent: IntentType, latencyMs: number, source: 'graph' | 'gemini' | 'cache') {
    this.totalQueries++;
    this.totalLatencyMs += latencyMs;
    this.intentCounts[intent] = (this.intentCounts[intent] || 0) + 1;

    if (source === 'graph') this.graphHits++;
    else if (source === 'gemini') this.geminiFallbacks++;
    else if (source === 'cache') this.cacheHits++;
  }

  recordTempNodes(count: number) {
    this.tempNodesCreated += count;
  }

  recordPromotion(count: number) {
    this.tempNodesPromoted += count;
  }

  recordError() {
    this.errors++;
  }

  // ── Summary ─────────────────────────────────────────────────

  getSummary(): MetricsSummary {
    return {
      totalQueries: this.totalQueries,
      graphHits: this.graphHits,
      geminiFallbacks: this.geminiFallbacks,
      cacheHits: this.cacheHits,
      intentDistribution: { ...this.intentCounts },
      avgLatencyMs:
        this.totalQueries > 0
          ? Math.round(this.totalLatencyMs / this.totalQueries)
          : 0,
      tempNodesCreated: this.tempNodesCreated,
      tempNodesPromoted: this.tempNodesPromoted,
      errors: this.errors,
      startedAt: this.startedAt,
    };
  }

  // ── Derived KPIs ────────────────────────────────────────────

  getGraphHitRate(): number {
    return this.totalQueries > 0
      ? this.graphHits / this.totalQueries
      : 0;
  }

  getGeminiCallReduction(): number {
    // Fraction of queries served without Gemini
    return this.totalQueries > 0
      ? (this.totalQueries - this.geminiFallbacks) / this.totalQueries
      : 0;
  }

  reset() {
    this.totalQueries = 0;
    this.graphHits = 0;
    this.geminiFallbacks = 0;
    this.cacheHits = 0;
    this.intentCounts = {};
    this.totalLatencyMs = 0;
    this.tempNodesCreated = 0;
    this.tempNodesPromoted = 0;
    this.errors = 0;
  }
}

// Singleton export
export const metrics = new MetricsStore();
