# MDM Graph Console — Neo4j Employee Hierarchy POC

A proof-of-concept for validating **Neo4j** as a graph layer for **Master Data Management (MDM)** employee hierarchy networks. The project demonstrates why relationship-heavy org data (reporting lines, matrix management, job shadowing, coverage) is better modeled and queried as a graph than as flat relational tables.

Includes a **REST API**, **web admin console**, and seeded employee org chart for end-to-end testing.

---

## Why This POC Exists

Traditional MDM stores employees in normalized tables with a single `manager_id`. That works for small hierarchies but breaks down when:

- Employees report to **multiple managers** (matrix / dotted-line)
- **Transitional relationships** exist (job shadowing, leave coverage)
- **Promotions** require resetting paths across every hierarchy an employee participates in
- **Multi-hop queries** (skip-level manager, chain to CEO) need recursive SQL or closure tables

Neo4j treats relationships as first-class data. This POC validates that approach with a realistic org network and measurable query latency.

---

## Features

| Capability | Description |
|---|---|
| **Graph-backed queries** | Natural-language MDM questions resolved via Cypher traversal |
| **Admin UI** | Dashboard, query explorer, graph visualization, CRUD |
| **Employee management** | Add, edit, delete, promote (`temp` → `main`) |
| **Manager reassignment** | One-click promotion / reorg (`reports_to` rewire) |
| **Relationship types** | `reports_to`, `matrix_reports_to`, `job_shadows`, `covers_for`, `belongs_to` |
| **Merge curator** | Cron job to promote high-confidence temp nodes |
| **Gemini fallback** | Optional LLM path when graph has no answer (enriches graph over time) |

---

## Tech Stack

- **Runtime:** Node.js 20+ · TypeScript  
- **Graph DB:** Neo4j 5.x Community (Docker)  
- **API:** Express · Zod validation  
- **Cache:** Redis 7 (optional, degrades gracefully)  
- **LLM:** Google Gemini 1.5 Flash (optional fallback)  
- **UI:** Static admin console (`public/`)

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) (for Neo4j and Redis)

### 1. Clone and install

```bash
git clone <repository-url>
cd NodebaseLLM
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` if needed. Defaults work for local Docker setup.

### 3. Start infrastructure

```bash
docker compose up neo4j redis -d
```

Wait ~30 seconds for Neo4j to become healthy.

| Service | URL |
|---|---|
| Neo4j Browser | http://localhost:7474 |
| Bolt | `bolt://localhost:7687` |
| Redis | `redis://localhost:6379` |

Neo4j login: `neo4j` / value of `NEO4J_PASSWORD` in `.env`

### 4. Seed sample org data

```bash
npm run seed
```

Loads **10 nodes** and **17 relationships** (employees, departments, reporting network).

### 5. Start the application

```bash
npm run dev
```

| Endpoint | URL |
|---|---|
| **Admin UI** | http://localhost:3000 |
| **API info** | http://localhost:3000/api |
| **Graph status** | http://localhost:3000/graph/status |

---

## Try It

### Admin UI

Open http://localhost:3000 and use the sidebar:

- **Dashboard** — stats and quick-query chips  
- **Query Explorer** — run MDM questions  
- **Graph View** — interactive org chart  
- **Nodes** — add / edit / promote employees, change manager  
- **Relationships** — manage edges  
- **Admin** — merge curator, temp nodes  

### Example queries

```
Who does Alex Kim report to?
Who is Alex Kim skip-level manager?
Who does Alex Kim matrix report to?
Who is Jordan Lee job shadowing?
Show management chain from Alex Kim to Sarah Chen
```

### API (PowerShell)

```powershell
Invoke-RestMethod -Uri http://localhost:3000/query -Method POST `
  -ContentType "application/json" `
  -Body '{"query": "Who is Alex Kim skip-level manager?", "includeMetadata": true}'
```

### Expected result (skip-level)

```json
{
  "answer": "**Multi-hop reasoning path:**\n\n**Alex Kim** → *(reports to)* → **Priya Sharma**\n**Priya Sharma** → *(reports to)* → **James Okonkwo**\n\n**Answer:** James Okonkwo",
  "source": "graph",
  "intent": "MULTI_HOP",
  "latencyMs": 137
}
```

---

## NPM Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start API + UI with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run seed` | Load MDM employee hierarchy into Neo4j |
| `npm run merge` | Manually run temp → main merge curator |
| `npm run typecheck` | TypeScript validation |

---

## API Overview

### Query

```
POST /query
{ "query": "string", "includeMetadata": true }
```

### Graph status

```
GET /graph/status
```

### Admin

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/graph` | Full nodes + edges for UI |
| GET | `/admin/nodes` | List all nodes |
| POST | `/admin/nodes` | Create employee / node |
| PUT | `/admin/node/:id` | Update node |
| DELETE | `/admin/node/:id` | Delete node |
| POST | `/admin/edges` | Create relationship |
| DELETE | `/admin/edge?from=&to=&type=` | Delete relationship |
| POST | `/admin/reassign-manager` | Change primary `reports_to` |
| POST | `/admin/promote/:id` | Promote temp → main |
| POST | `/admin/merge` | Run merge curator |
| GET | `/admin/stats` | Graph + runtime metrics |

---

## Seed Data (POC Org Chart)

**Primary reporting:**

```
Sarah Chen (CEO)
├── James Okonkwo (VP Engineering)
│   ├── Priya Sharma (Director Backend) → Alex Kim
│   └── Maria Santos (Director Frontend) → Jordan Lee
└── David Park (VP Sales) → Emily Watson
```

**Network overlays:**

| Employee | Relationship | Target |
|---|---|---|
| Alex Kim | `matrix_reports_to` | Maria Santos |
| Jordan Lee | `job_shadows` | Priya Sharma |
| Emily Watson | `covers_for` | David Park |

---

## Project Structure

```
NodebaseLLM/
├── public/                 # Admin UI (HTML, CSS, JS)
├── src/
│   ├── api/                # Express server + admin routes
│   ├── pipeline/           # Query orchestration
│   ├── services/           # Neo4j, intent, Gemini, embeddings
│   ├── schema/             # Node/edge types
│   └── jobs/               # Merge curator cron
├── scripts/
│   ├── seedGraph.ts        # MDM seed data
│   └── runMerge.ts         # Manual merge trigger
├── documentation/          # Case study, use cases, user guide
├── docker-compose.yml      # Neo4j + Redis
└── .env.example
```

---

## Documentation

| Document | Description |
|---|---|
| **[MDM-Employee-Hierarchy.md](documentation/MDM-Employee-Hierarchy.md)** | **Final consolidated case study** — problem, Neo4j, use cases, seed data, user guide |
| [neo4j-poc-case-study.md](documentation/neo4j-poc-case-study.md) | Detailed case study (source) |
| [neo4j-poc-use-cases-and-seed-data.md](documentation/neo4j-poc-use-cases-and-seed-data.md) | Validation use cases + seed reference |
| [neo4j-poc-user-guide.md](documentation/neo4j-poc-user-guide.md) | How to add users, promote, change managers, run queries |
| [07-setup-guide.md](documentation/07-setup-guide.md) | Detailed setup instructions |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API + UI port |
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j Bolt connection |
| `NEO4J_PASSWORD` | `graphbos2026` | Neo4j password |
| `REDIS_URL` | `redis://localhost:6379` | Cache (optional) |
| `GEMINI_API_KEY` | — | Enables LLM fallback when set |
| `EMBEDDING_PROVIDER` | `stub` | `stub` or `ollama` |
| `MERGE_CRON_SCHEDULE` | `*/30 * * * *` | Temp → main merge interval |

---

## Production Build

```bash
npm run build
npm start
```

Ensure Neo4j and Redis are running and `.env` is configured before starting.

---

## License

Internal POC — not licensed for public distribution unless otherwise specified.
