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
- `src/TreeEditor.Api/Infrastructure/` - shared `ProblemTypes`.
- `tests/TreeEditor.Api.Tests/` - `Infrastructure/` (ApiFactory, ApiCollection, IntegrationTestBase) and test folders per feature (Health, Nodes, Reset, Apply, Errors, Data).

## Conventions

- Tree model: adjacency list `nodes(id, parent_id, value, is_deleted)`; `parent_id` immutable (DB trigger); recursive-CTE raw SQL for ancestors/subtrees. See [docs/plans/stage-2-backend.md](../docs/plans/stage-2-backend.md#decision-record-1--tree-storage-model).
- Seed: `Data/SeedData.cs` (30 nodes, ids 1..30, 3 roots, 5 levels); `TreeSeeder` is used by startup and `POST /api/reset`.
- Startup: `DatabaseInitializer` migrates and seeds with retry (30 attempts, 2 s).
- Errors: `Results.Problem` with `ProblemTypes` constants; never return stack traces. JSON is camelCase.
- Tests: need Docker; one Postgres container per run; DB reset before every test; every test class derives `IntegrationTestBase` and needs `[Collection(ApiCollection.Name)]`.
- `POST /api/nodes/apply` is a 501 stub until stage 3.
