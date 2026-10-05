# Stage 3 (cache-core) — Frontend plan

AI-executable companion: [stage-3-frontend.yaml](stage-3-frontend.yaml). Contract: [../ai/api-contract.yaml](../ai/api-contract.yaml) v2 (consumed as-is, no changes requested).

## Goal

- **Load into cache** works: DbTreeView's button calls `GET /api/nodes/{id}` and hands the `NodeDetails` to `cache.loadNode`. The stage-2 placeholder toast is removed.
- **CachedTreeView** shows the cached nodes in the correct hierarchy for any load order (child before parent, gaps, siblings, multiple roots). Gaps (missing intermediate levels) get a muted marker.
- **Deleted state** (`isDeleted` from the DB, `isPendingDelete` for stage 4) uses the `NodeLabel` deleted style.
- **Selection** in CachedTreeView works. Edit / Add child / Delete / Apply stay disabled; stage 4 wires them up.
- **Stage 4 groundwork:** the store gets `realIds` and `mergeServerNodes`, plus documented rules for `apply()`.
- **Vitest** is installed with a smoke test, and docs-and-tests gets a test matrix.
- The dev proxy target can be overridden with `API_URL`.

Out of scope: edit, add, delete and apply logic or UI wiring (stage 4), and anything in `docs/design/` (stage 5).

## Files

| File | Action |
|---|---|
| `frontend/package.json`, `package-lock.json` | `vitest@3.2.4` devDependency (exact), script `"test": "vitest run"` (done by chore-runner) |
| `frontend/vite.config.ts` | function config, `API_URL` proxy target via `loadEnv`, `test` block |
| `frontend/src/cache/model.ts` | **new** — `CacheId`, `CachedNode` (adds `hasChildren`), `cacheKey`, `CacheTreeNodeData` |
| `frontend/src/cache/hierarchy.ts` | **new** — pure `compareCacheIds`, `placeNode`, `buildCacheTree`, `gapTooltip` |
| `frontend/src/cache/hierarchy.test.ts` | **new** — one smoke test (docs-and-tests extends it) |
| `frontend/src/stores/cache.ts` | `expandedKeys`, `epoch`, `realIds`, `treeNodes`, `mergeServerNodes`, `loadNode`, `clear` |
| `frontend/src/api/client.ts` | `applyChanges` doc comment only |
| `frontend/src/components/DbTreeView.vue` | real load, placeholder toast removed, Reset-race guard |
| `frontend/src/components/CachedTreeView.vue` | selection, expansion, gap marker, deleted style |

`AppHeader.vue` is unchanged. Its Reset already calls `cache.clear()`, which now also clears `expandedKeys` and increments `epoch`.

## UI and state design

```
useCacheStore
  nodes: Record<string, CachedNode>     flat, keyed by String(id); no stored tree
  selectedKey, expandedKeys, epoch, nextTempSeq, applying
  realIds        (computed)  numeric ids ascending   -> stage-4 refreshIds
  treeNodes      (computed)  buildCacheTree(nodeList) -> PrimeVue TreeNode[]
  mergeServerNodes(NodeDetails[])  insert or refresh server fields (used by loadNode, and by stage-4 apply)
  loadNode(NodeDetails)            merge + expand cached ancestors + select

CachedTreeView
  Tree  v-model:selection-keys = computed <-> cache.selectedKey
        v-model:expanded-keys  = cache.expandedKeys
  row:  [… gap marker?] NodeLabel(value, deleted = isDeleted || isPendingDelete)
```

## Decision records

### DR-FE-3.1 Hierarchy is derived from a flat map by a pure function (nearest cached ancestor)
The cache stores nodes flat (`Record<string, CachedNode>`) and never stores display-parent pointers. `buildCacheTree(nodes)` in `src/cache/hierarchy.ts` (no Vue or Pinia imports) places each node under its **nearest cached ancestor**. To find it, it scans `ancestorIds` from the parent end towards the root and takes the first id that is in the cache. If no ancestor is cached, the node is top-level. The function groups nodes by display parent, sorts each group, and recurses from the top-level group. A visited set guards against malformed input. The store's `treeNodes` is `computed(() => buildCacheTree(nodeList.value))`. So when an ancestor is loaded later, cached descendants move under it automatically on the next recompute, in any load order. `ancestorIds` never change (the contract says parent–child relations are immutable), so placement is stable. Stage-4 temp nodes carry `ancestorIds = [...parent.ancestorIds, parent.id]`, which may include temp ids, so the same function places them with no changes.

### DR-FE-3.2 Gap marker
Each `TreeNode.data` is `CacheTreeNodeData = { node: CachedNode, missingAncestorIds: CacheId[] }`. `missingAncestorIds` is the slice of `ancestorIds` between the display parent and the node, ordered root to parent. For a top-level node that is not a DB root, it is all of its `ancestorIds`: the row is shown at top level, but levels above it are missing, and that is also a gap. When the list is non-empty, the row starts with a muted, dashed-border `…` chip. The chip has `title` and `aria-label` set to `gapTooltip(ids)` = `"N level(s) not loaded: #a, #b"` and carries `data-gap-depth="N"`. It uses a native `title` tooltip rather than the PrimeVue Tooltip directive, so no global directive is registered. Example: load 26, then 1, then 10. The result is `1 > (… #4) 10 > (… #18) 26`.

### DR-FE-3.3 Sibling order
Siblings sort with `compareCacheIds`. Real (numeric) ids come first, ascending. Then come temp ids `tmp-<n>` by numeric `n` (creation order, because stage 4 uses `nextTempSeq`). Any other string id sorts last, lexicographically. This matches the contract ordering (id ascending) and is ready for stage 4.

### DR-FE-3.4 Refresh semantics: `mergeServerNodes` (shared by load and stage-4 apply)
For each `NodeDetails`:
- **Not cached:** insert it with `value = originalValue = details.value`, the server flags, `isNew = isEdited = isPendingDelete = false`, and add its key to `expandedKeys`.
- **Already cached:** overwrite only the server fields (`parentId`, `ancestorIds`, `originalValue`, `isDeleted`, `hasChildren`). Overwrite `value` only if `!isEdited`. Never touch `isNew`, `isEdited` or `isPendingDelete`. So reloading a node never loses pending local work.

Rules for stage 4's `apply()`:
1. Send `refreshIds = realIds` (every real id in the cache), as contract v2 requires. It is the only way to learn about cascaded deletes.
2. After a 200 response, re-key temp nodes using `idMap`, including temp ids inside other nodes' `ancestorIds` and `parentId`, and the `selectedKey` / `expandedKeys` entries.
3. Clear `isNew`, `isEdited` and `isPendingDelete` on every node that was in the request.
4. Call `mergeServerNodes(response.nodes)`.

`apply()` stays a stub in stage 3.

### DR-FE-3.5 Expansion and reveal
`expandedKeys` lives in the store and is bound with `v-model:expanded-keys`. Newly inserted nodes are added as expanded, so the whole cached tree starts expanded. A user collapse removes the key (PrimeVue emits a new object), and it is respected for everything except one case: `loadNode` also expands the cached ancestors of the node just loaded, so that node is always visible. The store always replaces `expandedKeys` with a new object rather than mutating it, because PrimeVue Tree syncs its internal copy through a non-deep watcher on the prop. Stage 4 `addChild` must add both the parent key and the new key the same way.

### DR-FE-3.6 Load feedback: no success toast
After a successful load, the loaded node becomes the cache selection (`selectedKey`) and is revealed. The highlighted row is the feedback, so no toast is shown. Errors still go through `reportError`, which shows an error toast. The button shows a loading state during the request and is disabled while loading, which prevents double submits.

### DR-FE-3.7 Reset race guard (`epoch`)
`clear()` increments `cache.epoch`. DbTreeView records the epoch before `await getNode(id)` and discards the response if the epoch has changed. Without this, a load still in flight during Reset would re-insert a pre-reset node. Seed ids are the same after Reset, so the stale node would look valid.

### DR-FE-3.8 Pure model module
`CacheId`, `CachedNode`, `cacheKey` and `CacheTreeNodeData` move to `src/cache/model.ts`, so `hierarchy.ts` and its tests do not depend on Pinia. `stores/cache.ts` re-exports them, so existing imports from `../stores/cache` keep working. `CachedNode` gains `hasChildren: boolean`, a server field refreshed on reload. Stage 4 temp nodes use `false`.

### DR-FE-3.9 Vitest setup
- **Version:** `vitest@3.2.4`, exact. Its peer range is vite `^5 || ^6 || ^7`, so it works with the installed vite 6.4.3 and TS 5.8.
- **Environment:** `node`. There is no jsdom and no component tests. Tests cover the pure module and the Pinia store with `setActivePinia(createPinia())`.
- **Config:** inside `vite.config.ts` via `/// <reference types="vitest/config" />`, so there is no separate config file and no runtime import of vitest in the build.
- **Test files:** `src/**/*.test.ts`, with explicit `import { describe, it, expect } from 'vitest'` (no globals). They are **deliberately included** in `tsconfig.app.json` (its existing `src/**/*.ts` glob), so `npm run build` (vue-tsc -b) type-checks them under the same strict rules. They are never imported by `main.ts`, so they are not bundled. No tsconfig changes are needed.

### DR-FE-3.10 Dev proxy target from `API_URL`
`vite.config.ts` becomes a function config. It reads `loadEnv(mode, '.', '').API_URL`; an empty prefix includes `process.env`. The default is `http://localhost:8080`. This avoids `process.env` and therefore avoids adding `@types/node`. Example: `API_URL=http://localhost:18080 npm run dev`.

## Test matrix (for docs-and-tests)
The full case list is under `test_matrix` in the yaml. It covers hierarchy assembly (child before parent, parent before child, gaps and marker depth, siblings, multiple roots, temp-id ordering) and the store (reload keeps pending flags, deleted flags, Reset clears, `realIds`, expand and select on load).

## One-line summary for CLAUDE.md Decisions
- Cache hierarchy: flat node map + pure `buildCacheTree` placing each node under its nearest cached ancestor (scan `ancestorIds` parent→root), gap marker for missing levels; reload refreshes server fields only and keeps pending state; Vitest 3.2.4 on pure modules + Pinia store — [decision records](docs/plans/stage-3-frontend.md#decision-records)

## Risks
- **vitest 3.2.4 availability:** the organizer verifies it with `npm view vitest@3.2.4 version`. On ETARGET, chore-runner stops. Use the nearest 3.2.x instead; do not move to 4.x.
- **Vitest types under `tsconfig.app.json`:** `types: []` and no `@types/node`. `skipLibCheck: true` covers vitest's `.d.ts` references to node types. Test files must only use DOM- or ES-level globals.
- **`loadEnv` with an empty prefix** exposes all env vars to the config only, never to client code, because `define` is not used. That is acceptable.
- **Recompute cost:** `treeNodes` is rebuilt on every cache mutation (O(n log n)). This is fine for a cache that a person fills by hand.
