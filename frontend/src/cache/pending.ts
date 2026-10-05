// Pure pending-change logic for the cache (no Vue/Pinia imports).
import type { ApplyAdd, ApplyEdit, ApplyRequest } from '../api/types'
import { compareCacheIds } from './hierarchy'
import { cacheKey, type CacheId, type CachedNode } from './model'

/** Contract value_rules: the server trims the value; the trimmed length must be 1..200. */
export const MAX_VALUE_LENGTH = 200

/** tempId -> real id, as returned in ApplyResponse.idMap. */
export type IdMap = Readonly<Record<string, number>>

/** Display status of a cached node, by priority: deleted > pending-delete > new > edited > clean. */
export type NodeStatus = 'clean' | 'new' | 'edited' | 'pending-delete' | 'deleted'

/** Error message for an invalid value (checked after trim), or null when the value is valid. */
export function validateValue(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return 'Value must not be empty.'
  }
  if (trimmed.length > MAX_VALUE_LENGTH) {
    return `Value must be at most ${MAX_VALUE_LENGTH} characters.`
  }
  return null
}

/** Deleted in the DB (isDeleted) or marked deleted in the cache (isPendingDelete). */
export function isEffectivelyDeleted(node: CachedNode): boolean {
  return node.isDeleted || node.isPendingDelete
}

/** Cached ancestors of a node in ancestorIds order (root -> parent); uncached levels are skipped. */
function cachedAncestors(node: CachedNode, nodes: Readonly<Record<string, CachedNode>>): CachedNode[] {
  const result: CachedNode[] = []
  for (const ancestorId of node.ancestorIds) {
    const ancestor = nodes[cacheKey(ancestorId)]
    if (ancestor) {
      result.push(ancestor)
    }
  }
  return result
}

/** True when any cached ancestor is deleted or pending delete. */
export function hasEffectivelyDeletedAncestor(
  node: CachedNode,
  nodes: Readonly<Record<string, CachedNode>>,
): boolean {
  return cachedAncestors(node, nodes).some(isEffectivelyDeleted)
}

/** Edit, add child and delete are allowed only for nodes that are not effectively deleted (client_rules). */
export function canModify(node: CachedNode, nodes: Readonly<Record<string, CachedNode>>): boolean {
  return !isEffectivelyDeleted(node) && !hasEffectivelyDeletedAncestor(node, nodes)
}

export function nodeStatus(node: CachedNode): NodeStatus {
  if (node.isDeleted) {
    return 'deleted'
  }
  if (node.isPendingDelete) {
    return 'pending-delete'
  }
  if (node.isNew) {
    return 'new'
  }
  if (node.isEdited) {
    return 'edited'
  }
  return 'clean'
}

/**
 * Enforces the deletion invariants on the whole cache, mutating nodes in place:
 * 1. a real node with a cached isDeleted ancestor is deleted in the DB too -> isDeleted = true;
 * 2. a node with a cached pending-delete ancestor -> isPendingDelete = true; a temp node with any effectively
 *    deleted cached ancestor -> isPendingDelete = true (it is dropped by apply);
 * 3. a real isDeleted node carries no pending work -> isPendingDelete = false, isEdited = false, value = originalValue.
 * Every cached ancestor is checked directly, so the result does not depend on iteration order.
 */
export function propagateDeletes(nodes: Record<string, CachedNode>): void {
  for (const node of Object.values(nodes)) {
    const ancestors = cachedAncestors(node, nodes)
    const ancestorDeleted = ancestors.some((ancestor) => ancestor.isDeleted)
    const ancestorPendingDelete = ancestors.some((ancestor) => ancestor.isPendingDelete)
    if (node.isNew) {
      if (ancestorDeleted || ancestorPendingDelete) {
        node.isPendingDelete = true
      }
      continue
    }
    if (ancestorDeleted) {
      node.isDeleted = true
    }
    if (node.isDeleted) {
      node.isPendingDelete = false
      node.isEdited = false
      node.value = node.originalValue
    } else if (ancestorPendingDelete) {
      node.isPendingDelete = true
    }
  }
}

/** Snapshot of one apply: the request plus the cache keys whose flags are settled after a 200. */
export interface ApplyPlan {
  /** Body for POST /api/nodes/apply; refreshIds is always set (every real cached id, ascending). */
  request: Required<ApplyRequest>
  /** Real nodes whose edit is sent in request.edits. */
  editedKeys: string[]
  /** Real nodes with isEdited that are effectively deleted: edit not sent, isEdited cleared on success. */
  discardedEditKeys: string[]
  /** All real nodes with isPendingDelete (request.deletes holds only the top-most of them). */
  pendingDeleteKeys: string[]
  /** Temp nodes sent in request.adds. */
  addedKeys: string[]
  /** Temp nodes not sent (pending delete / effectively deleted ancestor / dropped parent); removed on success. */
  droppedTempKeys: string[]
}

/** Builds the apply request per api-contract client_rules.request_building and refresh_ids. */
export function buildApplyPlan(nodes: Readonly<Record<string, CachedNode>>): ApplyPlan {
  const ordered = Object.values(nodes).sort((a, b) => compareCacheIds(a.id, b.id))
  const edits: ApplyEdit[] = []
  const adds: ApplyAdd[] = []
  const deletes: number[] = []
  const refreshIds: number[] = []
  const editedKeys: string[] = []
  const discardedEditKeys: string[] = []
  const pendingDeleteKeys: string[] = []
  const addedKeys: string[] = []
  const droppedTempKeys: string[] = []
  const dropped = new Set<string>()

  for (const node of ordered) {
    const id = node.id
    const key = cacheKey(id)
    if (typeof id === 'number') {
      refreshIds.push(id)
      if (node.isPendingDelete) {
        pendingDeleteKeys.push(key)
        if (!node.isDeleted && !hasEffectivelyDeletedAncestor(node, nodes)) {
          deletes.push(id)
        }
      }
      if (node.isEdited) {
        if (isEffectivelyDeleted(node) || hasEffectivelyDeletedAncestor(node, nodes)) {
          discardedEditKeys.push(key)
        } else {
          edits.push({ id, value: node.value })
          editedKeys.push(key)
        }
      }
      continue
    }
    if (!node.isNew) {
      continue
    }
    const parentId = node.parentId
    const parentMissing =
      parentId === null || !(cacheKey(parentId) in nodes) || dropped.has(cacheKey(parentId))
    if (parentId === null || parentMissing || node.isPendingDelete || hasEffectivelyDeletedAncestor(node, nodes)) {
      dropped.add(key)
      droppedTempKeys.push(key)
      continue
    }
    if (typeof parentId === 'number') {
      adds.push({ tempId: id, parentId, value: node.value })
    } else {
      adds.push({ tempId: id, parentTempId: parentId, value: node.value })
    }
    addedKeys.push(key)
  }

  return {
    request: { edits, adds, deletes, refreshIds },
    editedKeys,
    discardedEditKeys,
    pendingDeleteKeys,
    addedKeys,
    droppedTempKeys,
  }
}

/** Success toast text, e.g. "1 edit(s), 2 addition(s), 0 deletion(s) saved." */
export function describeApplyPlan(plan: ApplyPlan): string {
  const { edits, adds, deletes } = plan.request
  return `${edits.length} edit(s), ${adds.length} addition(s), ${deletes.length} deletion(s) saved.`
}

function hasMapping(idMap: IdMap, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(idMap, key)
}

/** Temp id -> real id through idMap; any other id is returned unchanged. */
export function rekeyId(id: CacheId, idMap: IdMap): CacheId {
  return typeof id === 'string' && hasMapping(idMap, id) ? idMap[id] : id
}

/** Store key (cacheKey) -> re-keyed store key; keys not in idMap are returned unchanged. */
export function rekeyKey(key: string, idMap: IdMap): string {
  return hasMapping(idMap, key) ? cacheKey(idMap[key]) : key
}

/**
 * Settles the cache after a 200, before response.nodes are merged. Mutates node objects and returns
 * a new record: droppedTempKeys removed; isEdited cleared for editedKeys + discardedEditKeys; isPendingDelete
 * cleared for pendingDeleteKeys; isNew cleared for addedKeys that idMap maps; id, parentId and ancestorIds of
 * every remaining node re-keyed through idMap.
 */
export function settleApplied(
  nodes: Readonly<Record<string, CachedNode>>,
  plan: ApplyPlan,
  idMap: IdMap,
): Record<string, CachedNode> {
  for (const key of plan.editedKeys.concat(plan.discardedEditKeys)) {
    const node = nodes[key]
    if (node) {
      node.isEdited = false
    }
  }
  for (const key of plan.pendingDeleteKeys) {
    const node = nodes[key]
    if (node) {
      node.isPendingDelete = false
    }
  }
  for (const key of plan.addedKeys) {
    const node = nodes[key]
    if (node && hasMapping(idMap, key)) {
      node.isNew = false
    }
  }
  const dropped = new Set(plan.droppedTempKeys)
  const next: Record<string, CachedNode> = {}
  for (const key of Object.keys(nodes)) {
    if (dropped.has(key)) {
      continue
    }
    const node = nodes[key]
    node.id = rekeyId(node.id, idMap)
    node.parentId = node.parentId === null ? null : rekeyId(node.parentId, idMap)
    node.ancestorIds = node.ancestorIds.map((ancestorId) => rekeyId(ancestorId, idMap))
    next[cacheKey(node.id)] = node
  }
  return next
}

/** selectedKey after a 200: null when the selected temp node was dropped, otherwise re-keyed. */
export function rekeySelection(key: string | null, idMap: IdMap, droppedTempKeys: readonly string[]): string | null {
  if (key === null || droppedTempKeys.includes(key)) {
    return null
  }
  return rekeyKey(key, idMap)
}

/** expandedKeys after a 200: dropped keys removed, temp keys re-keyed; always a new object. */
export function rekeyExpanded(
  expanded: Readonly<Record<string, boolean>>,
  idMap: IdMap,
  droppedTempKeys: readonly string[],
): Record<string, boolean> {
  const dropped = new Set(droppedTempKeys)
  const next: Record<string, boolean> = {}
  for (const key of Object.keys(expanded)) {
    if (expanded[key] && !dropped.has(key)) {
      next[rekeyKey(key, idMap)] = true
    }
  }
  return next
}
