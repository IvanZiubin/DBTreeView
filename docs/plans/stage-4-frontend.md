# Stage 4 (cache-pending-changes) — Frontend plan

AI-executable companion: [stage-4-frontend.yaml](stage-4-frontend.yaml). Contract: [../ai/api-contract.yaml](../ai/api-contract.yaml) v2 plus the binding `client_rules` block. It is consumed as-is and no contract changes are requested.

## Goal

- **Edit value**, **Add child** (temp ids `tmp-<n>`, including children of new nodes) and **Delete** (cascades to every cached descendant, including temp nodes) work on the selected CachedTreeView node. They stay in the cache, with no network traffic, until **Apply**.
- **Apply** sends one `POST /api/nodes/apply` built according to `client_rules.request_building`, always with `refreshIds` = every cached real id. On 200 the cache swaps temp ids for real ids, settles pending flags, merges `response.nodes` and refreshes DBTreeView. On any error it keeps all pending state.
- **Deletion invariants** are enforced everywhere. A node that is loaded or reloaded under a pending-delete cached ancestor shows "to delete" (open risk 2). After Apply, cached descendants of a cascade-deleted node show "deleted" without a reload (open risk 1).
- **Effectively deleted nodes** (deleted in the DB, or pending delete in the cache) have Edit, Add child and Delete disabled and rejected.
- **Visual markers:** `new`, `edited`, `to delete`, `deleted`.
- **Guard test** for the PrimeVue / `@primeuix/styles` pin (open risk 3).
- No new npm dependencies, no tsconfig or package.json changes.

Out of scope: `docs/design/` (stage 5: inline editor, network log and the other design items), undo of pending changes, and highlighting the ids from 409/404 `nodeIds` (the error toast shows the ProblemDetails detail).

## Files

| File | Action |
|---|---|
| `frontend/src/cache/pending.ts` | **new**, pure: value validation, deletion predicates and `propagateDeletes`, `nodeStatus`, `buildApplyPlan`, `settleApplied`, id re-keying helpers, `describeApplyPlan` |
| `frontend/src/cache/pending.test.ts` | **new**, one smoke test (docs-and-tests extends it) |
| `frontend/src/dependencyPins.test.ts` | **new**, PrimeVue pin guard (complete; written by the implementer) |
| `frontend/src/stores/cache.ts` | implement `editValue` / `addChild` / `deleteNode` / `apply`; `mergeServerNodes` ends with `propagateDeletes`; new `pendingCount`, `canModifySelected` |
| `frontend/src/stores/dbTree.ts` | new `refresh()` (re-fetch roots and every loaded level, keep expansion and selection) |
| `frontend/src/components/NodeLabel.vue` | prop `deleted: boolean` replaced by `status: NodeStatus`, with four tags |
| `frontend/src/components/NodeValueDialog.vue` | **new**, PrimeVue Dialog + InputText for Edit and Add child |
| `frontend/src/components/CachedTreeView.vue` | toolbar wired, dialog, status markers, Apply with badge, success toast, DB tree refresh |
| `frontend/src/components/DbTreeView.vue` | one line: `NodeLabel :status` instead of `:deleted` |

`AppHeader.vue`, `api/client.ts`, `api/types.ts`, `cache/model.ts`, `cache/hierarchy.ts`, `errors.ts`, `App.vue` and `main.ts` are unchanged.

## UI and state design

```
useCacheStore (additions)
  pendingCount        (computed)  nodes with isNew || isEdited || isPendingDelete
  hasPendingChanges   (computed)  pendingCount > 0
  canModifySelected   (computed)  selected node exists, !applying, canModify(node)
  editValue(id, value): boolean          trim + validate; real -> isEdited = (value !== originalValue); temp -> value only
  addChild(parentId, value): string|null new temp node tmp-<nextTempSeq>; expand parent + new; select new
  deleteNode(id): boolean                isPendingDelete = true, then propagateDeletes (cascade)
  apply(): Promise<ApplyPlan | null>     plan -> POST -> (epoch check) settle -> re-key selection/expansion -> merge
  mergeServerNodes(...)                  unchanged insert/refresh, then propagateDeletes over the whole cache

CachedTreeView toolbar
  [Edit] [Add child] [Delete]   disabled unless cache.canModifySelected
  [Apply (badge = pendingCount)] disabled when !hasPendingChanges || applying; loading while applying
  NodeValueDialog (one instance; mode 'edit' | 'add')
row: [… gap] NodeLabel(value, status = nodeStatus(node)), data-status on the row
```

## Decision records

### DR-FE-4.1 Pending-change logic lives in a pure module
All rules live in `src/cache/pending.ts`, which has no Vue or Pinia imports, the same pattern as `hierarchy.ts`: which nodes may change, how deletes propagate, what goes into the request, and how the cache is settled after a 200. The store only orchestrates. It calls the helpers, does the HTTP call and the epoch check, and updates `selectedKey` / `expandedKeys`. So every edge case is unit-testable on plain objects, and the store tests only need to mock `applyChanges`. The helpers mutate the node objects they are given (`propagateDeletes`, `settleApplied`) instead of deep-copying, because the store keeps those objects in a reactive record and mutation is what Vue tracks.

### DR-FE-4.2 Deletion invariants: `propagateDeletes` runs after every merge and every delete
"Effectively deleted" means `isDeleted || isPendingDelete` (contract `client_rules.pending_delete_propagation`). `propagateDeletes(nodes)` makes one pass over the whole cache. For each node it looks at **all cached ancestors** (every id in `ancestorIds` that is in the cache):

1. A **real** node with an `isDeleted` cached ancestor gets `isDeleted = true`. The DB invariant ("every descendant of a deleted node is deleted") and the permanence of soft deletes until Reset make this certain. It also removes the stage-3 M7 staleness, where a cached descendant stayed un-struck until it was reloaded itself.
2. A node with an `isPendingDelete` cached ancestor gets `isPendingDelete = true`. A **temp** node with any effectively deleted cached ancestor also gets `isPendingDelete = true`, because it can never be created and Apply drops it.
3. A **real** node that is `isDeleted` carries no pending work: `isPendingDelete = false`, `isEdited = false`, `value = originalValue`. Such an edit would get a 409 from the server, and a delete would be a no-op.

Because every ancestor is checked directly, not just the nearest one, the result does not depend on iteration order. One pass is enough: an ancestor's ancestors are also the node's ancestors. `ancestorIds` of temp nodes include temp ids, so temp chains are covered.

The function is called at the end of `mergeServerNodes`, which covers both the insert and the refresh branch for load, reload and apply resync, and by `deleteNode`. This closes **open risk 2**: a node loaded under a pending-delete ancestor is marked `isPendingDelete` on insert, and also on reload if the flag was somehow lost. It is a superset of the contract rule. The contract rule checks only pending-delete ancestors on insert and reload. This version also derives `isDeleted` from cached deleted ancestors, which is consistent with `soft_delete`.

### DR-FE-4.3 Temp ids and `addChild`
- The temp id is `tmp-${nextTempSeq}`. The counter is per session, starts at 1, only increases, and resets only in `clear()` (Reset). A defensive loop skips keys that are already present.
- New node: `parentId = parent.id` (real or temp), `ancestorIds = [...parent.ancestorIds, parent.id]` (may contain temp ids), `originalValue = ''`, `hasChildren = false`, `isNew = true`.
- The parent key and the new key are added with `expandKeys` (DR-FE-3.5: replace, never mutate). The new node becomes `selectedKey`, which is the visual feedback, as in DR-FE-3.6.
- `buildCacheTree` already orders temp ids after real ids in creation order (DR-FE-3.3), so no hierarchy change is needed.
- Rejected, returning `null` with no change, when: the parent is missing, the parent or a cached ancestor is effectively deleted, an apply is in flight, or the value is invalid.

### DR-FE-4.4 Edit semantics
- The value is trimmed and validated in the client with the contract's `value_rules` (1..200 characters after trim). The dialog shows the message inline. The store re-validates and rejects invalid values.
- For a **real** node, `isEdited = (trimmed !== originalValue)`. Editing back to the original value clears the flag, so Apply sends nothing for it.
- For a **temp** node, only `value` changes. `isEdited` stays false, because the node is sent in `adds` with its current value.
- Rejected (returns false) under the same conditions as `addChild`, with the node itself checked instead of the parent.

### DR-FE-4.5 Request building (`buildApplyPlan`)
Nodes are processed in `compareCacheIds` order: real ids ascending, then temp ids in creation order, so a temp parent is always seen before its temp children.

- **refreshIds:** every real id, ascending, including deleted and pending-delete nodes (`client_rules.refresh_ids`). This closes **open risk 1**.
- **deletes:** real nodes that are `isPendingDelete`, not `isDeleted`, and have no effectively deleted cached ancestor. These are the top-most pending deletes, which the contract says is sufficient, and the server cascades from them. `pendingDeleteKeys` records **all** real pending-delete keys, so their flags can be cleared after a 200.
- **edits:** real nodes that are `isEdited` and not effectively deleted. Any other edited real node goes to `discardedEditKeys` and is never sent (`client_rules.request_building`; the server's `same_batch_rule` would give the same result).
- **adds:** temp nodes that are not dropped, with `parentId` for a real parent or `parentTempId` for a temp parent. A temp node is **dropped** (`droppedTempKeys`) when it is `isPendingDelete`, has an effectively deleted cached ancestor, has a null or missing parent, or has a dropped temp parent.
- Edge result: when every pending item is dropped (for example, only a deleted temp node), the request has empty `edits`, `adds` and `deletes`. Apply still runs: the server returns 200 with refresh nodes, and the dropped nodes are removed.

### DR-FE-4.6 Apply lifecycle: success settles, failure keeps everything
`apply()`:
1. Return `null` if an apply is already running or there are no pending changes.
2. Build the plan. This does not mutate anything.
3. Record `epoch` and set `applying = true`.
4. `await applyChanges(plan.request)`.
5. On a 200, if `epoch` has changed (Reset happened during the request), discard the response and return `null`. `clear()` already emptied the cache. Otherwise:
   - `nodes = settleApplied(nodes, plan, idMap)`. This removes `droppedTempKeys` from the cache, sets `isEdited = false` for `editedKeys` and `discardedEditKeys`, sets `isPendingDelete = false` for `pendingDeleteKeys`, sets `isNew = false` for `addedKeys` present in `idMap`, and re-keys every node's `id`, `parentId` and `ancestorIds` through `idMap`.
   - Re-key `selectedKey` (set to `null` if it was dropped) and `expandedKeys` (dropped keys removed) through `idMap`.
   - `mergeServerNodes(response.nodes)`. Values, `originalValue`, `isDeleted` and `hasChildren` come from the server, because the cleared nodes are no longer `isEdited`. Cascaded descendants come back `isDeleted = true` through `refreshIds`, and `propagateDeletes` runs at the end.
   - Return the plan. The component uses it for the success toast text.
6. On any thrown error (non-2xx `ApiError` or network error), nothing has been mutated, so all pending state is kept (`client_rules.failure_handling`). The error propagates to the component, which calls `reportError`, which shows the ProblemDetails title and detail.
7. `finally`: set `applying = false` only if the epoch is unchanged, so a stale request never clears the flag of a newer apply.

While `applying` is true, `editValue`, `addChild` and `deleteNode` return false, and the UI disables them. So the plan snapshot cannot drift from the cache. Loads from DbTreeView are still allowed, because they only touch server fields.

### DR-FE-4.7 UI: one dialog for Edit and Add child, no delete confirmation
- Edit and Add child use a single `NodeValueDialog` built from the already-installed PrimeVue `Dialog` + `InputText`. Enter submits, Escape or Cancel closes, and validation is inline. A dialog is simpler and more robust than inline editing inside PrimeVue Tree rows (focus and keyboard conflicts with tree navigation). Stage 5 brings the design's inline editor.
- The dialog captures the target id when it opens, so a selection change while it is open cannot redirect the change.
- Delete has no confirmation dialog. The change is only pending, it is clearly marked ("to delete", struck through), and only Apply persists it.
- Markers come from the `NodeLabel` `status` prop, with one tag by priority: `deleted` (secondary, struck through, dimmed) > `to delete` (danger, struck through) > `new` (success, italic) > `edited` (warn). Each row also carries `data-status` for checks.
- Apply shows a badge with `pendingCount`. On success a toast says "Changes applied" with `describeApplyPlan(plan)`, for example "1 edit(s), 2 addition(s), 0 deletion(s) saved." Unlike load (DR-FE-3.6), the visual change after an apply is subtle (tags disappear), so a toast is worth it.

### DR-FE-4.8 DBTreeView is refreshed after a successful Apply
After Apply, DBTreeView would otherwise show stale values, deleted states and leaf flags, and the new nodes would be missing. `dbTree.refresh()` re-fetches the roots, then the children of every previously loaded node, level by level with parallel requests per level. It restores expansion and selection for nodes that still exist. It only re-fetches levels the user had already opened, so DBTreeView stays lazy. The `generation` guard aborts it if Reset (`setRoots`) runs meanwhile. This is DBTreeView traffic, not cache traffic, so the rule "the cache accesses the DB only on load or apply" still holds. A refresh failure is reported separately; the apply itself has already succeeded.

### DR-FE-4.9 PrimeVue pin guard (open risk 3)
`src/dependencyPins.test.ts` imports `../package.json?raw`, `../node_modules/@primeuix/styles/package.json?raw` and `../node_modules/@primeuix/styles/button/index.mjs?raw`. These imports are typed as `string` by the existing `vite/client` reference in `src/vite-env.d.ts` (`declare module '*?raw'`), and Vitest inlines `?raw` imports (vite-node `defaultInline` matches `[?&]raw`). So there is no JSON-module typing, no `@types/node`, and no tsconfig change. It asserts:
- `dependencies` has `primevue` 4.3.3, `@primeuix/themes` 1.0.3 and `@primeuix/styles` 1.0.3.
- `overrides['@primeuix/styles']` is 1.0.3.
- The installed `@primeuix/styles` is 1.0.3 and its button CSS has no `dt('` calls. That is the actual stage-3 symptom.

Every assertion carries a message explaining that these versions must change together. The test is part of `npm run build`'s type-check and `npm test`, but not of the Docker image, which only runs `npm run build`.

### DR-FE-4.10 Ids are opaque (open risk 4)
A failed apply consumes sequence values, so real ids can have gaps. The client never computes or predicts ids. New real ids come only from `idMap`, sorting uses numeric comparison only (`compareCacheIds`), and keys are `String(id)`. Nothing needs to change. Manual checks only say ids are "greater than 30 after Reset".

## Edge cases (roadmap stage 4)

| Case | Behaviour |
|---|---|
| Node loaded after an ancestor was marked for deletion | `mergeServerNodes` → `propagateDeletes` → `isPendingDelete`, shown "to delete", actions disabled |
| Node loaded after an ancestor was deleted in the DB | Server `isDeleted = true`. Also derived for cached descendants of a cached deleted node (DR-FE-4.2 rule 1) |
| Edit, then an ancestor is deleted (pending) | The edit is kept but shown as "to delete". At Apply it is discarded (not sent), `isEdited` is cleared, and the value becomes the server value with `deleted` |
| New child under a node that is then deleted | The temp node is "to delete". At Apply it is dropped (never sent) and removed from the cache |
| Edit on a node another client already deleted (stale cache) | 409 and all pending state kept. Reloading the node shows `deleted`, rule 3 discards the edit, and Apply is then disabled if nothing else is pending |
| Reset during an in-flight Apply | The epoch changed, so the response is ignored. The cache stays empty |
| Apply failure (network or 4xx/5xx) | Pending state unchanged; error toast; Apply can be retried |

## Test matrix (for docs-and-tests)
The full list is under `test_matrix` in the yaml: the pure module (`pending.test.ts`), store pending flows with a mocked `applyChanges` (`cache.pending.test.ts`), and `dbTree.refresh` with mocked reads (`dbTree.test.ts`). The implementer writes only the pending smoke test and the complete pin guard test.

## One-line summaries for CLAUDE.md Decisions
- Cache pending changes: pure `src/cache/pending.ts`. `propagateDeletes` runs after every merge and delete (pending-delete cascades to cached descendants and later-loaded nodes; `isDeleted` is derived from cached deleted ancestors; deleted nodes drop pending work). Apply sends top-most deletes, non-deleted edits, non-dropped temp adds and `refreshIds` = all real ids. On 200 the cache settles plan flags, re-keys via `idMap` and merges; on failure it keeps everything — [decision records](docs/plans/stage-4-frontend.md#decision-records)
- PrimeVue pin guard: `src/dependencyPins.test.ts` (`?raw` imports) fails `npm test` if primevue 4.3.3 / @primeuix/themes 1.0.3 / @primeuix/styles 1.0.3 (deps + override) drift apart — [DR-FE-4.9](docs/plans/stage-4-frontend.md#dr-fe-49-primevue-pin-guard-open-risk-3)

## Risks
- **`?raw` import of `node_modules` files:** this relies on Vite's resolver plus vite-node inlining `?raw` (verified in `node_modules/vite-node/dist/server.mjs`: `/[?&](init|raw|url|inline)\b/`). If S12 fails on it, the implementer stops and reports. It does not switch to JSON imports on its own.
- **Request limits:** more than 10000 cached real ids, or more than 1000 pending items of one kind, gives a 400. This is accepted (contract limits; a person fills the cache by hand). The error is shown and pending state is kept.
- **Derived `isDeleted` (DR-FE-4.2 rule 1)** goes slightly beyond the contract wording. It relies on the documented invariant, and Reset clears the cache, so it never outlives a restore.
- **No undo** of pending changes, apart from editing a value back to its original. Reset discards everything.
- **DB tree refresh cost:** one request per loaded DB level after each Apply. This is bounded by what the user expanded.
