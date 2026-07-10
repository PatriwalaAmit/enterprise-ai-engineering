# MDM Employee Hierarchy

**Final Case Study — Neo4j Proof of Concept**

| | |
|---|---|
| **Project** | MDM Employee Hierarchy Graph POC |
| **Source code** | [enterprise-ai-mdm-neo4j](https://github.com/PatriwalaAmit/enterprise-ai-mdm-neo4j) |
| **Status** | Proof of Concept — validated locally |
| **Admin UI** | http://localhost:3000 |
| **Neo4j Browser** | http://localhost:7474 |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem](#2-the-problem)
3. [Why Neo4j](#3-why-neo4j)
4. [Architecture & Implementation](#4-architecture--implementation)
5. [Data Model & Seed Network](#5-data-model--seed-network)
6. [Validation Use Cases](#6-validation-use-cases)
7. [How to Run](#7-how-to-run)
8. [How to Manage (User Guide)](#8-how-to-manage-user-guide)
9. [Challenges & Resolutions](#9-challenges--resolutions)
10. [Success Criteria](#10-success-criteria)
11. [Conclusion](#11-conclusion)
12. [Appendices](#12-appendices)

---

## 1. Executive Summary

We operate a **Master Data Management (MDM)** platform on a reliable relational database. Flat employee lookups work well, but **hierarchy maintenance and multi-hop queries** become expensive as org complexity grows — especially when employees participate in matrix reporting, job shadowing, and coverage relationships.

This POC validates **Neo4j** as a graph layer for MDM hierarchy networks. It seeds a realistic employee org chart, exposes a REST API and admin console, and demonstrates that relationship-heavy questions resolve via native graph traversal — with sub-200ms latency on local runs.

**Validated result:**

```json
POST /query  { "query": "Who is Alex Kim skip-level manager?" }

{
  "answer": "**Multi-hop reasoning path:**\n\n**Alex Kim** → *(reports to)* → **Priya Sharma**\n**Priya Sharma** → *(reports to)* → **James Okonkwo**\n\n**Answer:** James Okonkwo",
  "source": "graph",
  "intent": "MULTI_HOP",
  "confidence": 1,
  "latencyMs": 137
}
```

---

## 2. The Problem

### What already worked

Our existing MDM layer was reliable for structured lookups:

- Get employee by ID  
- Get employee by name  
- Get direct manager for an employee  

A **small** reporting hierarchy is easy enough to model in SQL:

```
                    [CEO]
                      │
            ┌─────────┴─────────┐
         [VP Eng]            [VP Sales]
            │                     │
      [Director]            [Manager]
            │
       [Developer]
```

### Where the relational model breaks down

As the employee population grows, **querying and maintaining hierarchy data gets expensive**. When an employee is **promoted**:

| Relational impact | Cost |
|---|---|
| Update `manager_id` on the employee row | 1 row |
| Rebuild closure table / hierarchy path rows | Potentially **every path** the employee participates in |
| Update matrix reporting join table | Multiple rows across reporting contexts |
| Invalidate cached org-chart snapshots | Application-level rebuild |

If that employee participates in **multiple hierarchies**, every relationship must be reset for every hierarchy in which they participate.

### Real-world hierarchies are networks, not trees

| Complexity | Example in seed data |
|---|---|
| **Matrix reporting** | Alex Kim `matrix_reports_to` Maria Santos |
| **Job shadowing** | Jordan Lee `job_shadows` Priya Sharma |
| **Coverage** | Emily Watson `covers_for` David Park |
| **Multiple branches** | Same employee linked to manager, department, and overlays |

```
         Sarah Chen (CEO)
              │
       James Okonkwo (VP Eng)───────┐
              │                     │ matrix_reports_to
     Priya Sharma (Dir BE)     Alex Kim ──────────────▶ Maria Santos (Dir FE)
              │
         Jordan Lee ──job_shadows──▶ Priya
```

The same principle applies beyond HR: **product listings, document relationships, sales territories, and customer hierarchies** are all master data networks — not clean trees.

We did not have a broken MDM platform. We had a **structural mismatch**: storing a **network** in a **table-first** model.

| Relational MDM | Graph MDM (Neo4j) |
|---|---|
| Single `manager_id` column | Multiple typed edges per employee |
| Closure table rebuild on promotion | Delete one edge, create one edge |
| Recursive CTE for skip-level | Native variable-length path traversal |
| Separate tables per relationship type | One node, many relationship types |

---

## 3. Why Neo4j

We evaluated recursive SQL (CTEs), closure tables, and graph databases. We chose **Neo4j** because its primary use case maps directly to MDM hierarchy networks:

> **Neo4j stores nodes and relationships as first-class citizens, making it natural to model, query, and maintain complex master data networks — including promotions, matrix lines, and transitional relationships — without resetting entire hierarchy tables.**

| Capability | MDM benefit |
|---|---|
| **Property graph model** | Employees and departments are nodes; `reports_to`, `matrix_reports_to`, `job_shadows` are typed edges |
| **Native traversal** | Skip-level manager, full chain to CEO — one Cypher path query |
| **Relationship-local updates** | Promotion = update one `reports_to` edge, not rebuild closure table |
| **Multiple relationship types** | Matrix, shadow, and coverage coexist on the same employee node |
| **Schema flexibility** | New relationship type without `ALTER TABLE` |
| **Visualization** | Neo4j Browser + Admin UI for data stewards |
| **MERGE semantics** | Idempotent master data loads via `npm run seed` |

### Scope

| In scope | Out of scope |
|---|---|
| Employee hierarchy traversal vs. relational JOINs/CTEs | Full MDM platform replacement |
| Matrix and transitional relationship queries | HRIS / Workday integration |
| Promotion scenario (single-edge rewire) | Enterprise Neo4j clustering |
| REST API + Admin UI + seed data | Proprietary product architecture |

---

## 4. Architecture & Implementation

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Admin UI   │────▶│  Query Pipeline  │────▶│   Neo4j     │
│  REST API   │     │  + Graph Service │     │  (Docker)   │
└─────────────┘     └────────┬─────────┘     └─────────────┘
                             │
                    Intent + Traversal
                    Options Resolver
                             │
                    ┌────────┴────────┐
                    │  Redis (cache)  │  optional — degrades gracefully
                    │  Gemini (LLM)   │  optional — fallback when graph misses
                    └─────────────────┘
```

**Stack:** Neo4j 5.x Community · Node.js 20+ · TypeScript · `neo4j-driver` · Express · Redis 7 · Docker Compose · static Admin UI (`public/`)

**Repository:** source code lives in **[enterprise-ai-mdm-neo4j](https://github.com/PatriwalaAmit/enterprise-ai-mdm-neo4j)**. There is no in-project `documentation/` folder — this case study is the consolidated reference.

### Implementation steps

| Step | Component | What it does |
|---|---|---|
| 1 | `docker-compose.yml` | Neo4j Bolt (`7687`) + Browser (`7474`) + Redis (`6379`); optional `app` service |
| 2 | `scripts/seedGraph.ts` | Loads 10 nodes + 17 MDM relationships via `MERGE` |
| 3 | `src/services/graphService.ts` | Cypher CRUD, entity traversal, edge-type filtering |
| 4 | `src/services/intentDetector.ts` | Routes MDM phrases to `MULTI_HOP` |
| 5 | `resolveTraversalOptions()` | Maps query phrasing → `minHops`, `maxHops`, `edgeTypes` |
| 6 | `src/pipeline/queryPipeline.ts` | Orchestrates: intent → traversal → response; Redis cache + Gemini fallback |
| 7 | `src/monitoring/` | Winston logging (`logs/`) and runtime query metrics |
| 8 | `src/jobs/mergeCurator.ts` | Cron job to promote high-confidence `temp` nodes to `main` |
| 9 | `public/` | Admin console — dashboard, query, graph, CRUD |

### Query-aware traversal

| Query pattern | `minHops` | Edge filter | Reason |
|---|---|---|---|
| `skip-level` | 2 | `reports_to` | Manager's manager — not self or direct manager |
| `report to` | 1 | `reports_to` | Direct manager |
| `matrix report` | 1 | `matrix_reports_to` | Dotted-line only |
| `job shadow` | 1 | `job_shadows` | Transitional only |
| `cover for` | 1 | `covers_for` | Coverage only |
| `management chain` | 1 | `reports_to` | Full chain up to CEO |

---

## 5. Data Model & Seed Network

### Node properties

| Property | Description |
|---|---|
| `id` | UUID (unique constraint) |
| `type` | `Entity` (Employee or Department) |
| `label` | Employee or department name |
| `status` | `main` (trusted) or `temp` (pending) |
| `metadata` | `employeeId`, `role`, `department`, etc. |

### Relationship types

| Edge type | Meaning | POC example |
|---|---|---|
| `reports_to` | Primary supervisory line | Alex Kim → Priya Sharma |
| `matrix_reports_to` | Dotted-line manager | Alex Kim → Maria Santos |
| `job_shadows` | Onboarding / transition | Jordan Lee → Priya Sharma |
| `covers_for` | Leave coverage | Emily Watson → David Park |
| `belongs_to` | Department membership | Alex Kim → Engineering Department |

### Org chart after seeding

```
                         Sarah Chen (CEO)
                               │
               ┌───────────────┴───────────────┐
        James Okonkwo (VP Eng)          David Park (VP Sales)
               │                               │
       ┌───────┴───────┐                       │
 Priya Sharma    Maria Santos              Emily Watson
  (Dir BE)        (Dir FE)               (covers_for ──▶ David)
       │               │
   Alex Kim        Jordan Lee
       │               │
       │               └──job_shadows──▶ Priya
       │
       └──matrix_reports_to──▶ Maria

Engineering Department ◀── belongs_to ── James, Priya, Maria, Alex, Jordan
Sales Department       ◀── belongs_to ── David, Emily
```

### Seed counts

| Category | Count |
|---|---|
| Employee nodes | 8 |
| Department nodes | 2 |
| **Total nodes** | **10** |
| `reports_to` | 7 |
| `matrix_reports_to` | 1 |
| `job_shadows` | 1 |
| `covers_for` | 1 |
| `belongs_to` | 7 |
| **Total edges** | **17** |

### Employees

| Label | Role | Employee ID |
|---|---|---|
| Sarah Chen | CEO | E001 |
| James Okonkwo | VP Engineering | E010 |
| David Park | VP Sales | E020 |
| Priya Sharma | Director Backend | E101 |
| Maria Santos | Director Frontend | E102 |
| Alex Kim | Senior Developer | E201 |
| Jordan Lee | Developer | E202 |
| Emily Watson | Sales Manager | E301 |

### Relationships (17 edges)

| From | Type | To |
|---|---|---|
| James Okonkwo | `reports_to` | Sarah Chen |
| David Park | `reports_to` | Sarah Chen |
| Priya Sharma | `reports_to` | James Okonkwo |
| Maria Santos | `reports_to` | James Okonkwo |
| Alex Kim | `reports_to` | Priya Sharma |
| Jordan Lee | `reports_to` | Maria Santos |
| Emily Watson | `reports_to` | David Park |
| Alex Kim | `matrix_reports_to` | Maria Santos |
| Jordan Lee | `job_shadows` | Priya Sharma |
| Emily Watson | `covers_for` | David Park |
| James, Priya, Maria, Alex, Jordan | `belongs_to` | Engineering Department |
| David, Emily | `belongs_to` | Sales Department |

---

## 6. Validation Use Cases

| ID | Test Query | Expected Result | Proves |
|---|---|---|---|
| UC-1 | Who does Alex Kim report to? | Priya Sharma | Single-hop manager lookup |
| UC-2 | Who is Alex Kim skip-level manager? | James Okonkwo | Multi-hop without recursive SQL |
| UC-3 | Who does Alex Kim matrix report to? | Maria Santos | Dotted-line reporting |
| UC-4 | Who is Jordan Lee job shadowing? | Priya Sharma | Transitional relationship |
| UC-5 | Show chain from Alex Kim to Sarah Chen | Alex → Priya → James → Sarah | Full management chain |
| UC-6 | Who does Emily Watson cover for? | David Park | Temporary coverage |
| UC-7 | Tell me about Alex Kim | Primary + matrix + department | Full employee network |

### UC-1: Direct Manager (~74ms)

```json
{
  "answer": "**Multi-hop reasoning path:**\n\n**Alex Kim** → *(reports to)* → **Priya Sharma**\n\n**Answer:** Priya Sharma",
  "source": "graph",
  "intent": "MULTI_HOP",
  "latencyMs": 74
}
```

```cypher
MATCH (emp:GraphNode {label: 'Alex Kim'})-[r:EDGE {type: 'reports_to'}]->(mgr:GraphNode)
RETURN emp.label, mgr.label
```

### UC-2: Skip-Level Manager (~137ms) — Core validation

```json
{
  "answer": "**Multi-hop reasoning path:**\n\n**Alex Kim** → *(reports to)* → **Priya Sharma**\n**Priya Sharma** → *(reports to)* → **James Okonkwo**\n\n**Answer:** James Okonkwo",
  "source": "graph",
  "intent": "MULTI_HOP",
  "latencyMs": 137
}
```

Traversal rule: `minHops: 2`, `edgeTypes: ['reports_to']` — prevents 0-hop self-match.

```cypher
MATCH path = (emp:GraphNode {label: 'Alex Kim'})-[:EDGE*2..4]->(mgr:GraphNode)
WHERE ALL(r IN relationships(path) WHERE r.type = 'reports_to')
RETURN [n IN nodes(path) | n.label] AS chain
ORDER BY length(path) ASC
LIMIT 1
```

### UC-3: Matrix Reporting

```cypher
MATCH (emp:GraphNode {label: 'Alex Kim'})-[r:EDGE {type: 'matrix_reports_to'}]->(mgr:GraphNode)
RETURN mgr.label, r.evidence
```

**Insight:** One employee, two valid manager relationships — impossible with a single `manager_id` FK.

### UC-4: Job Shadowing

```cypher
MATCH (emp:GraphNode {label: 'Jordan Lee'})-[r:EDGE {type: 'job_shadows'}]->(peer:GraphNode)
RETURN peer.label, r.evidence
```

Does not alter Jordan's primary `reports_to` line (Maria Santos).

### UC-5: Management Chain to CEO

```cypher
MATCH path = (emp:GraphNode {label: 'Alex Kim'})-[:EDGE*1..6]->(ceo:GraphNode {label: 'Sarah Chen'})
WHERE ALL(r IN relationships(path) WHERE r.type = 'reports_to')
RETURN [n IN nodes(path) | n.label] AS chain
```

### UC-6: Leave Coverage

```cypher
MATCH (emp:GraphNode {label: 'Emily Watson'})-[r:EDGE {type: 'covers_for'}]->(vp:GraphNode)
RETURN vp.label, r.evidence
```

### UC-7: Full Employee Network

| Type | Target |
|---|---|
| `reports_to` | Priya Sharma |
| `matrix_reports_to` | Maria Santos |
| `belongs_to` | Engineering Department |

### Promotion simulation (relationship rewire)

**Scenario:** Alex Kim promoted — new primary manager is James Okonkwo.

```cypher
MATCH (emp:GraphNode {label: 'Alex Kim'})-[old:EDGE {type: 'reports_to'}]->()
DELETE old;

MATCH (emp:GraphNode {label: 'Alex Kim'}), (mgr:GraphNode {label: 'James Okonkwo'})
MERGE (emp)-[r:EDGE]->(mgr)
SET r.type = 'reports_to', r.weight = 1.0, r.evidence = 'Promotion — new primary manager';
```

| Approach | Cost |
|---|---|
| **Graph** | 1 edge deleted, 1 edge created. Matrix/shadow unchanged |
| **Relational** | Row update + closure table rebuild across all hierarchies |

**After promotion:** skip-level becomes Sarah Chen (Alex → James → Sarah).

---

## 7. How to Run

Clone the project repository:

```bash
git clone https://github.com/PatriwalaAmit/enterprise-ai-mdm-neo4j.git
cd enterprise-ai-mdm-neo4j
docker compose up neo4j redis -d
cp .env.example .env
npm install
npm run seed
npm run dev
```

| Service | URL |
|---|---|
| **Admin UI** | http://localhost:3000 |
| **API info** | http://localhost:3000/api |
| **Neo4j Browser** | http://localhost:7474 (`neo4j` / `.env` password) |

> **Docker alternative:** `docker compose up -d` runs Neo4j, Redis, and the compiled app container together. See the [project README](https://github.com/PatriwalaAmit/enterprise-ai-mdm-neo4j#readme) for full setup details.

### Validation checklist

- [ ] `GET /graph/status` → 10 nodes, 17 edges  
- [ ] UC-1 → Priya Sharma (~74ms)  
- [ ] UC-2 → James Okonkwo (~137ms)  
- [ ] UC-3 → Maria Santos  
- [ ] UC-4 → Priya Sharma (job shadow)  
- [ ] UC-5 → 4-node chain to CEO  
- [ ] UC-6 → David Park (coverage)  
- [ ] Promotion rewires Alex → James in 2 steps  
- [ ] Neo4j Browser / Graph View shows full network  

### Reset & re-seed

```cypher
MATCH (n) DETACH DELETE n
```

```bash
npm run seed
```

---

## 8. How to Manage (User Guide)

### Admin UI tabs

| Tab | Use for |
|---|---|
| **Dashboard** | Stats, metrics, quick-query chips |
| **Query Explorer** | Ask questions, view path + latency |
| **Graph View** | Interactive org chart, filter by edge type |
| **Nodes** | Add / edit / promote / delete employees, change manager |
| **Relationships** | Add / delete any edge type |
| **Admin** | Merge curator, temp nodes, reset metrics |

### Add a new employee

1. **Nodes** → **+ Add Employee**  
2. Label (e.g. `Jane Doe`), Description (role), Type `Entity`, Status `main`  
3. **Relationships** → add `reports_to` → manager  
4. Optionally add `belongs_to` → department  

### Edit / delete

- **Nodes** → **Edit** → update name, description, status → **Save**  
- **Nodes** → **Delete** (removes node and connected edges)  

### Promote

| Meaning | How |
|---|---|
| **temp → main** (trust data) | **Nodes** → **Promote**, or **Admin** → **Run Merge Now** |
| **New manager** (reorg) | **Nodes** → **Change Manager** → select employee + new manager → **Reassign** |

Change Manager replaces only the `reports_to` edge. Matrix and shadow relationships stay.

### Change other relationships

| Goal | How |
|---|---|
| Dotted-line manager | **Relationships** → Add `matrix_reports_to` |
| Job shadowing | Add `job_shadows` |
| Leave coverage | Add `covers_for` |
| Assign department | Add `belongs_to` |
| Remove any link | **Relationships** → **Delete** |

### Run queries

1. **Query Explorer** → type or click a preset chip → **Run Query**  

| You want | Example |
|---|---|
| Direct manager | `Who does [Name] report to?` |
| Skip-level | `Who is [Name] skip-level manager?` |
| Matrix manager | `Who does [Name] matrix report to?` |
| Job shadow | `Who is [Name] job shadowing?` |
| Chain to CEO | `Show management chain from [Name] to Sarah Chen` |

| Result field | Meaning |
|---|---|
| `source: graph` | Answer from Neo4j |
| `intent` | `MULTI_HOP` for hierarchy walks |
| Path steps | Ordered relationship hops |
| **Answer:** | Terminal node (the person you asked for) |

After changing managers, always re-run the relevant query to validate.

### API quick reference

| Action | Method | Endpoint |
|---|---|---|
| Run query | POST | `/query` |
| Full graph | GET | `/admin/graph` |
| Add employee | POST | `/admin/nodes` |
| Edit employee | PUT | `/admin/node/:id` |
| Delete employee | DELETE | `/admin/node/:id` |
| Promote temp→main | POST | `/admin/promote/:id` |
| Change manager | POST | `/admin/reassign-manager` |
| Add relationship | POST | `/admin/edges` |
| Delete relationship | DELETE | `/admin/edge?from=&to=&type=` |
| Graph status | GET | `/graph/status` |

---

## 9. Challenges & Resolutions

| Challenge | What happened | Resolution |
|---|---|---|
| **Shortest-path trap** | Skip-level returned Alex Kim himself (0-hop) | Query-aware `minHops ≥ 2` on `reports_to` |
| **Wrong intent** | Query classified as `AMBIGUOUS` | MDM phrase overrides → `MULTI_HOP` |
| **Partial names** | `Alex` + `Kim` matched ambiguously | Full-name extraction + `prioritizeEntities()` |
| **Mixed edge types** | Traversal crossed matrix into reporting chain | Edge-type filter in Cypher |
| **Promotion at scale** | Relational closure rebuild is expensive | Graph: delete 1 edge, create 1 edge |
| **Cypher learning curve** | Teams think in tables | Admin UI + Neo4j Browser + SQL comparison |

---

## 10. Success Criteria

| Metric | Target | Status |
|---|---|---|
| Direct manager (UC-1) | < 100ms, Priya Sharma | ✅ ~74ms |
| Skip-level (UC-2) | < 200ms, James Okonkwo | ✅ ~137ms |
| Matrix (UC-3) | Maria Santos | ✅ Validated |
| Promotion rewire | Single edge update | ✅ Documented + UI |
| Network visualization | Full org in Browser / Graph View | ✅ 10 nodes, 17 edges |
| Seed reproducibility | Idempotent `npm run seed` | ✅ MERGE-based |
| Admin console | Manage employees & relationships | ✅ http://localhost:3000 |

---

## 11. Conclusion

Our existing MDM relational structure is **reliable for flat employee lookups** but **costly for network-shaped master data**.

This POC demonstrates that Neo4j addresses the core MDM hierarchy problem:

1. **Hierarchies are networks**, not pure trees — matrix, shadow, and coverage edges coexist naturally  
2. **Multi-hop queries are declarative** — skip-level manager is a 2-hop `reports_to` walk, not a recursive CTE  
3. **Promotions are localized** — rewire one edge instead of rebuilding closure tables  
4. **The pattern generalizes** — product, document, sales, and customer MDM share the same graph model  

**Recommended next step:** Hybrid architecture — relational DB for transactional employee records and audit; Neo4j for hierarchy network queries, org-chart visualization, and relationship-heavy MDM reads.

**Project repo:** [enterprise-ai-mdm-neo4j](https://github.com/PatriwalaAmit/enterprise-ai-mdm-neo4j) · [Projects index](../Projects/README.md)

---

## 12. Appendices

### A. Relational vs. Graph (Skip-Level Manager)

**Relational (recursive CTE):**

```sql
WITH RECURSIVE chain AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees WHERE name = 'Alex Kim'
  UNION ALL
  SELECT e.id, e.name, e.manager_id, c.depth + 1
  FROM employees e
  JOIN chain c ON e.id = c.manager_id
  WHERE c.depth < 5
)
SELECT name, depth FROM chain ORDER BY depth;
```

**Neo4j:**

```cypher
MATCH path = (emp:GraphNode {label: 'Alex Kim'})-[:EDGE*2..4]->(mgr:GraphNode)
WHERE ALL(r IN relationships(path) WHERE r.type = 'reports_to')
RETURN [n IN nodes(path) | n.label] AS chain
ORDER BY length(path) ASC
LIMIT 1
```

### B. Key source files

All paths are relative to the [enterprise-ai-mdm-neo4j](https://github.com/PatriwalaAmit/enterprise-ai-mdm-neo4j) repository root:

| File | Role |
|---|---|
| `scripts/seedGraph.ts` | MDM employee hierarchy seed data |
| `src/services/graphService.ts` | Neo4j driver, traversal, `resolveTraversalOptions()` |
| `src/services/intentDetector.ts` | MDM phrase → intent routing |
| `src/pipeline/queryPipeline.ts` | Query orchestration, Redis cache, Gemini fallback |
| `src/services/responseBuilder.ts` | Path → human-readable answer |
| `src/services/geminiService.ts` | Optional LLM fallback when graph has no match |
| `src/services/embeddingService.ts` | Embedding provider for temp-node enrichment |
| `src/schema/nodeSchema.ts` | MDM edge types and node factory |
| `src/schema/intentTypes.ts` | Intent and routing type definitions |
| `src/api/server.ts` | Express server, static UI, merge curator startup |
| `src/api/adminRoutes.ts` | CRUD + reassign-manager APIs |
| `src/jobs/mergeCurator.ts` | Cron-based temp → main promotion |
| `src/monitoring/logger.ts` | Winston file + console logging |
| `src/monitoring/metrics.ts` | Runtime query and graph metrics |
| `public/index.html` / `app.js` / `styles.css` | MDM Graph Console admin UI |
| `docker-compose.yml` | Neo4j, Redis, and optional app service |
| `.env.example` | Environment variable template |

### C. Project structure

```
enterprise-ai-mdm-neo4j/
├── public/                 # Admin UI
├── src/
│   ├── api/                # Express server + admin routes
│   ├── pipeline/           # Query orchestration
│   ├── services/           # Neo4j, intent, Gemini, embeddings
│   ├── schema/             # Node/edge types
│   ├── jobs/               # Merge curator
│   └── monitoring/         # Logger + metrics
├── scripts/
│   ├── seedGraph.ts
│   └── runMerge.ts
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

### D. Broader MDM applicability

| Domain | Nodes | Example relationships |
|---|---|---|
| **Employee hierarchy** | People, Departments | `reports_to`, `matrix_reports_to` |
| **Product catalog** | Products, Categories | `part_of`, `variant_of`, `substitutes` |
| **Document management** | Documents, Folders | `references`, `supersedes`, `derived_from` |
| **Sales / CRM** | Accounts, Contacts | `owns`, `influences`, `rolls_up_to` |

In each case, traditional hierarchies should be **reimagined as networks** — and graph databases like Neo4j are built to model them.
