# Tree Editor with a Local Cache

Two tree views over a PostgreSQL tree of arbitrary depth: **DBTreeView** lazy-loads the database tree;
**CachedTreeView** (stages 3-4) holds individually loaded nodes and keeps edits/adds/deletes pending until **Apply**.
**Reset** restores the sample data. Spec: [task.md](task.md).

> Status: stage 2 of 4 - DBTreeView, API, seed and Reset work; cache editing arrives in stages 3-4.

## Quick start

```bash
docker compose up --build
```

| Service | URL / port |
|---|---|
| UI | http://localhost:3000 |
| API | http://localhost:8080 (also reachable as http://localhost:3000/api) |
| PostgreSQL | localhost:5432, db `treeeditor`, user `tree`, password `tree` |

Prerequisite: Docker. For local development also .NET 8 SDK and Node 22.

## Tests

```bash
cd backend && dotnet test TreeEditor.sln
```

Docker is required: tests start a `postgres:16` container via Testcontainers (random port, so a running compose stack does not conflict). The DB is reset to the seed before every test.

## Local development

```bash
docker compose up -d db                              # database only
cd backend && dotnet run --project src/TreeEditor.Api   # API on :8080 (Development), stop the api container first
cd frontend && npm install && npm run dev            # UI on :5173, Vite proxies /api -> http://localhost:8080
```

## API

Full contract: [docs/ai/api-contract.yaml](docs/ai/api-contract.yaml). Errors are RFC 7807 `application/problem+json`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness + DB connectivity (200 / 503) |
| GET | `/api/nodes/roots` | Root nodes, ordered by id |
| GET | `/api/nodes/{id}/children` | Direct children (404 if node missing) |
| GET | `/api/nodes/{id}` | Node with `ancestorIds` (root -> parent) (404 if missing) |
| POST | `/api/reset` | Restore seed, returns roots |
| POST | `/api/nodes/apply` | Stage 2: returns 501; implemented in stage 3 |

## Database schema

Table `nodes`:

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | primary key `pk_nodes`, identity by default |
| `parent_id` | bigint, nullable | FK `fk_nodes_parent` -> `nodes.id`, ON DELETE RESTRICT; NULL for roots |
| `value` | varchar(200) | check `ck_nodes_value_length` (1..200 chars) |
| `is_deleted` | boolean | soft-delete flag |

- Check `ck_nodes_parent_not_self`: `parent_id IS NULL OR parent_id <> id`.
- Index `ix_nodes_parent_id_id` on `(parent_id, id)` serves "children of X ordered by id".
- Trigger `trg_nodes_parent_immutable` (BEFORE UPDATE OF parent_id) rejects any parent change (SQLSTATE 23514).

### Tree model

Adjacency list (`parent_id`) plus recursive CTEs (raw SQL) for ancestors (and, from stage 3, subtree soft-delete).
It keeps writes trivial (adding a node inserts one row; parents never move), lazy child loading is a single indexed lookup, and
arbitrary depth works without extra bookkeeping. Nested sets / materialized path / closure table speed up subtree reads but
make inserts and deletes rewrite many rows, which is unnecessary here. Rationale:
[docs/plans/stage-2-backend.md](docs/plans/stage-2-backend.md#decision-record-1--tree-storage-model).

### Seed

3 roots (Electronics, Books, Home and Garden), 30 nodes, 5 levels, fixed ids 1..30 (every parent id is lower than its child's).
Defined in `backend/src/TreeEditor.Api/Data/SeedData.cs`; inserted on startup if the table is empty.

## Key decisions

- **Soft delete with cascade:** nodes get `is_deleted = true` (also all descendants, including never-loaded ones); deleted nodes are still returned by reads. Cascade arrives in stage 3.
- **Immutable parent:** a node's parent never changes (enforced by trigger), so ancestry is stable and cache hierarchy assembly is safe.
- **Same-origin `/api` proxy, no CORS:** nginx (container) and the Vite dev server proxy `/api` to the API; no CORS configuration exists.
- **Reset semantics:** one transaction: `TRUNCATE ... RESTART IDENTITY`, re-insert the seed with fixed ids, set the sequence so the next id is 31. The client also clears its cache.
- **Fixed seed ids:** deterministic ids make tests and reset reproducible.
