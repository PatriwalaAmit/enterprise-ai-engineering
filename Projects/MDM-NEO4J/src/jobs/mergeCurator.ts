import 'dotenv/config';
import { CronJob } from 'cron';
import { graphService } from '../services/graphService';
import { logger, logMerge } from '../monitoring/logger';
import { metrics } from '../monitoring/metrics';

// ─────────────────────────────────────────────────────────────────────────────
// Merge Curator — Promotes temp → main nodes based on confidence + access rules
//
// Rules:
//  1. confidence >= MERGE_MIN_CONFIDENCE (default 0.75)
//  2. accessCount >= MERGE_MIN_ACCESS_COUNT (default 3)
//  3. Node has been in temp state for at least MIN_AGE_HOURS (default 1h)
//
// Rejection: temp nodes older than MAX_AGE_DAYS with no access → deleted
// ─────────────────────────────────────────────────────────────────────────────

const MIN_CONFIDENCE = parseFloat(process.env.MERGE_MIN_CONFIDENCE || '0.75');
const MIN_ACCESS_COUNT = parseInt(process.env.MERGE_MIN_ACCESS_COUNT || '3');
const MIN_AGE_HOURS = 1;
const MAX_AGE_DAYS = 7;

export interface MergeReport {
  promoted: number;
  rejected: number;
  remaining: number;
  timestamp: Date;
  details: Array<{
    nodeId: string;
    label: string;
    decision: 'promoted' | 'rejected' | 'pending';
    reason: string;
  }>;
}

export class MergeCurator {
  private job: CronJob | null = null;

  // ── Start scheduled cron ────────────────────────────────────

  start(): void {
    const schedule = process.env.MERGE_CRON_SCHEDULE || '*/30 * * * *';
    this.job = new CronJob(schedule, () => { void this.runMerge(); }, null, true, 'UTC');
    logger.info('Merge curator scheduled', { schedule });
  }

  stop(): void {
    this.job?.stop();
    logger.info('Merge curator stopped');
  }

  // ── Manual trigger ──────────────────────────────────────────

  async runMerge(): Promise<MergeReport> {
    logger.info('Merge curator run started');
    const now = new Date();

    const tempNodes = await graphService.getTempNodes(0);
    logger.info(`Found ${tempNodes.length} temp nodes to evaluate`);

    const report: MergeReport = {
      promoted: 0,
      rejected: 0,
      remaining: 0,
      timestamp: now,
      details: [],
    };

    for (const node of tempNodes) {
      const nodeAge = node.properties.timestamp
        ? (now.getTime() - new Date(node.properties.timestamp).getTime()) / (1000 * 60 * 60)
        : 0;

      const confidence = node.properties.confidence ?? 0;
      const accessCount = node.properties.accessCount ?? 0;
      const ageHours = nodeAge;
      const ageDays = ageHours / 24;

      // ── Rule 1: Promote ──────────────────────────────────────
      if (
        confidence >= MIN_CONFIDENCE &&
        accessCount >= MIN_ACCESS_COUNT &&
        ageHours >= MIN_AGE_HOURS
      ) {
        await graphService.promoteToMain(node.id);
        report.promoted++;
        metrics.recordPromotion(1);
        report.details.push({
          nodeId: node.id,
          label: node.label,
          decision: 'promoted',
          reason: `confidence=${confidence.toFixed(2)}, accessCount=${accessCount}`,
        });
        continue;
      }

      // ── Rule 2: Reject (stale low-quality node) ──────────────
      if (ageDays > MAX_AGE_DAYS && accessCount < MIN_ACCESS_COUNT) {
        await graphService.deleteNode(node.id);
        report.rejected++;
        report.details.push({
          nodeId: node.id,
          label: node.label,
          decision: 'rejected',
          reason: `stale: age=${ageDays.toFixed(1)}d, accessCount=${accessCount}`,
        });
        continue;
      }

      // ── Pending ──────────────────────────────────────────────
      report.remaining++;
      report.details.push({
        nodeId: node.id,
        label: node.label,
        decision: 'pending',
        reason: `confidence=${confidence.toFixed(2)}, accessCount=${accessCount}, age=${ageHours.toFixed(1)}h`,
      });
    }

    logMerge(report.promoted, report.rejected);
    logger.info('Merge curator complete', {
      promoted: report.promoted,
      rejected: report.rejected,
      remaining: report.remaining,
    });

    return report;
  }
}

export const mergeCurator = new MergeCurator();
