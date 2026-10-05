# Frontend (Vue 3 + Vite + TypeScript + PrimeVue Aura + Pinia)

## Commands (run in `frontend/`)

Every node command needs the nvm prefix: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null &&`

| Task | Command |
|---|---|
| Install | `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm install` |
| Dev server (:5173, proxies `/api` -> http://localhost:8080) | `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run dev` |
| Typecheck + build | `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run build` |

No frontend tests exist yet. Production image: `Dockerfile` builds with Node and serves via nginx (`nginx.conf` proxies `/api/` to `http://api:8080`), published on port 3000.

## Layout

- `src/api/client.ts`, `src/api/types.ts` - the only place that calls `fetch`; DTO types matching `docs/ai/api-contract.yaml`.
- `src/stores/dbTree.ts` - DBTreeView state (lazy loading); `src/stores/cache.ts` - cache store (stub until stage 3).
- `src/components/` - `AppHeader`, `DbTreeView`, `CachedTreeView`, `NodeLabel`.
- `src/errors.ts`, `src/App.vue`, `src/main.ts`.

## Conventions

- tsconfig has `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`: no enums, no constructor parameter properties, use `import type` for types, prefix unused params with `_`.
- Relative imports only (no `@/` alias).
- All HTTP goes through `src/api/client.ts`.
- Never add CORS headers/config: browser is same-origin (nginx or Vite proxy).
- Do not change `package.json` dependencies/scripts or `tsconfig*.json` without a plan.
- Design decisions: [docs/plans/stage-2-frontend.md](../docs/plans/stage-2-frontend.md).
