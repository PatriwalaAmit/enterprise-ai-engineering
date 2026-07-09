import 'dotenv/config';
import { graphService } from '../src/services/graphService';
import { mergeCurator } from '../src/jobs/mergeCurator';
import { logger } from '../src/monitoring/logger';

async function runMerge() {
  await graphService.connect();
  const report = await mergeCurator.runMerge();
  console.log('\n📊 Merge Curator Report:');
  console.log(`   Promoted: ${report.promoted}`);
  console.log(`   Rejected: ${report.rejected}`);
  console.log(`   Pending:  ${report.remaining}`);
  console.log('\nDetails:');
  for (const d of report.details) {
    console.log(`  [${d.decision.toUpperCase().padEnd(8)}] ${d.label}: ${d.reason}`);
  }
  await graphService.disconnect();
}

runMerge().catch((err) => {
  logger.error('Merge run failed', { err: String(err) });
  process.exit(1);
});
