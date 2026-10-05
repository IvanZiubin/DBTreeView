# Frontend (Vue 3 + Vite + TypeScript + Pinia, "Industry" design)

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

- `src/api/client.ts`, `src/api/types.ts` - the only place that calls `fetch`; DTO types matching `docs/ai/api-contract.yaml`. `setRequestObserver` reports every request to the network log. `src/api/networkLog.ts` - pure network-log model.
- `src/stores/dbTree.ts` - DB tree (lazy children, `refresh()` after Apply); `src/stores/cache.ts` - cache (load, hierarchy, expansion, pending edit/add/delete, apply, `clear()`, `lastIdMap`); `src/stores/transfer.ts` - the single load-into-cache path (`loadIntoCache`), drag state, last-load stats; `src/stores/networkLog.ts`, `src/stores/toasts.ts`, `src/stores/highlight.ts` (hover link + flash tags).
- `src/cache/model.ts`, `src/cache/hierarchy.ts`, `src/cache/pending.ts` - pure cache model, hierarchy assembly (+ `reparentedKeys`) and pending-change logic; no Vue/Pinia imports.
- `src/view/types.ts`, `treeRows.ts`, `linkLines.ts`, `dialogs.ts`, `transfer.ts` - pure view models (row flattening and tags, link-line geometry, Apply / Clear-cache dialog texts, gutter texts); no Vue/Pinia imports.
- `src/motion/motion.ts` - DOM-only Web Animations helpers (FLIP, fly-in); no-ops with prefers-reduced-motion.
- `src/components/` - `AppHeader`, `DbTreeView`, `TransferGutter`, `CachedTreeView`, `LinkLines`, `NetworkLog`, `ToastStack`, `ConfirmDialog`, `StatusTags`, `BlueprintCorners`.
- `src/styles/industry.css`, `src/styles/app.css`; `src/errors.ts`, `src/App.vue`, `src/main.ts`.
- Tests: `src/cache/hierarchy.test.ts`, `src/cache/pending.test.ts`, `src/stores/cache.test.ts`, `src/stores/cache.pending.test.ts`, `src/stores/cache.clear.test.ts`, `src/stores/dbTree.test.ts`, `src/dependencyPins.test.ts` `src/api/client.test.ts`, `src/api/networkLog.test.ts`, `src/stores/networkLog.test.ts`, `src/stores/transfer.test.ts`, `src/stores/highlight.test.ts`, `src/stores/toasts.test.ts`, `src/cache/reparent.test.ts`, `src/view/treeRows.test.ts`, `src/view/linkLines.test.ts`, `src/view/dialogs.test.ts`, `src/view/transfer.test.ts`.

## Styling

- Design source: `docs/design/stage-5/` (`tree-editor.dc.html` mock, `industry-styles.css` tokens, README with anatomy and rules). Never import from `docs/design/`; port changes into `src/styles/`.
- No UI component library. Global CSS only: `src/styles/industry.css` is a verbatim port of the Industry stylesheet (minus the font import); `src/styles/app.css` holds every app class (BEM-like `block__element`, state classes `is-*`). Components have no `<style>` blocks.
- Colors, fonts and spacing only from Industry tokens (`--color-*`, `--font-*`, `--space-*`, `--shadow-*`); no hex colors or font names outside `industry.css` (`app.css` defines only `--font-mono` and the layout tokens `--row-height`, `--row-indent`, `--toggle-size`, `--gutter-width`, `--panel-header-height`, `--toast-top`, `--toast-width`).
- Blueprint objects (panels, dialogs, toasts, cards, primary buttons) are `.blueprint` with `<BlueprintCorners />` as a direct child; square corners, hairline borders, transparent fill.
- Fonts: Barlow / Barlow Condensed via Google Fonts `<link>` in `index.html`. Icons: `lucide-vue-next` only, always `:stroke-width="1.5"` and an explicit `:size`.
- Hairline rows only (30px, 18px indent, guide lines). Focus: global accent `:focus-visible` ring (rows use an inward offset). Minimum width 1024px.
- Motion honours prefers-reduced-motion (media query in `app.css`, `prefersReducedMotion()` in `motion.ts`).

## Conventions

- tsconfig has `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`: no enums, no constructor parameter properties, use `import type` for types, prefix unused params with `_`.
- Relative imports only (no `@/` alias).
- All HTTP goes through `src/api/client.ts`; every request is reported to the network log via the observer registered in `main.ts`.
- Loading a node into the cache always goes through `useTransferStore().loadIntoCache(id, label)` (button, double-click and drop); it is the only caller of `getNode`.
- Clear cache is client-only: `cache.clear()` + `transfer.reset()` + `highlight.clear()`, no API call; confirm only when there are pending changes; disabled when the cache is empty or while applying.
- Never add CORS headers/config: browser is same-origin (nginx or Vite proxy).
- Do not change `package.json` dependencies/scripts or `tsconfig*.json` without a plan.
- Hierarchy is derived by `buildCacheTree`, never stored: the store keeps a flat map of nodes; each node displays under its nearest cached ancestor, with a `parent #id` gap hint for uncached levels.
- Pending-change rules live in `src/cache/pending.ts` (pure); the store only orchestrates. `propagateDeletes` must run after every merge and every delete.
- Apply always sends `refreshIds` = every cached real id (client_rules.refresh_ids); on failure the cache state must stay untouched; on success: settle -> re-key -> `mergeServerNodes`, in that order.
- Temp ids are `tmp-<n>` from `nextTempSeq`; real ids are opaque (only from idMap / server) and may have gaps - never compute ids.
- Edit / Add child / Delete are disabled and rejected for effectively deleted nodes (`isDeleted || isPendingDelete` or such a cached ancestor) and while applying.
- No UI component library: PrimeVue was removed in stage 5 (DR-FE-5.1). Do not add primevue / @primeuix/* / primeicons. Icons only from lucide-vue-next 0.525.0 (exact). `src/dependencyPins.test.ts` enforces both.
- Design decisions: [docs/plans/stage-5-frontend.md](../docs/plans/stage-5-frontend.md), [docs/plans/stage-4-frontend.md](../docs/plans/stage-4-frontend.md), [docs/plans/stage-3-frontend.md](../docs/plans/stage-3-frontend.md), [docs/plans/stage-2-frontend.md](../docs/plans/stage-2-frontend.md).
