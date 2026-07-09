import 'dotenv/config';
import { graphService } from '../src/services/graphService';
import { embeddingService } from '../src/services/embeddingService';
import { createNode, createEdge } from '../src/schema/nodeSchema';
import { logger } from '../src/monitoring/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Seed Script — Neo4j MDM POC: Employee Hierarchy Network
//
// Models a realistic master data network (not a pure tree):
//  - Primary reporting lines (reports_to)
//  - Matrix / dotted-line reporting (matrix_reports_to)
//  - Transitional job shadowing (job_shadows)
//  - Leave coverage (covers_for)
//  - Department membership (belongs_to)
//
// See documentation/neo4j-poc-use-cases-and-seed-data.md
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  logger.info('Connecting to Neo4j for seeding...');
  await graphService.connect();
  logger.info('Seeding MDM employee hierarchy network...');

  // ── Leadership ──────────────────────────────────────────────────────────────

  const sarahChen = createNode('Entity', 'Sarah Chen', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Chief Executive Officer',
    metadata: { role: 'CEO', employeeId: 'E001', department: 'Executive' },
  });

  const jamesOkonkwo = createNode('Entity', 'James Okonkwo', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Vice President of Engineering',
    metadata: { role: 'VP Engineering', employeeId: 'E010', department: 'Engineering' },
  });

  const davidPark = createNode('Entity', 'David Park', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Vice President of Sales',
    metadata: { role: 'VP Sales', employeeId: 'E020', department: 'Sales' },
  });

  // ── Engineering team ────────────────────────────────────────────────────────

  const priyaSharma = createNode('Entity', 'Priya Sharma', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Director of Backend Engineering',
    metadata: { role: 'Director', employeeId: 'E101', department: 'Engineering' },
  });

  const mariaSantos = createNode('Entity', 'Maria Santos', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Director of Frontend Engineering',
    metadata: { role: 'Director', employeeId: 'E102', department: 'Engineering' },
  });

  const alexKim = createNode('Entity', 'Alex Kim', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Senior Backend Developer',
    metadata: { role: 'Senior Developer', employeeId: 'E201', department: 'Engineering' },
  });

  const jordanLee = createNode('Entity', 'Jordan Lee', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Frontend Developer — onboarding via job shadow program',
    metadata: { role: 'Developer', employeeId: 'E202', department: 'Engineering' },
  });

  // ── Sales team ──────────────────────────────────────────────────────────────

  const emilyWatson = createNode('Entity', 'Emily Watson', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Sales Manager — temporarily covering VP during leave',
    metadata: { role: 'Sales Manager', employeeId: 'E301', department: 'Sales' },
  });

  // ── Departments (master data reference nodes) ───────────────────────────────

  const engineeringDept = createNode('Entity', 'Engineering Department', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Product engineering organization',
    metadata: { type: 'Department', code: 'ENG' },
  });

  const salesDept = createNode('Entity', 'Sales Department', {
    source: 'seed', status: 'main', confidence: 1.0,
    description: 'Revenue and customer acquisition organization',
    metadata: { type: 'Department', code: 'SAL' },
  });

  // ── Upsert all nodes ────────────────────────────────────────────────────────

  const allNodes = [
    sarahChen, jamesOkonkwo, davidPark,
    priyaSharma, mariaSantos, alexKim, jordanLee,
    emilyWatson, engineeringDept, salesDept,
  ];

  for (const node of allNodes) {
    node.properties.embedding = await embeddingService.embed(
      `${node.label} ${node.properties.description || ''}`
    );
    await graphService.upsertNode(node);
    logger.info(`Seeded node: ${node.label} [${node.type}]`);
  }

  // ── Create edges ─────────────────────────────────────────────────────────────

  const edges = [
    // Primary reporting hierarchy (simple tree — left diagram in MDM literature)
    createEdge(jamesOkonkwo.id, sarahChen.id, 'reports_to', { weight: 1.0, evidence: 'Primary reporting line' }),
    createEdge(davidPark.id, sarahChen.id, 'reports_to', { weight: 1.0, evidence: 'Primary reporting line' }),
    createEdge(priyaSharma.id, jamesOkonkwo.id, 'reports_to', { weight: 1.0, evidence: 'Primary reporting line' }),
    createEdge(mariaSantos.id, jamesOkonkwo.id, 'reports_to', { weight: 1.0, evidence: 'Primary reporting line' }),
    createEdge(alexKim.id, priyaSharma.id, 'reports_to', { weight: 1.0, evidence: 'Primary reporting line' }),
    createEdge(jordanLee.id, mariaSantos.id, 'reports_to', { weight: 1.0, evidence: 'Primary reporting line' }),
    createEdge(emilyWatson.id, davidPark.id, 'reports_to', { weight: 1.0, evidence: 'Primary reporting line' }),

    // Network complexities (realistic graph — right diagram in MDM literature)
    createEdge(alexKim.id, mariaSantos.id, 'matrix_reports_to', {
      weight: 0.8,
      evidence: 'Cross-team platform initiative — dotted-line manager',
    }),
    createEdge(jordanLee.id, priyaSharma.id, 'job_shadows', {
      weight: 0.7,
      evidence: '90-day backend exposure during onboarding transition',
    }),
    createEdge(emilyWatson.id, davidPark.id, 'covers_for', {
      weight: 0.9,
      evidence: 'Temporary coverage while VP Sales on extended leave',
    }),

    // Department membership (master data grouping)
    createEdge(jamesOkonkwo.id, engineeringDept.id, 'belongs_to', { weight: 1.0 }),
    createEdge(priyaSharma.id, engineeringDept.id, 'belongs_to', { weight: 1.0 }),
    createEdge(mariaSantos.id, engineeringDept.id, 'belongs_to', { weight: 1.0 }),
    createEdge(alexKim.id, engineeringDept.id, 'belongs_to', { weight: 1.0 }),
    createEdge(jordanLee.id, engineeringDept.id, 'belongs_to', { weight: 1.0 }),
    createEdge(davidPark.id, salesDept.id, 'belongs_to', { weight: 1.0 }),
    createEdge(emilyWatson.id, salesDept.id, 'belongs_to', { weight: 1.0 }),
  ];

  for (const edge of edges) {
    await graphService.upsertEdge(edge);
  }

  logger.info(`Seeded ${allNodes.length} nodes and ${edges.length} edges`);

  await graphService.disconnect();
  console.log(`\n✅ MDM employee hierarchy seeded successfully!`);
  console.log(`   Nodes: ${allNodes.length}`);
  console.log(`   Edges: ${edges.length}`);
  console.log(`\n   Try querying:`);
  console.log(`   - "Who does Alex Kim report to?"`);
  console.log(`   - "Who is Alex Kim's skip-level manager?"`);
  console.log(`   - "Who does Alex Kim matrix report to?"`);
  console.log(`   - "Who is Jordan Lee job shadowing?"`);
  console.log(`   - "Show management chain from Alex Kim to Sarah Chen"\n`);
}

seed().catch((err) => {
  logger.error('Seed failed', { err: String(err) });
  process.exit(1);
});
