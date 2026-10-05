# Tree Editor with a Local Cache

Two tree views over a PostgreSQL tree of arbitrary depth: **DBTreeView** lazy-loads the database tree;
**CachedTreeView** holds individually loaded nodes and keeps edits/adds/deletes pending until **Apply**.
**Reset** restores the sample data. Spec: [task.md](task.md).

> Status: complete (stages 1–4) — DBTreeView, cache with hierarchy assembly, pending edit / add / delete until Apply, Apply and Reset all work. Stage 5 (UI restyle) is planned.

## Quick start

```bash
docker compose up --build
```

| Service | URL / port |
|---|---|
| UI | http://localhost:3000 |
| API | http://localhost:8080 (also reachable as http://localhost:3000/api) |
| PostgreSQL | localhost:5432, db `treeeditor`, user `tree`, password `tree` |

On first start the API applies the EF migration and seeds the sample tree automatically (retrying until the DB is ready); the Reset button (`POST /api/reset`) restores it at any time.

Prerequisite: Docker. For local development also .NET 8 SDK and Node 22.

Host ports are overridable: `DB_PORT` (default 5432), `API_PORT` (8080), `UI_PORT` (3000), e.g. `API_PORT=18080 docker compose up --build`.

## Using the UI

Select a DB node, then **Load into cache**. In the cache select a node and use **Edit / Add child / Delete**; changes are tagged
new / edited / to delete and stay local until **Apply**, which sends one transactional batch. **Reset** restores the sample data
and clears the cache.

### Cache behaviour

- **Hierarchy:** flat node map; each node is shown under its nearest cached ancestor (`ancestorIds` from `GET /api/nodes/{id}`); a "…" marker stands for levels that are not loaded.
- **Pending changes:** temp ids `tmp-<n>` (also for children of new nodes), mapped to real ids from the apply response `idMap`. Delete cascades to every cached descendant immediately and to never-loaded descendants in the DB on Apply. Nodes loaded later under a node marked for deletion are shown as to delete; deleted / to-delete nodes cannot be edited.
- **Edge cases:** edits and new children under a node marked for deletion are not sent (they would end up deleted anyway). After Apply every cached node is refreshed (`refreshIds`) so cascaded deletions show without reloading. A failed Apply keeps all pending changes.

## Tests

```bash
cd backend && dotnet test TreeEditor.sln
```

Docker is required: tests start a `postgres:16` container via Testcontainers (random port, so a running compose stack does not conflict). The DB is reset to the seed before every test.

Integration tests cover reads, Reset, every Apply rule (validation, 404/409, cascade, atomic rollback, concurrency) and the stage-4 cache flows (client-shaped batches, stale cache 409, id mapping across applies).

Frontend tests (Vitest, Node env: hierarchy, pending-change logic, stores with mocked API, PrimeVue pin guard):

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
(recursive CTE, also never-loaded ones) and are idempotent. Order inside the transaction is adds (parents first) -> edits -> cascade deletes, so an edit/add under a node deleted in the same batch ends deleted. Errors: 400 invalid body (field errors keyed by JSON path, checked
before any DB access), 404 referenced node missing, 409 edit of / add under an already-deleted node (404 wins over 409).

The cache sends every real id it holds in `refreshIds`, so cascaded deletes of cached descendants come back in the same response (the server never enumerates whole subtrees).

409 means the cache is stale (another client deleted the node or an ancestor): nothing is persisted, `nodeIds` lists the offending ids, and pending changes stay in the cache.

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

### Writes and consistency

Apply, Reset and the startup seed take the transaction-scoped advisory lock `pg_advisory_xact_lock(4242)` as their first statement, so tree writes are serialized; Apply also locks referenced rows with `SELECT ... FOR UPDATE`. Invariant: no live node has a deleted parent — check with `SELECT count(*) FROM nodes c JOIN nodes p ON p.id = c.parent_id WHERE p.is_deleted AND NOT c.is_deleted` (always 0).

### Tree model

Adjacency list (`parent_id`) plus recursive CTEs (raw SQL) for ancestors and subtree soft-delete.
It keeps writes trivial (adding a node inserts one row; parents never move), lazy child loading is a single indexed lookup, and
arbitrary depth works without extra bookkeeping. Nested sets / materialized path / closure table speed up subtree reads but
make inserts and deletes rewrite many rows, which is unnecessary here. Adds under new (temp) nodes need only the parent's freshly allocated id, which is why adjacency list beats materialized path / closure table / nested sets here. Rationale:
[docs/plans/stage-2-backend.md](docs/plans/stage-2-backend.md#decision-record-1--tree-storage-model).

### Seed

3 roots (Electronics, Books, Home and Garden), 30 nodes, 5 levels, fixed ids 1..30 (every parent id is lower than its child's).
Defined in `backend/src/TreeEditor.Api/Data/SeedData.cs`; inserted on startup if the table is empty.

## Key decisions

- **Soft delete with cascade:** nodes get `is_deleted = true` (also all descendants, including never-loaded ones); deleted nodes are still returned by reads.
- **Atomic Apply:** one transaction, validation before any DB access, precedence 400 -> 404 -> 409, nothing persisted on any error.
- **Set-based raw SQL for Apply:** fixed number of round trips per batch (recursive CTEs for cascade and ancestors); EF Core for schema/migrations and simple reads.
- **Serialized writes:** advisory lock 4242 for Apply, Reset and seed.
- **Client cache:** flat map + pure hierarchy/pending modules (`frontend/src/cache/`), the store only orchestrates; temp ids `tmp-<n>` mapped via `idMap`.
- **PrimeVue pinned together:** primevue 4.3.3, `@primeuix/themes` 1.0.3 and `@primeuix/styles` 1.0.3 (dependencies and npm override) must change only together; `frontend/src/dependencyPins.test.ts` guards this.
- **Immutable parent:** a node's parent never changes (enforced by trigger), so ancestry is stable and cache hierarchy assembly is safe.
- **Same-origin `/api` proxy, no CORS:** nginx (container) and the Vite dev server proxy `/api` to the API; no CORS configuration exists.
- **Reset semantics:** one transaction: `TRUNCATE ... RESTART IDENTITY`, re-insert the seed with fixed ids, set the sequence so the next id is 31. The client also clears its cache.
- **Fixed seed ids:** deterministic ids make tests and reset reproducible.

## Known behaviour

- Ids are never reused: an apply that fails after new ids were drawn (for example a database error, HTTP 500) rolls back its rows but not the id sequence, so later nodes skip those ids. Validation (400), not-found (404) and conflict (409) failures are detected before ids are drawn and leave no gap. Clients always use the `idMap` from the Apply response and never predict ids.
- Reset restarts ids at 31, so ids are reused only across a Reset. Another open browser tab must reload its cache after a Reset made elsewhere.
- One Apply accepts at most 1000 edits, 1000 adds and 1000 deletes, and at most 10000 `refreshIds`; larger requests get 400.
