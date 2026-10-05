# Stage 2 (base-structure) — Frontend plan

AI-executable companion: [stage-2-frontend.yaml](stage-2-frontend.yaml). Contract: [../ai/api-contract.yaml](../ai/api-contract.yaml) (consumed as-is).

## Goal

A runnable Vue 3 SPA under `frontend/`, served by nginx in the `ui` container (port 80 → host 3000) and proxying `/api/*` to the `api` service. It shows:

- **Header**: app title + **Reset** button (PrimeVue ConfirmDialog → `POST /api/reset` → DB tree reloaded from the returned roots → cache store cleared → success toast).
- **Left panel — DBTreeView**: PrimeVue `Tree`, roots loaded on mount (`GET /api/nodes/roots`), children loaded lazily on expand (`GET /api/nodes/{id}/children`), per-node spinner, single selection, deleted nodes shown struck through with a "deleted" tag. A **Load into cache** button (enabled when a node is selected) calls `GET /api/nodes/{id}` and hands the `NodeDetails` to the cache store's `loadNode` stub, then shows the info toast "Cache loading arrives in stage 3".
- **Right panel — CachedTreeView placeholder**: empty-state message, toolbar with Edit / Add child / Delete / Apply, all disabled.

The whole tree is never loaded: the only tree reads are roots and one level of children per expand.

## Stack and pinned versions

| Item | Version | Why |
|---|---|---|
| Node (local) | 22.19.0 via nvm | default `node` is v14; every node/npm command is prefixed with `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null &&` |
| create-vite | 6.5.0 | Vite 6 `vue-ts` template; non-interactive when template and target dir are given (create-vite 7 adds extra interactive prompts) |
| primevue | 4.3.3 | PrimeVue 4 styled mode |
| @primeuix/themes | 1.0.3 | Current theme package for PrimeVue >= 4.3 (`@primevue/themes` is the deprecated predecessor); provides `@primeuix/themes/aura` |
| primeicons | 7.0.0 | icon font used by Button/Tree |
| pinia | 3.0.2 | Vue 3.5-only Pinia line |
| Docker build image | node:22-alpine | |
| Docker runtime image | nginx:1.27-alpine | |

Template dependency versions (vue, vite, vue-tsc, typescript, @vitejs/plugin-vue) are whatever create-vite 6.5.0 writes; `package-lock.json` freezes them and the Dockerfile uses `npm ci`.

## UI and state design

```
App.vue
├── Toast, ConfirmDialog              (global PrimeVue singletons)
├── AppHeader.vue                     title + Reset
└── main.app-main (2-column grid, 1 column below 900px)
    ├── DbTreeView.vue                Tree bound to useDbTreeStore
    └── CachedTreeView.vue            placeholder bound to useCacheStore
NodeLabel.vue                         value + "deleted" Tag; reused by both trees
```

- `src/api/types.ts` mirrors contract schemas `Node`, `NodeDetails`, `ApplyRequest` (with `ApplyEdit`, `ApplyAdd`), `ApplyResponse`, `ProblemDetails`, plus `HealthResponse`.
- `src/api/client.ts`: one private `request<T>()` over `fetch` with base `/api`; non-2xx bodies are parsed as ProblemDetails into `ApiError` (status, problem, title, detail — validation `errors` flattened into detail). Network failures become `ApiError` with status 0. Exported functions: `getHealth`, `getRoots`, `getChildren`, `getNode`, `resetDatabase`, `applyChanges` (the last one unused until stage 3).
- `src/errors.ts`: `reportError(err)` turns any error into an error toast (summary = ProblemDetails title, detail = ProblemDetails detail). `App.vue` registers the toast instance via `installErrorToast(useToast())`. `main.ts` routes `app.config.errorHandler` and `window` `unhandledrejection` to `reportError` as a safety net; components additionally catch explicitly around every API call so loading flags reset and errors are never swallowed.

## Decision records

### DR-FE-2.1 DB tree state lives in a Pinia store (`useDbTreeStore`), not a composable
Reset is triggered from the header but must reload the DB tree in the sibling panel, and stage 3 will need the selected DB node from outside DbTreeView. A store gives one shared instance without prop drilling. State: `roots: TreeNode[]`, `rootsLoading`, `expandedKeys`, `selectionKeys`, `loadedKeys` (keys whose children were fetched), plus a private `generation` counter.

### DR-FE-2.2 Lazy loading model
Each API `Node` maps to a PrimeVue `TreeNode` `{ key: String(id), label: value, leaf: !hasChildren, data: Node, loading: false }`. On `node-expand` the store finds the node by key in the reactive tree (not via the event object, to avoid proxy-identity issues), sets `loading = true` (Tree `loadingMode="icon"` shows a spinner on that toggler), fetches one level, assigns `children`, records the key in `loadedKeys` so re-expanding never refetches. On failure the key is removed from `expandedKeys` and the error is toasted. `setRoots()` (used by initial load and Reset) increments `generation`; a children response that arrives after a Reset is discarded, so stale children are never grafted onto the fresh tree (seed ids are identical after Reset, which makes this a real risk).

### DR-FE-2.3 Cache store skeleton and id scheme (for stages 3–4)
`useCacheStore` holds `nodes: Record<string, CachedNode>` keyed by `String(id)`. Real ids are numbers (`"42"`), temp ids are strings with the contract format `"tmp-<n>"`, so keys never collide. `CachedNode = { id: number | string, parentId: number | string | null, value, originalValue, isDeleted (DB state as last loaded/applied), isNew, isEdited, isPendingDelete (marked in cache, not yet applied), ancestorIds: (number | string)[] }`. Additional state: `selectedKey`, `nextTempSeq`, `applying`. Getters: `nodeList`, `isEmpty`, `selectedNode`, `hasPendingChanges`, `treeNodes` (returns `[]` until stage 3). Actions `loadNode`, `editValue`, `addChild`, `deleteNode`, `apply` are empty stubs marked `TODO stage 3/4`; only `clear()` has logic. Stage 3/4 architects may refine these fields; they are a starting point, not a contract.

### DR-FE-2.4 Same-origin `/api`, no CORS
Dev: Vite proxy `/api → http://localhost:8080`. Prod: nginx `location /api/` proxies to `http://api:8080` with the original URI unchanged. nginx uses Docker's embedded DNS (`resolver 127.0.0.11`) and a variable upstream so the ui container starts even if the `api` container is not yet resolvable; no CORS configuration is needed or allowed anywhere.

### DR-FE-2.5 PrimeVue components imported per file
Components are imported explicitly (`import Tree from 'primevue/tree'`) instead of global registration or an auto-import resolver: no extra packages, full type checking in `vue-tsc`.

### DR-FE-2.6 No frontend test setup in stage 2
Stage 2 acceptance is `npm run build` (vue-tsc type check + Vite build), docker build, curl smoke and manual UI checks. Vitest is introduced in stage 3 together with hierarchy-assembly logic, where unit tests have value.

## frontend/CLAUDE.md (created by docs-and-tests in workflow step 8)
Should record: Node 22 via nvm prefix; commands (`npm run dev`, `npm run build`); folder map (`src/api`, `src/stores`, `src/components`, `src/errors.ts`); rule "all HTTP goes through `src/api/client.ts`, never call fetch elsewhere"; rule "never load the full tree — only roots, one level of children, single node"; PrimeVue components imported per file; Aura theme from `@primeuix/themes`; `erasableSyntaxOnly`/`verbatimModuleSyntax` (no enums, no parameter properties, `import type` for types).

## Risks

- **Pinned versions not on the registry** (create-vite 6.5.0, primevue 4.3.3, @primeuix/themes 1.0.3, pinia 3.0.2 were chosen from knowledge, not verified online). If npm returns ETARGET, chore-runner stops and reports; organizer picks the nearest existing version in the same minor line.
- **Template tsconfig strictness** (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`): stub actions use `_`-prefixed parameters; no enums or parameter properties; types imported with `import type`.
- **Compose ordering**: nginx tolerates a missing `api` at startup (variable upstream), but the backend plan's `docker-compose.yml` should still give `ui` a `depends_on: [api]`.
- `/api/nodes/apply` returns 501 in stage 2; the UI never calls it in this stage.
