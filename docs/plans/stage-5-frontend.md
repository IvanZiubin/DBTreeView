# Stage 5 (ui-update) — Frontend plan

AI-executable companion: [stage-5-frontend.yaml](stage-5-frontend.yaml). Design source: [../design/stage-5/](../design/stage-5/README.md) (`tree-editor.dc.html` mock, `industry-styles.css` tokens). Contract: [../ai/api-contract.yaml](../ai/api-contract.yaml) v2 plus `client_rules`. It is consumed as-is: no backend or contract changes.

## Goal

- Restyle the SPA to the "Industry" Tree Editor. That means Industry tokens and component classes as the global stylesheet, Barlow and Barlow Condensed, steel accent, square blueprint frames with `+` corner marks, a header bar with brand and Reset, DB and Cache blueprint panels with a 150px transfer gutter between them, hairline tree rows, SVG link lines, a collapsible network log, blueprint toasts and the Apply / Reset / Clear-cache dialogs, plus motion.
- Every stage 2–4 behaviour stays: lazy DB tree, hierarchy assembly, pending edit / add / delete until Apply, cascade, temp-id mapping, refresh after Apply, and Reset. The pure modules (`src/cache/*.ts`) and the stores change only where the new UI needs them.
- New **Clear cache** button. It is client-only, sends no request and leaves the DB untouched. It asks for confirmation only when there are pending changes, and it is disabled when the cache is empty or while an apply is running.
- **Network log** of every real API call: method, path, status and duration, recorded inside `src/api/client.ts`.
- **One load path.** The button, double-click and drag-and-drop all call `useTransferStore().loadIntoCache`, which is the only caller of `getNode`.
- PrimeVue is **removed**.

Out of scope (roadmap `scope.out`): the row-style switcher (only hairline ships), the mock's simulated latency and in-memory API, and any backend or contract change.

## Files

| File | Action |
|---|---|
| `frontend/package.json`, `package-lock.json` | chore-runner: remove primevue, @primeuix/themes, @primeuix/styles, primeicons and the `overrides` block; add `lucide-vue-next` 0.525.0 (exact) |
| `frontend/index.html` | Google Fonts `<link>`s |
| `frontend/src/styles/industry.css` | **new**, verbatim port of `industry-styles.css` (minus the font `@import`) |
| `frontend/src/styles/app.css` | **new**, every app class (layout, panels, rows, gutter, link lines, network log, toasts, dialogs, motion) |
| `frontend/src/style.css` | **deleted** |
| `frontend/src/cache/model.ts` | + `CacheTreeNode` (replaces PrimeVue `TreeNode`) |
| `frontend/src/cache/hierarchy.ts` | `TreeNode` → `CacheTreeNode`; + `reparentedKeys` |
| `frontend/src/stores/cache.ts` | `TreeNode` → `CacheTreeNode`; + `lastIdMap` |
| `frontend/src/stores/dbTree.ts` | `TreeNode` → `DbTreeNode` |
| `frontend/src/api/client.ts` | + `RequestObserver` / `setRequestObserver`, so every request reports start / finish |
| `frontend/src/api/networkLog.ts` | **new**, pure log model |
| `frontend/src/view/types.ts`, `treeRows.ts`, `linkLines.ts`, `dialogs.ts`, `transfer.ts` | **new**, pure view models |
| `frontend/src/stores/networkLog.ts`, `toasts.ts`, `highlight.ts`, `transfer.ts` | **new** Pinia stores |
| `frontend/src/motion/motion.ts` | **new**, DOM-only Web Animations helpers |
| `frontend/src/errors.ts` | uses the toast store instead of PrimeVue's `useToast` |
| `frontend/src/components/*` | rewritten: `AppHeader`, `DbTreeView`, `CachedTreeView`; new: `TransferGutter`, `LinkLines`, `NetworkLog`, `ToastStack`, `ConfirmDialog`, `StatusTags`, `BlueprintCorners`; deleted: `NodeLabel`, `NodeValueDialog` |
| `frontend/src/App.vue`, `src/main.ts` | new layout; network-log observer registration |
| `frontend/src/dependencyPins.test.ts` | rewritten: guards "no PrimeVue, lucide pinned" |
| `frontend/src/stores/cache.clear.test.ts` | **new**: Clear cache sends no request and empties the state |
| `frontend/CLAUDE.md` | rewritten (layout, styling approach, design source) |

## UI and state design

```
App.vue  .app-shell (100vh flex column)
  AppHeader        .nav: Database icon + "Tree Editor" | Reset (.btn-secondary, RefreshCw spins) -> ConfirmDialog
  main.workspace   grid: minmax(0,1fr) | 150px | minmax(0,1fr), position: relative
    DbTreeView      .panel.blueprint: kicker "DBTreeView", h3 "Database", [Load into cache] (.btn-primary.blueprint)
                    rows: guides, chevron/spinner or leaf dot, value, 'deleted' tag, #id, cached square; draggable
    TransferGutter  drag card | "Loading" / "Last load" card (GET path · status · ms · n re-parented) | hint
    CachedTreeView  .panel.blueprint: kicker "CachedTreeView", h3 "Cache",
                    [Edit] [Add child] [Delete] [Clear cache] (.btn-secondary) [Apply n] (.btn-primary.blueprint)
                    rows: guides, chevron or leaf dot, value or inline .input, tags, flash tag, "parent #id" gap hint, #id | tmp
                    drop overlay "Drop to load"; Apply dialog (itemised); Clear-cache dialog
    LinkLines       absolute SVG over the workspace; bezier per key cached in both panels
  NetworkLog       footer: toggle (count tag, pulse dot, last summary) + table time/method/path/status/duration
  ToastStack       top-right blueprint toasts (3.2 s; errors 6 s)

Pinia stores
  dbTree      (stage 2-4; TreeNode type swapped)    cache    (stage 3-4; + lastIdMap)
  transfer    pendingLoad, lastLoad, drag, flight; loadIntoCache(id, label), startDrag, endDrag, reset
  highlight   hover {side, key}, flash {'c:<key>'|'db:<key>' -> tag}; setHover, clearHover, isLinked, flashKeys, isFlashing, flashTag, clear
  networkLog  entries (newest first, max 80), open; start(method, path), finish(id, status, ms), toggle
  toasts      toasts; show({severity, summary, detail, lifeMs?}), dismiss(id)
```

## Decision records

### DR-FE-5.1 PrimeVue is removed, not overridden
None of the PrimeVue components survives the design. The Tree cannot render hairline guides, drag sources, inline editors or measurable `data-*-row` anchors for link lines without fighting its markup. Dialog, Toast, Button and Tag would each need every Aura token overridden to look like a transparent, square blueprint object. Keeping PrimeVue would mean a second styling system and the `@primeuix/styles` pin hazard (stage-3 fix, DR-FE-4.9) for no benefit. So the plan removes `primevue`, `@primeuix/themes`, `@primeuix/styles`, `primeicons` and the `overrides` block from `package.json`, and the components become plain Vue on the Industry classes.
- PrimeVue's `TreeNode` type is replaced by `CacheTreeNode` in `src/cache/model.ts` and by `DbTreeNode` in `src/view/types.ts`. Both keep the same shape (`key`, `label`, `leaf`, `children`, `data`), so the existing tests compile and pass without edits.
- `src/dependencyPins.test.ts` is rewritten. It now fails if any PrimeVue package (`primevue`, `@primeuix/themes`, `@primeuix/styles`, `@primeuix/styled`, `primeicons`) reappears in dependencies or devDependencies, if an `overrides` block reappears, or if `lucide-vue-next` is not exactly `0.525.0`. It no longer reads `node_modules/@primeuix/...`.
- The `frontend/CLAUDE.md` pin rule changes to: "No UI component library: PrimeVue was removed in stage 5 (DR-FE-5.1). Do not add primevue / @primeuix/* / primeicons. Icons come only from lucide-vue-next 0.525.0 (exact). `src/dependencyPins.test.ts` enforces both."
- The root `CLAUDE.md` Decisions line about the PrimeVue pin is superseded (see summaries below).

### DR-FE-5.2 Styling: two global stylesheets, tokens only
- `src/styles/industry.css` is a byte-for-byte copy of `docs/design/stage-5/industry-styles.css` from line 3 on, with a new header comment. Only the Google Fonts `@import` is dropped (see DR-FE-5.3). Unused classes (`.seg`, `.radio`, `.duotone`) stay, so a future re-port is a plain diff.
- `src/styles/app.css` holds every app class. Naming is BEM-like (`panel__header`, `tree-row__value`) with state classes `is-selected`, `is-linked`, `is-flash`, `is-struck`, `is-open`. Components have **no `<style>` blocks**. All CSS is in these two files, so one grep proves the token rule.
- Colors only come from `var(--color-*)` and `color-mix()` of them, and fonts only from `var(--font-heading|body)`. `app.css` defines one app-level `:root` block: `--font-mono` (the mock's monospace stack, the only font name outside `industry.css`) and the fixed geometry from the mock (`--row-height 30px`, `--row-indent 18px`, `--toggle-size 18px`, `--gutter-width 150px`, `--panel-header-height 66px`, `--toast-top 62px`, `--toast-width 320px`). Paddings and gaps use `--space-*`.
- Acceptance greps: no hex color and no `Barlow` / `sans-serif` outside `industry.css`, no `var(--p-`, and no `<style` in components.

### DR-FE-5.3 Fonts and icons
- **Fonts:** `<link rel="preconnect">` ×2 plus `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;700&family=Barlow+Condensed:wght@400;600&display=swap">` in `index.html`. This is the same URL as the design's `@import`, but non-blocking for CSS parsing. There are no npm font packages. Offline, the stack falls back to `system-ui`.
- **Icons:** `lucide-vue-next` **0.525.0**, saved exact. Every icon is used as `<Name :size="N" :stroke-width="1.5" />`; stroke 1.5 is explicit at each use site. The set: `Database` (brand), `RefreshCw` (Reset), `Download` (Load into cache, drop overlay), `LoaderCircle` (spinners), `ChevronRight` (row toggle), `ChevronUp` (log toggle), `Pencil`, `Plus`, `Trash`, `Eraser` (Clear cache), `Check` (Apply), `Activity` (network log) and `ArrowRight` (drag card).

### DR-FE-5.4 Own tree rendering via pure row flattening
`buildCacheTree` (stage 3) is unchanged and still the only place that assembles the hierarchy. `src/view/treeRows.ts` adds the pure functions `flattenDbTree(roots, expandedKeys)` and `flattenCacheTree(tree, expandedKeys)`. They produce one flat `DbRow[]` / `CacheRow[]` with a `depth` each, and the views render that with a single `v-for`, with no recursion.
- **Expansion:** the stores' existing `expandedKeys` records. A DB row counts as expanded only when its key is set **and** its children are loaded, so a spinner shows while they are fetched (as in the mock).
- **Selection:** `dbTree.selectionKeys = { [key]: true }`, and `cache.selectedKey` in the cache.
- **Rows:** `role="treeitem"`, `tabindex="0"`, `aria-level`, `aria-selected` and `aria-expanded`. The chevron is a real `<button>` (keyboard expand).
- **Keys:** Enter / Space select a row. F2 or double-click on a cache row starts editing.
- **Status tags** come from `statusTag(nodeStatus(node))`: new → `tag tag-accent`, edited → `tag tag-outline`, to delete / deleted → `tag tag-neutral`.
- **Struck value:** for `deleted` and `pending-delete`.
- **Gap marker:** the stage-3 gap marker becomes the mock's right-aligned mono `parent #<parentId>` hint. It keeps `data-testid="cache-gap-marker"`, the `gapTooltip` title and `data-gap-depth`.

### DR-FE-5.5 Network log: observer hook in the API client
`client.ts` gets `setRequestObserver(observer | null)`, where `RequestObserver = { start(method, path): number; finish(id, status, durationMs): void }`.
- **Inside `request()`:** `start` runs before `fetch`. `finish` runs in a `finally` with the HTTP status (`0` for a network failure) and `Math.round(performance.now() - t0)`, measured up to the parsed body. All HTTP already goes through `request()`, so every UI call is logged and nothing else can be.
- **Wiring:** `main.ts` registers the Pinia `networkLog` store as the observer right after `app.use(pinia)`, before mount, so `GET /api/nodes/roots` is logged too. The client stays free of Pinia, and the store tests that mock the client are unaffected.
- **Pure helpers:** `src/api/networkLog.ts` has `formatClockTime`, `addEntry` (newest first, cap 80), `completeEntry`, `statusLabel` ('pending' / 'failed' / code), `statusTagClass` (2xx accent, pending neutral, else outline), `durationLabel`, `entrySummary` ("GET /api/nodes/4 → 200 · 12 ms") and `requestCountLabel`.
- **Lifetime:** the log is never cleared by Reset or Clear cache. It is a history of real requests, and Clear cache adds no entry because it makes no request.

### DR-FE-5.6 Clear cache is client-only and reuses `cache.clear()`
- **Button:** `[Clear cache]` (`.btn-secondary`, `Eraser` icon, `data-testid="cache-clear"`) sits between Delete and Apply.
- **Decision:** the pure `decideClearCache({ isEmpty, applying, pendingCount })` returns `'disabled'` (empty or applying; the button is `:disabled`), `'confirm'` (pending changes) or `'clear'`.
- **Confirmation:** an Industry `ConfirmDialog` with title "Clear cache?", body `clearCacheMessage(n)` ("3 unapplied changes will be lost." / "1 unapplied change will be lost.") and confirm label "Clear cache".
- **Clearing:** cancels the inline editor, then calls `cache.clear()`, `transfer.reset()` and `highlight.clear()`, then shows the info toast "Cache cleared" / "The local cache is empty. The database was not changed."
- **What `cache.clear()` already covers** (the same function Reset uses): it empties nodes, selection, expansion and the temp sequence (back to `tmp-1`), and bumps `epoch`, so an in-flight load or apply response is discarded. The DB-row cached markers and link lines are derived from `cache.nodes` and disappear with it.
- **No request:** the client is never touched, so no fetch happens and no network-log entry is created. `src/stores/cache.clear.test.ts` proves this with a stubbed `fetch` and a spy observer.

### DR-FE-5.7 One load path: `useTransferStore().loadIntoCache(id, label)`
- **The call:** the DB button, row double-click and the cache-panel drop all call `loadIntoCache`. It is the only caller of `getNode`; an acceptance grep checks this.
- **Steps:**
  - It ignores calls while a load is in flight and returns false (the button is disabled then).
  - It records `pendingLoad`, calls `getNode`, then drops the result if `cache.epoch` changed or `transfer.reset()` ran meanwhile (Reset / Clear cache).
  - Before `cache.loadNode(details)` it computes `reparentedKeys(cache.nodeList, id)` (new, pure, in `hierarchy.ts`). These are the cached nodes that will move under the newly inserted node: their `ancestorIds` contain it and nothing cached lies between. A reload of an already cached node re-parents nothing.
  - It then sets `lastLoad = { id, label, status, durationMs, reparented }`, flashes the moved rows with `re-parented`, and for nodes new to the cache sets `flight` (fly-in animation).
- **On failure:** it records the error status in `lastLoad` and calls `reportError`.
- **Gutter:** the card shows `GET /api/nodes/{id}` and `lastLoadStatusText` ("200 · 14 ms · 2 re-parented").

### DR-FE-5.8 Inline editor replaces the Edit / Add child dialog
- **Opening:** Edit (button, double-click or F2) swaps the row value for an `.input` with the value preselected.
- **Keys:** Enter and blur commit; Escape cancels.
- **Commit:**
  - An invalid value (`validateValue`) shows an error toast "Invalid value" with the validation message and keeps the old value.
  - An unchanged value is a no-op.
  - Otherwise it calls `cache.editValue`.
- **Add child:** follows the mock. It immediately calls `cache.addChild(parent, 'New node')`, a pending `new` row, and opens the editor on it. Escape keeps "New node". This is the one visible behaviour change against stage 4, where a dialog asked for the value first; the pending-add semantics are identical.
- **Other actions:** Apply and Clear cache commit or cancel an open editor first. The editor closes when `cache.epoch` changes. `NodeValueDialog.vue` is deleted.

### DR-FE-5.9 Apply dialog itemises a plan preview
- **Plan:** Apply opens a dialog built from `buildApplyPlan(cache.nodes)`, which is pure and has no side effects. While the modal is open, nothing can change the plan. Confirm calls the unchanged `cache.apply()`.
- **Items:** the pure `buildApplyItems(plan, nodes)` lists, in this order:
  - `add` items: "<value> under <parent label>", where the parent label is "#id value" for a real parent and "value" for a temp parent.
  - `edit` items: "#id original → new".
  - `delete` items: "#id value and all descendants". Only the top-most deletes are listed, matching what is sent.
  - `discard` items: dropped temp nodes ("<value> (new) is discarded") and discarded edits ("#id edit is discarded (node is deleted)"). The user sees everything Apply will settle.
- **Summary:** `applySummary(plan)` gives "N pending change(s) will be written to the database in one transaction." If nothing is sent, it says "Nothing will be written to the database; discarded local changes are removed from the cache."
- **Cascade note:** shown when `deletes` is non-empty.
- **After success:** the success toast keeps `describeApplyPlan`. Flash tags `saved` mark edited rows and `saved #<id>` marks added rows, using the new `cache.lastIdMap`; the matching DB rows get highlight-only flashes. Then `dbTree.refresh()` runs as in stage 4.

### DR-FE-5.10 Link lines: pure geometry, measured from the DOM
- **Measuring:** `LinkLines.vue` is an absolutely positioned SVG over `main.workspace`. It reads the `[data-db-row]` rows inside `[data-testid=db-tree-body]` and the `[data-cache-row]` rows inside `[data-testid=cache-tree-body]`.
- **Geometry:** `computeLinkLines` in the pure `src/view/linkLines.ts` turns those boxes into lines.
  - A line exists only for keys visible in both scroll bodies (2px margin).
  - x1 is the DB body's right edge and x2 the cache body's left edge, both relative to the workspace. y1 and y2 are the rounded row centres.
  - A line is active when its key is hovered or selected on either side. Active lines sort last so they draw on top.
- **Drawing:** `linkPath` gives the mock's cubic bezier (`M x1 y1 C x1+dx/2 y1, x2-dx/2 y2, x2 y2`). Inactive lines are dashed `--color-neutral-400`; active ones are solid accent at 1.5. Each end gets a 5px square.
- **Re-measure triggers:**
  - A post-flush deep watch on tree, expansion, selection, hover and transfer state.
  - Scroll anywhere in the workspace (capture listener), window resize and a `ResizeObserver`.
  - Each trigger also schedules a second measure 760 ms later, after the FLIP (460 ms) and fly-in (720 ms) animations.
  - `requestAnimationFrame` throttles measuring, and `sameLines` skips no-op updates.

### DR-FE-5.11 Motion
- **Helpers:** `src/motion/motion.ts` contains DOM-only Web Animations helpers, not unit-tested:
  - `captureRowRects` / `playFlip`: FLIP translate for moved rows, 460 ms; fade-in from the left for new rows, 320 ms.
  - `flyChip`: an accent chip flies from the DB row value to the cache row in 720 ms, and the target row stays invisible until the chip arrives.
- **Wiring in CachedTreeView:** a computed row signature (`key/depth` list) has two watchers. The `flush: 'pre'` watcher captures rects before the DOM update; the `flush: 'post'` watcher plays FLIP. Every load, add, collapse, re-parent, apply and clear animates the same way.
- **Fly-in:** only for `transfer.flight`, which is a node new to the cache, and each flight `seq` plays once.
- **Flash tags:** `re-parented`, `cascade` (cached descendants newly marked by Delete) and `saved` / `saved #id` live in the highlight store for 1800 ms.
- **Reduced motion:** `prefersReducedMotion()` turns every JS helper into a no-op, and an `@media (prefers-reduced-motion: reduce)` block in `app.css` shortens every CSS animation and transition to 0.01 ms.

### DR-FE-5.12 Toasts and dialogs without a library
- **Toasts:** `useToastStore` has `show({ severity, summary, detail, lifeMs? })`, default 3200 ms, keeps at most 4 toasts and auto-dismisses them; a click also dismisses. `errors.ts` keeps `reportError(err)` / `describeError`; `installErrorToast` now takes the store's `show`, and error toasts live 6000 ms. `ToastStack.vue` renders blueprint cards: kicker = severity, title, detail, with `role="alert"` for errors and `status` otherwise.
- **Dialogs:** `ConfirmDialog.vue` has props `open`, `title`, `confirmLabel`, `wide` and `testid`, emits `confirm` / `cancel`, and takes a default slot for the body.
  - It teleports to `body`, renders `.dialog-backdrop` > `.dialog.blueprint` with the background set to `--color-bg`, and moves focus to Cancel on open.
  - Escape and a backdrop click cancel.
  - It is used for Reset, Clear cache and Apply.

### DR-FE-5.13 Accessibility and minimum width
- **Focus:** keyboard focus uses the global Industry `:focus-visible` accent ring. Rows use `outline-offset: -2px` so the scroll body does not clip the ring.
- **Width:** `body { min-width: 1024px }`. At 1024px each panel is about 415px wide, and the cache toolbar (five buttons) wraps under the heading via `flex-wrap`. Below 1024px the page scrolls horizontally, which is the stated minimum.

## Edge cases kept from stages 2–4

- **Reset during a load or apply:** `cache.clear()` bumps `epoch`, and `transfer.reset()` drops `pendingLoad`, so late responses are discarded (stage 3 / DR-FE-4.6).
- **Clear cache during a load:** the same as Reset, minus the DB call.
- **Loads under a pending-delete ancestor** still become "to delete" (`propagateDeletes` inside `mergeServerNodes`, untouched).
- **Failed Apply:** keeps every pending flag, because `cache.apply()` is untouched. The dialog has already closed, and the error toast shows the ProblemDetails.
- **Actions disabled:** Edit / Add child / Delete stay disabled for effectively deleted nodes and while applying (`canModifySelected`). Apply is disabled with no pending changes or while applying.

## Test plan

The implementer writes `src/dependencyPins.test.ts` (rewritten) and `src/stores/cache.clear.test.ts` (K1–K3, complete). docs-and-tests writes the `test_matrix` in the yaml:
- `src/api/client.test.ts`: the observer and status codes, with fetch stubbed.
- `src/api/networkLog.test.ts`
- `src/stores/networkLog.test.ts`
- `src/cache/reparent.test.ts`
- `src/view/treeRows.test.ts`
- `src/view/linkLines.test.ts`
- `src/view/dialogs.test.ts`
- `src/view/transfer.test.ts`
- `src/stores/transfer.test.ts`
- `src/stores/highlight.test.ts`
- `src/stores/toasts.test.ts`

Everything runs in Vitest's Node environment with no DOM. Components and `motion.ts` are covered by the manual checks.

## What README.md must say (docs-and-tests)

- **UI:** the "Industry" design, from `docs/design/stage-5/`, with two blueprint panels joined by link lines. Load into cache works by button, double-click or drag-and-drop; all three use one `GET /api/nodes/{id}`.
- **Cache editing:** inline (Enter / Escape / blur), with tags new / edited / to delete / deleted and an Apply dialog listing every change.
- **Clear cache:** empties the local cache including unapplied changes and temp ids. It makes no API call and leaves the database untouched, and it confirms first when changes would be lost.
- **Network log:** a collapsible footer that lists every API request (method, path, status, duration).
- **Styling:** no UI component library. The Industry tokens are ported to `frontend/src/styles/industry.css` and the app classes are in `app.css`. Fonts are Barlow / Barlow Condensed (Google Fonts) and icons are Lucide (`lucide-vue-next`).
- **Motion:** honours `prefers-reduced-motion`. The layout's minimum width is 1024px.
- **Frontend tests:** extend the list with the network log, view models, transfer and Clear-cache tests.

## One-line summaries for CLAUDE.md Decisions

- **UI library / styling:** PrimeVue removed in stage 5. The UI is plain Vue on `src/styles/industry.css` (verbatim Industry port) + `src/styles/app.css` (app classes, tokens only, no component `<style>`). Icons: `lucide-vue-next` 0.525.0 exact, stroke 1.5. Fonts: Google Fonts link. `src/dependencyPins.test.ts` now guards "no PrimeVue packages/overrides, lucide pinned". Replaces the PrimeVue pin decision. [DR-FE-5.1–5.3](stage-5-frontend.md#decision-records)
- **Network log / load path / Clear cache:** `client.ts` reports every request to a `RequestObserver` (the Pinia `networkLog` store, registered in `main.ts`). Button, double-click and drop all load through `useTransferStore().loadIntoCache` (the sole `getNode` caller). Clear cache is client-only: `cache.clear()` + `transfer.reset()` + `highlight.clear()`, with a confirmation only when there are pending changes. [DR-FE-5.5–5.7](stage-5-frontend.md#decision-records)

## Risks

1. **`lucide-vue-next@0.525.0` availability.** The package is being superseded upstream by `@lucide/vue`. Prerequisite P2 checks that the exact version exists in the registry. If it does not, the chore-runner stops and the organizer re-plans; the implementer must not substitute another version.
2. **No DOM tests.** Components, link-line measurement, drag-and-drop and motion are verified only by the manual checks, but all their decision logic is in tested pure modules.
3. **Google Fonts offline.** Without network the UI falls back to `system-ui`. Layout stays intact; this is accepted.
4. **Keyboard tree navigation is simpler than PrimeVue's:** Tab / Enter / Space / F2 and focusable chevrons, with no arrow-key roving. Acceptable for this app; noted for a later stage.
5. **Visible Add child change** (DR-FE-5.8): a `New node` pending add appears immediately. Escape does not undo the add; Delete on it drops it at Apply (stage-4 dropped-temp rule).
6. **FLIP for every signature change** includes the re-key after Apply. Rows whose key changed `tmp-n` → id fade in instead of sliding. This is cosmetic.
