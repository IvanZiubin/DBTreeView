# Tree Editor with a Local Cache

Web app with two tree views over a PostgreSQL tree of arbitrary depth (spec: [task.md](task.md)).
**DBTreeView** lazy-loads the DB tree; **CachedTreeView** holds individually loaded nodes, assembles them into the correct hierarchy,
and keeps edits / adds / deletes (deletes cascade to all descendants) pending until **Apply**. **Reset** restores the sample data.
Everything starts with `docker compose up --build`.

## Repo layout

| Path | Contents |
|---|---|
| `backend/` | .NET 8 API + test project (has its own `CLAUDE.md` from stage 2) |
| `frontend/` | Vue 3 SPA + its Dockerfile (has its own `CLAUDE.md` from stage 2) |
| `docs/ai/` | AI context, YAML only: `workflow.yaml`, `roadmap.yaml`, `conventions.yaml`, `api-contract.yaml` |
| `docs/plans/` | Stage plans, a `.md` (human) + `.yaml` (AI) pair per plan |
| `docker-compose.yml` | db + api + ui |
| `README.md` | Start instructions, schema, decisions (final version in stage 4) |
| `.claude/agents/` | Agent definitions (roster below) |

> Note: `backend/CLAUDE.md` and `frontend/CLAUDE.md` are created in stage 2.

## Stack

- **API:** .NET 8 minimal APIs — one `MapGroup` per feature file
- **Data:** EF Core + Npgsql; raw SQL allowed for recursive/subtree operations
- **DB:** PostgreSQL 16
- **UI:** Vue 3 + Vite + TypeScript + PrimeVue (Aura theme) + Pinia
- **Tests:** xUnit + WebApplicationFactory + Testcontainers.PostgreSql

## Agent roster

| Agent | Model / effort | Responsibility | May write |
|---|---|---|---|
| `plan-organizer` | opus / high | Orchestrates every stage (main session); owns the API contract; dispatches, reviews and closes plan gaps; verifies acceptance criteria; never writes app code | `docs/ai/`, `docs/plans/` (review fixes), `CLAUDE.md` |
| `backend-architect` | opus / medium | Plans backend, DB schema, root infra; owns tree storage model decision | `docs/plans/` |
| `frontend-architect` | opus / medium | Plans frontend incl. its Dockerfile; consumes the contract | `docs/plans/` |
| `plan-implementer` | sonnet / medium | Implements one plan yaml exactly; stops and reports on deviation | its scoped folder only (`backend/`, `frontend/`, or root infra files) |
| `docs-and-tests` | sonnet / low | Tests for acceptance criteria; README/CLAUDE.md/docs-ai updates; reports bugs, never fixes | test projects/files, `README.md`, `CLAUDE.md` files, `docs/ai/` (not `api-contract.yaml`) |
| `chore-runner` | haiku / low | Scaffolding, installs, builds, docker compose, curl smoke, formatting — exactly as told | scaffold output in the folder it is told |
| `git-runner` | haiku / low | Local commits of given paths with given message | nothing (git index/history only) |

The organizer always passes `model` and `effort` explicitly on every dispatch. Flow: [docs/ai/workflow.yaml](docs/ai/workflow.yaml).

## Docs rules

- `docs/ai/` — **YAML only**, AI context (workflow, roadmap, conventions, API contract).
- `docs/plans/` — one `<stage>-<project>.md` (human) + `<stage>-<project>.yaml` (AI: ordered steps, files, acceptance criteria) pair per plan.
- Details: [docs/ai/conventions.yaml](docs/ai/conventions.yaml).

## Git rules

- Local only, current branch only — no push, no branch creation/switching, no amend/rebase/reset.
- One commit per phase.
- `backend/` and `frontend/` changes go in **separate commits**, staged by folder; root files (compose, docs) in their own commit.
- Conventional commits: `feat(api)`, `feat(ui)`, `chore(infra)`, `chore(scaffold)`, `test(api)`, `test(ui)`, `docs`.

## Stages

Defined with goals and definitions of done in [docs/ai/roadmap.yaml](docs/ai/roadmap.yaml):

1. Agent setup
2. Base structure (compose, seeded DB, lazy DBTreeView, Reset, integration tests)
3. Cache core (load into cache, hierarchy assembly, deleted-state display, backend Apply endpoint)
4. Cache pending changes (edit/add/delete until Apply, temp ids, cascade marking, id mapping, edge cases, final README)

## Decisions

<!-- One line per decision + link to its decision record in docs/plans/. Added by plan-organizer. -->
