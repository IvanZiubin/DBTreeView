# Frontend (Vue 3 + Vite + TypeScript + PrimeVue Aura + Pinia)

## Commands (run in `frontend/`)

Every node command needs the nvm prefix: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null &&`

| Task | Command |
|---|---|
| Install | `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm install` |
| Dev server (:5173, proxies `/api` -> http://localhost:8080) | `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run dev` |
| Unit tests (Vitest, Node env) | `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm test` |
| Typecheck + build (also type-checks tests) | `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run build` |

Production image: `Dockerfile` builds with Node and serves via nginx (`nginx.conf` proxies `/api/` to `http://api:8080`), published on port 3000.

## Layout

- `src/api/client.ts`, `src/api/types.ts` - the only place that calls `fetch`; DTO types matching `docs/ai/api-contract.yaml`.
- `src/stores/dbTree.ts` - DBTreeView state (lazy loading) and `refresh()`, used after Apply; `src/stores/cache.ts` - cache store: load, refresh, hierarchy, expansion, pending edit/add/delete, apply.
- `src/cache/model.ts`, `src/cache/hierarchy.ts`, `src/cache/pending.ts` - pure cache model, hierarchy assembly and pending-change logic (validateValue, propagateDeletes, nodeStatus, buildApplyPlan, settleApplied, re-key helpers); no Vue/Pinia imports.
- Tests: `src/cache/hierarchy.test.ts`, `src/cache/pending.test.ts`, `src/stores/cache.test.ts`, `src/stores/cache.pending.test.ts`, `src/stores/dbTree.test.ts`, `src/dependencyPins.test.ts`.
- `src/components/` - `AppHeader`, `DbTreeView`, `CachedTreeView`, `NodeLabel`, `NodeValueDialog` (Edit / Add child dialog).
- `src/errors.ts`, `src/App.vue`, `src/main.ts`.

## Conventions

- tsconfig has `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`: no enums, no constructor parameter properties, use `import type` for types, prefix unused params with `_`.
- Relative imports only (no `@/` alias).
- All HTTP goes through `src/api/client.ts`.
- Never add CORS headers/config: browser is same-origin (nginx or Vite proxy).
- Do not change `package.json` dependencies/scripts or `tsconfig*.json` without a plan.
- Hierarchy is derived by `buildCacheTree`, never stored: the store keeps a flat map of nodes; each node displays under its nearest cached ancestor, with a gap marker for uncached levels.
- Pending-change rules live in `src/cache/pending.ts` (pure); the store only orchestrates. `propagateDeletes` must run after every merge and every delete.
- Apply always sends `refreshIds` = every cached real id (client_rules.refresh_ids); on failure the cache state must stay untouched; on success: settle -> re-key -> `mergeServerNodes`, in that order.
- Temp ids are `tmp-<n>` from `nextTempSeq`; real ids are opaque (only from idMap / server) and may have gaps - never compute ids.
- Edit / Add child / Delete are disabled and rejected for effectively deleted nodes (`isDeleted || isPendingDelete` or such a cached ancestor) and while applying.
- primevue 4.3.3 + @primeuix/themes 1.0.3 + @primeuix/styles 1.0.3 (dependencies AND overrides) are pinned together; `src/dependencyPins.test.ts` fails if they drift - upgrade only together, via a plan.
- Design decisions: [docs/plans/stage-4-frontend.md](../docs/plans/stage-4-frontend.md), [docs/plans/stage-3-frontend.md](../docs/plans/stage-3-frontend.md), [docs/plans/stage-2-frontend.md](../docs/plans/stage-2-frontend.md).
