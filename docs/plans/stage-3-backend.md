# Stage 3 (cache-core) — Backend plan

Machine-executable companion: [stage-3-backend.yaml](stage-3-backend.yaml).

## Goal

- Implement `POST /api/nodes/apply` exactly per `docs/ai/api-contract.yaml` v2 (`apply_semantics`): one transaction, validation before any DB access, 404 → 409 precedence, adds ordered parents first with temp-id mapping, edits, cascading soft delete (including descendants no client ever loaded), idempotent re-delete, and a response with `idMap` plus the post-apply `NodeDetails` of every referenced node.
- Close the stage-2 concurrency risk. Apply, Reset and the startup seed all take one shared transaction-scoped advisory lock as the first statement of their transaction.
- Remove the stage-2 stub: the 501 handler, `ProblemTypes.NotImplemented` and `ApplyStubTests.cs`.
- Close the stage-2 risk "host ports must be free". Compose host ports become overridable (`DB_PORT`, `API_PORT`, `UI_PORT`). Defaults, internal ports and service names stay the same.
- No schema change, no migration, no new NuGet package.

## Approach

| Concern | Choice |
|---|---|
| Feature layout | `Features/Apply/`: `ApplyEndpoints.cs` (one `MapGroup("/api/nodes")`), `ApplyDtos.cs` (wire types), `ApplyCommand.cs` (validated command + outcome), `ApplyValidator.cs` (pure, no DB), `ApplySql.cs` (raw SQL constants), `ApplyService.cs` (transaction), `ApplyProblems.cs` (400/404/409 results) |
| Shared | `Infrastructure/DbLocks.cs` (lock key + acquire helper); `Infrastructure/ProblemTypes.cs` gains `BadRequest`, `Conflict` and loses `NotImplemented` |
| Body | Read manually from `HttpRequest.Body` with the app's HTTP JSON options. Missing, empty, `null` or malformed body → 400 with error key `body`, whatever the Content-Type |
| Validation | Collects all errors and returns them in one `ValidationProblemDetails`, with JSON-path keys (`edits[0].value`, `adds[1].tempId`, `adds[2].parentTempId`, `adds[3]`, `edits`, `body`) |
| DB access | Raw Npgsql commands on EF's connection and transaction. Set-based: 1 lock/check query, 1 id allocation, 1 insert, 1 update, 1 cascade update, 1 response query, so the round-trip count is fixed whatever the batch size |
| Serialization | `SELECT pg_advisory_xact_lock(4242)` first in Apply, Reset and SeedIfEmpty |
| Responses | 200 `ApplyResponse`; 400 `ValidationProblemDetails`; 404/409 `ProblemDetails` with a `nodeIds` extension (sorted offending ids) |

### Request flow

1. **Parse.** `JsonSerializer.DeserializeAsync<ApplyRequest>` runs over the body. If it throws `JsonException` or returns `null`, the result is 400 `{"body": [...]}`.
2. **Validate** (`ApplyValidator.TryValidate`, pure):
   - `edits`, `adds` and `deletes` are present (required by the contract). `refreshIds` is optional.
   - Limits: at most 1000 each for edits, adds and deletes; at most 10000 refreshIds. Error key: the array name. When any array is missing or over its limit, validation stops there and per-item checks are skipped.
   - Edits: the item is not null; `id` is present; `id` is not repeated (the second occurrence is reported); `value` is valid.
   - Adds: the item is not null; `tempId` is non-empty, at most 64 chars and unique; exactly one of `parentId` / `parentTempId` is set (key `adds[i]`); `value` is valid.
   - Value: trimmed with `string.Trim()`. Length is counted in Unicode code points, which is the same unit as PostgreSQL `char_length` in `ck_nodes_value_length`, and must be 1..200. A NUL character or an unpaired surrogate gives 400 (PostgreSQL or the UTF-8 encoder would otherwise fail with 500).
   - `parentTempId` must name a tempId in the same request (key `adds[i].parentTempId`).
   - Cycles: Kahn's topological sort. Adds that are never placed (in a cycle, or hanging off one) each get `adds[i].parentTempId`.
   - `deletes` and `refreshIds` are de-duplicated silently.
   - Insert order is breadth-first: every add with a real `parentId` in request order, then their temp children level by level in request order. Parents therefore always get lower ids than their children.
3. **Transaction** (`ApplyService.ApplyAsync`, default READ COMMITTED):
   1. `BEGIN`, then `SELECT pg_advisory_xact_lock(4242)`.
   2. `SELECT id, is_deleted FROM nodes WHERE id = ANY(@ids) ORDER BY id FOR UPDATE` over edits ids ∪ deletes ids ∪ real add parents.
   3. Any id not found → **404** (rollback). Otherwise any edit target or real add parent with `is_deleted` → **409** (rollback). An already-deleted id in `deletes` is not a conflict.
   4. Adds: allocate N ids with `nextval` (`generate_series(1, N) ORDER BY 1`, ascending), assign them in insert order, resolve `parentTempId` through the map, then run one `INSERT … SELECT FROM unnest(...)`.
   5. Edits: one `UPDATE … FROM unnest(@ids, @nodeValues)`.
   6. Deletes: one recursive-CTE `UPDATE … SET is_deleted = TRUE`. It runs after adds and edits, so nodes added or edited under a node this batch deletes end up deleted (same-batch rule).
   7. Response: one query computes `NodeDetails` for edits ∪ deletes ∪ created ∪ refreshIds. It uses one recursive ancestor CTE with an `origin_id` column, then `array_agg … ORDER BY depth DESC`, so ancestors come out root → parent. Rows that do not exist (unknown refreshIds) do not appear. The result is ordered by id.
   8. `COMMIT`. Any exception propagates, disposing the transaction rolls back, and `UseExceptionHandler` returns 500 ProblemDetails.

## Decision record 1 — Request body binding

**Context.** The contract requires that a missing or invalid JSON body returns 400 `ValidationProblemDetails`, not 415 or 500. The frontend client always sends JSON, but curl and tests may not.

**Options.**
- *`[FromBody] ApplyRequest` parameter.* With no Content-Type, minimal APIs return 415. With a malformed body they return 400 through `BadHttpRequestException`, and the ProblemDetails has no `errors` map. That breaks the contract.
- *`ApplyRequest?` with `[FromBody(EmptyBodyBehavior = Allow)]`.* This still returns 415 when the Content-Type is wrong or missing, and malformed JSON still gives a non-validation 400.
- *Read `HttpRequest.Body` manually.* We control every failure, and the configured camelCase/Web JSON options are reused through `IOptions<Microsoft.AspNetCore.Http.Json.JsonOptions>`.

**Decision.** Read the body manually. Content-Type is not checked. All DTO members are nullable, so "missing" can be told apart from "default" and reported with a precise key.

**Consequences.** There is no automatic OpenAPI body metadata, which the project does not use. Type errors inside the JSON, such as a string where an id is expected, are reported under `body`, with the `System.Text.Json` path in the message.

## Decision record 2 — Set-based raw SQL on EF's connection

**Context.** A batch can hold 1000 adds/edits/deletes and 10000 refreshIds. The stage-2 notes suggested EF `SaveChanges` per add and `GetNodeDetailsAsync` per response id, which costs O(n) round trips.

**Options.**
- *EF tracked entities.* Adds would need a parent-first `SaveChanges` per dependency level to get the generated ids. Response details would be N+1 ancestor queries.
- *Raw Npgsql on the EF-managed connection and transaction.* Each phase is one statement over arrays (`unnest`, `= ANY`).

**Decision.** Use raw Npgsql commands (`NpgsqlCommand` on `db.Database.GetDbConnection()` with `transaction.GetDbTransaction()`). New ids are pre-allocated with `nextval` on the identity sequence and inserted explicitly; the column is `GENERATED BY DEFAULT`, so explicit ids are allowed. PostgreSQL checks the FK at the end of each statement, so a single `INSERT` can contain parents and their children (stage 2's seed insert relies on the same rule). The project rule "raw SQL allowed for recursive/subtree operations" covers the cascade and ancestor CTEs. The other three statements are raw for consistency within one transaction.

**Consequences.** The round-trip count is fixed. Ids grow monotonically, with parents before children. Rolled-back applies leave sequence gaps; sequences are not transactional, which the contract allows. `NodeQueries` (read endpoints) is unchanged.

## Decision record 3 — Validation keys, collection and determinism

- All validation errors are collected; there is no first-error-only short circuit. Exception: if an array is missing or over its limit, per-item checks are skipped so that 10001 items cannot produce 10001 messages.
- Keys are fixed: `body`, `edits`, `adds`, `deletes`, `refreshIds`, `edits[i]`, `edits[i].id`, `edits[i].value`, `adds[i]` (null item or not exactly one parent ref), `adds[i].tempId`, `adds[i].parentTempId` (unknown or cycle), `adds[i].value`.
- Unknown-parentTempId and cycle checks run only when every add passed its per-item checks, because the graph is not well-defined otherwise.
- Breadth-first insert order makes `idMap` values deterministic for a given request and sequence state. `idMap` is serialized in insert order.

## Decision record 4 — Write serialization (concurrency)

**Context.** A stage-2 open risk: under READ COMMITTED, Apply A adds a child under X while Apply B cascade-deletes X's ancestor. B's recursive CTE snapshot may miss A's uncommitted child, which leaves a live node under a deleted parent. Reset (TRUNCATE + reinsert) racing with Apply can also interleave.

**Options.**
- *SERIALIZABLE isolation with retries.* Correct, but it needs retry loops, and `EnableRetryOnFailure` is deliberately off (stage-2 DR5).
- *Row locks only (`FOR UPDATE` on referenced rows).* They do not cover the descendants a cascade reaches.
- *One global transaction-scoped advisory lock.* Writes are rare and short, and it is trivially correct.

**Decision.** Use `pg_advisory_xact_lock(4242)` (constant `DbLocks.TreeWriteLockKey`, bigint) as the first statement after `BEGIN` in `ApplyService.ApplyAsync`, `TreeSeeder.ResetAsync` and `TreeSeeder.SeedIfEmptyAsync`. `SeedIfEmptyAsync` moves its emptiness check inside the locked transaction. Referenced rows are also locked `FOR UPDATE … ORDER BY id`, which guards against writers outside the API (psql) and gives a stable lock order. The lock is released automatically on commit or rollback, including the early 404/409 returns.

**Consequences.** Writers are fully serialized and readers are never blocked by the advisory lock. A concurrent add under a node being cascade-deleted either commits first (and is then deleted by the cascade) or runs after it (and gets 409). The invariant "every descendant of a deleted node is deleted" always holds, and AC/tests check it with SQL.

**One-liner for CLAUDE.md Decisions:**
`Writes serialized: Apply, Reset and startup seed take pg_advisory_xact_lock(4242) (DbLocks.TreeWriteLockKey) as the first statement of their transaction; apply SQL is set-based raw Npgsql on EF's connection — see docs/plans/stage-3-backend.md#decision-record-4--write-serialization-concurrency`

## Decision record 5 — Error bodies

- 400: `Results.ValidationProblem` with type `https://tools.ietf.org/html/rfc9110#section-15.5.1`, title `One or more validation errors occurred.`
- 404: title `Not Found`, type `…#section-15.5.5`, detail lists the ids, extension `nodeIds` (sorted ascending, all missing ids from edits, deletes and adds.parentId).
- 409: title `Conflict`, type `…#section-15.5.10`, extension `nodeIds` (sorted; edit targets and real add parents that were already deleted).
- `nodeIds` is an additive ProblemDetails extension that the contract allows ("at least type, title, status"). The frontend may use it but must not depend on it until the organizer documents it. This is not a contract change request.

## Decision record 6 — Overridable host ports

`docker-compose.yml` publishes `"${DB_PORT:-5432}:5432"`, `"${API_PORT:-8080}:8080"` and `"${UI_PORT:-3000}:80"`. The defaults are unchanged, so every URL in the contract, the README and the ACs still holds. Container ports, service names and the `api:8080` proxy target do not change. Example: `API_PORT=18080 docker compose up --build`.

## Tree storage model

This is unchanged from [stage-2 DR1](stage-2-backend.md#decision-record-1--tree-storage-model): an adjacency list with recursive CTEs. Stage 3 confirms it needs no schema change. The cascade is one statement, ancestors for many ids take one statement, and inserts under new nodes are just an id lookup in `idMap`.

## Testing hand-off

`ApplyStubTests.cs` is deleted by the implementer. docs-and-tests writes the Apply tests from `test_matrix` in the yaml. It covers happy paths, temp-id chains, same-batch rules, cascade to never-loaded nodes, idempotency, every 400/404/409 case and precedence, atomic rollback (forced with a temporary test trigger), the advisory lock, parallel add-vs-cascade, and Reset after apply.

## Risks

- **`nodeIds` extension serialization** relies on reflection-based JSON for `long[]` inside ProblemDetails extensions. Reflection is the default in non-AOT .NET 8. AC curl checks verify it.
- **Lock key collision.** Only this app uses the database, so 4242 is safe. The key is defined once in `DbLocks`.
- **Long-held lock.** A 10000-id refresh query runs inside the locked transaction (for consistency). It is a single indexed CTE and takes milliseconds at this data size.
- **Development environment** still shows the developer exception page on 500 (stage-2 risk, unchanged).
