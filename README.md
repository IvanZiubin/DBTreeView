# Tree Editor with a Local Cache

Two tree views over a PostgreSQL tree of arbitrary depth: **DBTreeView** lazy-loads the database tree;
**CachedTreeView** (stages 3-4) holds individually loaded nodes and keeps edits/adds/deletes pending until **Apply**.
**Reset** restores the sample data. Spec: [task.md](task.md).

> Status: stage 3 of 4 - DBTreeView, Load into cache with hierarchy assembly, Apply endpoint and Reset work; editing in the cache UI arrives in stage 4.

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

Host ports are overridable: `DB_PORT` (default 5432), `API_PORT` (8080), `UI_PORT` (3000), e.g. `API_PORT=18080 docker compose up --build`.

## Tests

```bash
cd backend && dotnet test TreeEditor.sln
```

Docker is required: tests start a `postgres:16` container via Testcontainers (random port, so a running compose stack does not conflict). The DB is reset to the seed before every test.

Frontend unit tests (Vitest, pure modules and the Pinia store, no browser):

```bash
cd frontend && source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm test
```

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
| POST | `/api/nodes/apply` | Apply a batch of edits / adds / deletes in one transaction |

### Apply

`POST /api/nodes/apply` takes `{edits, adds, deletes, refreshIds?}` and runs everything in one transaction (all or nothing).
Adds carry client temp ids (`parentId` or `parentTempId`); the response `idMap` maps each temp id to its real id, and `nodes`
holds the post-apply state of every edited / deleted / created / refresh id. Deletes soft-delete the node and all descendants
(recursive CTE, also never-loaded ones) and are idempotent. Errors: 400 invalid body (field errors keyed by JSON path, checked
before any DB access), 404 referenced node missing, 409 edit of / add under an already-deleted node (404 wins over 409).

Concurrency: Apply, Reset and the startup seed take the transaction-scoped advisory lock `pg_advisory_xact_lock(4242)` first,
so tree writes are serialized and a deleted parent can never gain a live child.

### Cache hierarchy rule (UI)

CachedTreeView stores loaded nodes flat; the tree is derived on every change. A node is shown under its **nearest cached ancestor**
(from `ancestorIds`); if some ancestors between them are not cached, a muted dashed "..." gap marker with a tooltip lists the
missing levels. Nodes with no cached ancestor are top-level. Loading a missing parent later re-parents the children automatically.

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

- **Soft delete with cascade:** nodes get `is_deleted = true` (also all descendants, including never-loaded ones); deleted nodes are still returned by reads. Implemented by Apply (stage 3).
- **Immutable parent:** a node's parent never changes (enforced by trigger), so ancestry is stable and cache hierarchy assembly is safe.
- **Same-origin `/api` proxy, no CORS:** nginx (container) and the Vite dev server proxy `/api` to the API; no CORS configuration exists.
- **Reset semantics:** one transaction: `TRUNCATE ... RESTART IDENTITY`, re-insert the seed with fixed ids, set the sequence so the next id is 31. The client also clears its cache.
- **Fixed seed ids:** deterministic ids make tests and reset reproducible.
