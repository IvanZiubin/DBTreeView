# Backend (.NET 8 API)

## Commands (run in `backend/`)

| Task | Command |
|---|---|
| Build | `dotnet build TreeEditor.sln` |
| Run (needs `docker compose up -d db`, port 8080) | `dotnet run --project src/TreeEditor.Api` |
| Test (Docker required) | `dotnet test TreeEditor.sln` |
| Restore tools | `dotnet tool restore` |
| Add migration | `dotnet ef migrations add <Name> --project src/TreeEditor.Api/TreeEditor.Api.csproj --startup-project src/TreeEditor.Api/TreeEditor.Api.csproj --output-dir Data/Migrations` |
| Check model drift | `dotnet ef migrations has-pending-model-changes --project src/TreeEditor.Api/TreeEditor.Api.csproj --startup-project src/TreeEditor.Api/TreeEditor.Api.csproj` |

## Layout

- `src/TreeEditor.Api/Features/<Feature>/<Feature>Endpoints.cs` - one `MapGroup` per feature (Health, Nodes, Reset, Apply); Nodes also has DTOs, queries, problems.
- `src/TreeEditor.Api/Data/` - `Node`, `TreeDbContext`, `SeedData`, `TreeSeeder`, `DatabaseInitializer`, `Migrations/`.
- `src/TreeEditor.Api/Infrastructure/` - shared `ProblemTypes` (BadRequest, NotFound, Conflict, ServiceUnavailable) and `DbLocks`.
- `tests/TreeEditor.Api.Tests/` - `Infrastructure/` (ApiFactory, ApiCollection, IntegrationTestBase) and test folders per feature (Health, Nodes, Reset, Apply, Errors, Data).

## Conventions

- Tree model: adjacency list `nodes(id, parent_id, value, is_deleted)`; `parent_id` immutable (DB trigger); recursive-CTE raw SQL for ancestors/subtrees. See [docs/plans/stage-2-backend.md](../docs/plans/stage-2-backend.md#decision-record-1--tree-storage-model).
- Seed: `Data/SeedData.cs` (30 nodes, ids 1..30, 3 roots, 5 levels); `TreeSeeder` is used by startup and `POST /api/reset`.
- Startup: `DatabaseInitializer` migrates and seeds with retry (30 attempts, 2 s).
- Errors: `Results.Problem` with `ProblemTypes` constants; never return stack traces. JSON is camelCase.
- Tests: need Docker; one Postgres container per run; DB reset before every test; every test class derives `IntegrationTestBase` and needs `[Collection(ApiCollection.Name)]`.
- Apply layout, `Features/Apply/`: `ApplyEndpoints` (MapGroup `/api/nodes`; body read manually from `HttpRequest`, so a bad/missing body gives 400 with key `body`), `ApplyDtos` (wire types, all nullable), `ApplyValidator` (pure, JSON-path error keys, limits, Kahn topological order), `ApplyCommand` (validated command + `ApplyOutcome`), `ApplySql` (raw set-based SQL), `ApplyService` (transaction), `ApplyProblems` (400/404/409).
- Apply order in one transaction: advisory lock -> `SELECT ... FOR UPDATE` referenced rows -> 404 -> 409 -> adds (ids pre-allocated via `nextval`, one `INSERT ... unnest`) -> edits (one `UPDATE ... unnest`) -> cascade delete (one recursive CTE) -> NodeDetails for all referenced ids (one recursive CTE) -> COMMIT.
- Lock rule: every tree write transaction (Apply, Reset, SeedIfEmpty, any future writer) calls `DbLocks.AcquireTreeWriteLockAsync(db, ct)` as its FIRST statement after `BeginTransactionAsync`. Key `DbLocks.TreeWriteLockKey` = 4242, defined only there. See [docs/plans/stage-3-backend.md](../docs/plans/stage-3-backend.md#decision-record-4--write-serialization-concurrency).
- Invariant: every descendant of a deleted node is deleted (cascade + 409 on add under a deleted parent + lock).
- `POST /api/nodes/apply` is fully implemented (no 501). 404/409 bodies carry a sorted `nodeIds` extension.
- Compose host ports are overridable: `DB_PORT` (5432), `API_PORT` (8080), `UI_PORT` (3000).
- Apply tests: `tests/TreeEditor.Api.Tests/Apply/*.cs` per `test_matrix` in `docs/plans/stage-3-backend.yaml`; helpers in `Infrastructure/ApplyHttp.cs`. The atomicity test installs and drops its own trigger (Reset does not remove triggers).
