# Stage 4 (cache-pending-changes) — Backend plan

Machine-executable companion: [stage-4-backend.yaml](stage-4-backend.yaml).

## Goal

Stage 4 is mostly frontend work. The cache keeps edits, adds and deletes pending, builds the apply request per `client_rules` in `docs/ai/api-contract.yaml`, and resyncs after Apply. The backend has three jobs here:

1. Check that the stage-3 Apply endpoint already supports every stage-4 client flow.
2. Lock those flows in with integration tests that look exactly like the requests the cache builds.
3. Document stage-3 open risk 4 (ids are not reused after a failed apply) and give docs-and-tests an outline for the backend sections of the final README.

**Result: no production backend code changes are needed in stage 4.** `backend/src/` is not touched. The steps add tests under `backend/tests/` and update docs (`README.md`, `backend/CLAUDE.md`). No schema change, no migration, no NuGet change, no compose change, no contract change.

## Verification of the stage-4 client flows

All references are to the code as committed at the end of stage 3.

| # | Client flow (`client_rules`) | Server behaviour | Where | Already tested? |
|---|---|---|---|---|
| V1 | `refreshIds` holds **every** cached real id, including deleted and pending-delete ones, and the client learns about cascaded deletes of cached descendants (closes stage-3 open risk 1) | `responseIds` = edits ∪ deletes ∪ created ∪ refreshIds, de-duplicated. NodeDetails is loaded **after** the cascade inside the same transaction, so cascaded rows come back with `isDeleted=true`. Ids that already existed as deleted are returned like any other id, with no 409 (refreshIds are not part of the 404/409 checks). Unknown ids are skipped. | `ApplyService.cs:49` (cascade) before `:51-57` (response ids + load); `ApplySql.cs:38-46`, `:52-81`; `ApplyValidator.cs:29,50` (optional, ≤10000, distinct) | Partly: `ApplyCascadeTests.cs:45` (`RefreshIds_show_cascade`) and `ApplyHappyPathTests.cs:24`. **Not tested:** already-deleted ids in refreshIds, a full client-shaped refresh list, and the 10000 boundary itself (only 10001 → 400 at `ApplyValidationTests.cs:151-152`). |
| V2 | Deletes: the client sends only top-most pending deletes ("sending all is also valid") | A recursive CTE seeded with every delete id; `UNION` de-duplicates overlapping subtrees; already-deleted rows are skipped by `AND is_deleted = FALSE`. Deletes are excluded from the 409 check, so deleting an already-deleted node is idempotent. | `ApplySql.cs:38-46`; `ApplyService.cs:41` (409 set = edits ∪ real add parents only) | Yes: `ApplyCascadeTests.cs:30,89,101` |
| V3 | Adds whose `parentTempId` chain is several levels deep, sent in any order, mixed with adds under real parents | Kahn breadth-first order (parents before children); ids pre-allocated in one `nextval` batch and resolved through `idMap` in insert order; one `INSERT … unnest` (FK checked at end of statement). Depth is unbounded; ancestors come from one recursive CTE. | `ApplyValidator.cs:176-223`; `ApplyService.cs:98-110`; `ApplySql.cs:16-27` | 2–3 levels: `ApplyHappyPathTests.cs:60,76`. **Not tested:** a deep chain (beyond seed depth), or one sent deepest-first together with other adds, edits and deletes. |
| V4 | Edits + adds + deletes + refreshIds in one batch | Single transaction: adds → edits → cascade → response | `ApplyService.cs:47-49` | Unrelated nodes: `ApplyHappyPathTests.cs:97,107`. **Not tested:** the full client shape (top-most delete + temp chain + edits + full refresh). |
| V5 | Same-batch: edit/add under a node deleted in the same batch | Deletes run last, so those nodes end up deleted (the client discards such edits anyway) | `ApplyService.cs:47-49` | Yes: `ApplyCascadeTests.cs:67,79` |
| V6 | Stale cache: another client deleted an **ancestor** in the meantime (cascade), then this client edits a descendant / adds under it / deletes it | Edit target or real add parent with `is_deleted` → 409 with sorted `nodeIds`, returned before any write. Delete of a cascade-deleted node → 200 (idempotent). | `ApplyService.cs:33-45`; `ApplyProblems` | Partly: `ApplyErrorTests.cs:47,60` arrange the deleted flag **directly in the DB on the node itself**. **Not tested:** the cross-client flow where a second apply cascades from an ancestor, the `nodeIds` listing both offenders, a temp chain hanging off the stale parent, and the stale-but-idempotent delete. |
| V7 | Failed apply leaves nothing persisted, so the client may keep its pending state and retry | 400 happens before the DB; 404/409 return before `CommitAsync`, and disposing the transaction rolls back; any exception → rollback + 500 | `ApplyEndpoints` (validation first); `ApplyService.cs:20,36-45,59` | Yes: `ApplyErrorTests.cs:82`, `ApplyAtomicityTests.cs:12`, `ApplyValidationTests.cs:160` |
| V8 | After a 200 the client swaps temp ids for real ids from `idMap` and uses those real ids in the next apply (edit, add under, delete) | Created rows are ordinary rows | — | Indirectly (`ApplyCascadeTests.cs:56`). **Not tested:** a multi-apply resync sequence. |
| V9 | Open risk 4: sequence gaps | `nextval` runs only after the 404/409 checks (`ApplyService.cs:41-47`, allocation at `:98`). So 400/404/409 consume **no** ids. A failure after allocation (a DB error → 500) rolls back the rows but not the sequence, which leaves a gap. Reset restarts the sequence at 31. | `ApplyService.cs:47,98`; `ApplySql.cs:16-20`; `TreeSeeder.ResetAsync` | **Not documented in tests.** The stage-3 matrix said explicitly "do not assert the next generated id" (`stage-3-backend.yaml:1161`). Reset → 31 is tested (`ResetTests.cs:36,118`). |

**Conclusion.** No bug and no missing behaviour. Every gap is a test gap, closed by `test_matrix` in the yaml:

- 7 new tests in a new `Apply/ApplyClientFlowTests.cs`.
- 2 new tests in `Apply/ApplyAtomicityTests.cs`. The existing test in that file moves to shared trigger helpers; its behaviour does not change.

### Notes for the frontend (no backend action)

- **409 recovery works without a backend change.** After a 409 the cache keeps its pending state. The user reloads the `nodeIds` nodes (`GET /api/nodes/{id}`), which now come back `isDeleted=true`. `request_building` then drops their edits and the temp nodes under them, so the next Apply succeeds. V6 tests the server half of this.
- **Not every cascaded descendant is in `nodeIds`.** A 409 `nodeIds` list contains only edit targets and real add parents. Other cached descendants of the remotely deleted ancestor do not appear there. The client learns about them on reload, or from `refreshIds` in the next successful apply.

## Approach

| Concern | Choice |
|---|---|
| Production code | Unchanged (`backend/src/` has no diff) |
| New tests | `backend/tests/TreeEditor.Api.Tests/Apply/ApplyClientFlowTests.cs`. Requests are written exactly as the cache builds them: top-most deletes only, `refreshIds` = every cached real id in ascending order, temp chains sent deepest-first. The DB invariant is checked after every test, the same way as in `ApplyCascadeTests`. |
| Sequence tests | Two facts added to `ApplyAtomicityTests.cs`. The boom-trigger install/drop moves into two private helpers so the rollback test and the gap test share them. |
| Who writes | docs-and-tests (tests + README + `backend/CLAUDE.md`). No plan-implementer dispatch is needed for the backend in stage 4. |
| Exact content | The yaml gives the full C# content of both test files. The expected ids follow from the seed (1..30, next id 31) and the breadth-first insert order. |

## Decision record 1 — No backend production change in stage 4

**Context.** Stage 4 adds client-side pending changes. The contract's wire format is unchanged since v2, and `client_rules` only bind the client.

**Options.**
- *Add a dedicated resync endpoint* (for example `POST /api/nodes/details` with a list of ids). Rejected. `apply` with empty change arrays and `refreshIds` already does the same thing, and the task limits cache DB access to "load" and "apply".
- *Return cascaded descendants automatically* (every deleted subtree id in the response). Rejected in stage 3. It would make the response unbounded for large subtrees, and `refreshIds` limits it to what the client actually holds.
- *Change nothing; add tests.* Chosen.

**Decision.** Stage 4 makes no change under `backend/src/`. The verification table above is the evidence, and the new tests pin the behaviour down.

**Consequences.** The backend diff is tests and docs only. The risk is limited to test correctness (exact expected ids). Those values are deterministic because every test starts from a fresh Reset (sequence at 31) and tests in the `ApiCollection` run one at a time.

## Decision record 2 — Sequence gaps are accepted (stage-3 open risk 4)

**Context.** New ids come from `nextval` on the identity sequence. Sequences are not transactional, so a rolled-back apply that has already drawn ids leaves them unused forever.

**Options.**
- *`max(id)+1` under the advisory lock.* Writers are serialized, so this would be gap-free. It costs a scan per apply, duplicates the identity logic, and still does not make ids meaningful.
- *Allocate ids later.* Already done: allocation happens after validation, 404 and 409. Only unexpected DB failures (500) can leave a gap.
- *Accept gaps.* Chosen. The contract treats ids as opaque, server-generated values, and the client only ever uses `idMap`.

**Decision.** No code change. Two tests document the behaviour. A 400, 404 or 409 consumes no id (the next add gets 31). A 500 after allocation leaves a gap (the next add gets 33 after two ids were drawn). The README gets a "Known behaviour" note.

**Consequences.** Ids are monotonic but not dense. Ids are reused only across a Reset, because the sequence restarts at 31. A second browser tab that still caches ids from before another tab's Reset can therefore see a refreshed id point at a different node. The single-user scope accepts this. The README mentions it, and the client already clears its own cache on its own Reset.

## Decision record 3 — Tree storage model (unchanged, confirmed for stage 4)

**Context.** Stage 4 adds no new tree operation. Each pending-changes flow maps to an existing primitive:

- Insert under new nodes uses `idMap` resolution plus one `INSERT`.
- Cascade of never-loaded descendants is one recursive CTE `UPDATE`.
- Lazy children use the `(parent_id, id)` index.
- Ancestors for placing a node in the cache come from one recursive CTE.
- Reset is `TRUNCATE` plus a fixed-id re-insert.

**Options considered** (stage 2 DR1, re-checked):

- *Adjacency list + recursive CTE.* One-row inserts (including under new nodes). Cascade and ancestors each take one statement. Trivial reset.
- *Materialized path / ltree.* Fast subtree reads, but inserts under a temp parent need the parent's path, which is resolved in the same batch.
- *Closure table.* O(depth) rows per insert, and the 50-level chain test would write about 1500 closure rows.
- *Nested sets.* Every insert renumbers the tree, and every concurrent writer conflicts.

**Decision.** Keep the adjacency list (`nodes.parent_id`, immutable via trigger) with recursive CTEs and the index `(parent_id, id)`.

**Consequences.** No schema change. The deep-chain test (50 levels below a depth-5 seed node) runs the recursive ancestor CTE at depth 54.

**One-line summary for CLAUDE.md Decisions** (unchanged from stage 2; no new line needed):
`Tree storage: adjacency list (nodes.parent_id, immutable via trigger) + recursive CTEs for ancestors / subtree soft-delete; index (parent_id, id) — docs/plans/stage-2-backend.md#decision-record-1--tree-storage-model`

**Optional new Decisions line for the organizer** (sequence gaps):
`Ids: identity sequence, never reused except across Reset; 400/404/409 consume no ids, a 500 after allocation leaves a gap (accepted) — docs/plans/stage-4-backend.md#decision-record-2--sequence-gaps-are-accepted-stage-3-open-risk-4`

## README hand-off (backend sections)

docs-and-tests writes the final `README.md`. The yaml `readme_backend_outline` fixes the backend sections: Quick start, Tests (backend), API/Apply, Database schema (table, constraints, index, trigger, identity, write lock, invariant), Tree model, Key decisions (backend), and Known behaviour, with the exact Known-behaviour sentences. Frontend sections and the status line come from the frontend plan or the organizer.

## Risks

- **Request limits vs. the "send every cached id" rule.** `refreshIds` is capped at 10000, and edits/adds/deletes at 1000 each. A cache with more real ids, or more pending changes, gets a 400 (key `refreshIds`, `edits`, `adds` or `deletes`). Batches cannot be split, because Apply must be atomic. This is unrealistic for the 30-node seed and accepted. The frontend shows the ProblemDetails (contract `failure_handling`). The new boundary test proves 10000 is accepted.
- **Cross-tab Reset** reuses ids from 31 (DR2). Documented in the README and not fixed (single-user scope).
- **Test determinism.** Expected ids (31..35, 33 after a gap, 80 for a 50-chain) assume the stage-3 breadth-first insert order and a per-test Reset. Both are already relied on by stage-3 tests (`ApplyHappyPathTests.cs:76`, `ResetTests.cs:118`).
- **Trigger leakage.** The new gap test installs the boom trigger like the existing rollback test. Both drop it in `finally` through the shared helper. If a run is aborted mid-test, the trigger survives only in that run's throwaway Testcontainers database.
