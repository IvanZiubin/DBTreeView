import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TreeNode } from 'primevue/treenode'
import { applyChanges } from '../api/client'
import type { NodeDetails } from '../api/types'
import { buildCacheTree } from '../cache/hierarchy'
import { cacheKey, type CacheId, type CachedNode } from '../cache/model'
import {
  buildApplyPlan,
  canModify,
  propagateDeletes,
  rekeyExpanded,
  rekeySelection,
  settleApplied,
  validateValue,
  type ApplyPlan,
} from '../cache/pending'

// Re-exported so components keep importing cache types from the store module.
export { cacheKey }
export type { CacheId, CachedNode }

export const useCacheStore = defineStore('cache', () => {
  /** All cached nodes keyed by cacheKey(id). Flat: the hierarchy is derived in treeNodes, never stored. */
  const nodes = ref<Record<string, CachedNode>>({})
  const selectedKey = ref<string | null>(null)
  /** PrimeVue Tree expandedKeys. New nodes start expanded; user collapse removes keys. Always replaced, never mutated. */
  const expandedKeys = ref<Record<string, boolean>>({})
  /** Next temp id is `tmp-${nextTempSeq}`; only increases; reset by clear(). */
  const nextTempSeq = ref(1)
  /** True while POST /api/nodes/apply is in flight; edit/add/delete are rejected meanwhile. */
  const applying = ref(false)
  /** Incremented by clear(); callers discard responses that started in an older epoch (Reset race). */
  const epoch = ref(0)

  const nodeList = computed<CachedNode[]>(() => Object.values(nodes.value))

  const isEmpty = computed<boolean>(() => Object.keys(nodes.value).length === 0)

  const selectedNode = computed<CachedNode | null>(() =>
    selectedKey.value === null ? null : (nodes.value[selectedKey.value] ?? null),
  )

  /** Number of nodes carrying any pending flag (new, edited, pending delete). Shown as the Apply badge. */
  const pendingCount = computed<number>(
    () => nodeList.value.filter((n) => n.isNew || n.isEdited || n.isPendingDelete).length,
  )

  const hasPendingChanges = computed<boolean>(() => pendingCount.value > 0)

  /** Edit / Add child / Delete enabled: a selected node that is not effectively deleted, no apply in flight. */
  const canModifySelected = computed<boolean>(() => {
    const node = selectedNode.value
    return node !== null && !applying.value && canModify(node, nodes.value)
  })

  /** Every real (numeric) id in the cache, ascending. Apply sends this as refreshIds (client_rules.refresh_ids). */
  const realIds = computed<number[]>(() =>
    nodeList.value.flatMap((n) => (typeof n.id === 'number' ? [n.id] : [])).sort((a, b) => a - b),
  )

  /** Hierarchy assembled from cached nodes: nearest cached ancestor (src/cache/hierarchy.ts). */
  const treeNodes = computed<TreeNode[]>(() => buildCacheTree(nodeList.value))

  function expandKeys(keys: readonly string[]): void {
    const next: Record<string, boolean> = { ...expandedKeys.value }
    for (const key of keys) {
      next[key] = true
    }
    expandedKeys.value = next
  }

  /**
   * Inserts unknown nodes, refreshes known ones. Refresh overwrites only server fields (parentId, ancestorIds,
   * originalValue, isDeleted, hasChildren) and value only when not isEdited; isNew/isEdited/isPendingDelete are
   * never touched here. Newly inserted nodes are added to expandedKeys. Ends with propagateDeletes over the
   * whole cache (client_rules.pending_delete_propagation, DR-FE-4.2). Used by loadNode and apply.
   */
  function mergeServerNodes(serverNodes: readonly NodeDetails[]): void {
    const inserted: string[] = []
    for (const details of serverNodes) {
      const key = cacheKey(details.id)
      const existing = nodes.value[key]
      if (existing) {
        existing.parentId = details.parentId
        existing.ancestorIds = details.ancestorIds.slice()
        existing.originalValue = details.value
        existing.isDeleted = details.isDeleted
        existing.hasChildren = details.hasChildren
        if (!existing.isEdited) {
          existing.value = details.value
        }
      } else {
        nodes.value[key] = {
          id: details.id,
          parentId: details.parentId,
          value: details.value,
          originalValue: details.value,
          isDeleted: details.isDeleted,
          hasChildren: details.hasChildren,
          isNew: false,
          isEdited: false,
          isPendingDelete: false,
          ancestorIds: details.ancestorIds.slice(),
        }
        inserted.push(key)
      }
    }
    propagateDeletes(nodes.value)
    if (inserted.length > 0) {
      expandKeys(inserted)
    }
  }

  /** Loads one node from GET /api/nodes/{id}: merge, expand its cached ancestors (reveal), select it. */
  function loadNode(details: NodeDetails): void {
    mergeServerNodes([details])
    const cachedAncestorKeys = details.ancestorIds
      .map((ancestorId) => cacheKey(ancestorId))
      .filter((key) => key in nodes.value)
    if (cachedAncestorKeys.length > 0) {
      expandKeys(cachedAncestorKeys)
    }
    selectedKey.value = cacheKey(details.id)
  }

  /**
   * Sets the trimmed value (DR-FE-4.4). Real node: isEdited = value differs from originalValue. Temp node: value
   * only. Returns false (no change) for unknown / effectively deleted nodes, invalid values, or during apply.
   */
  function editValue(id: CacheId, value: string): boolean {
    const node = nodes.value[cacheKey(id)]
    if (!node || applying.value || !canModify(node, nodes.value) || validateValue(value) !== null) {
      return false
    }
    const trimmed = value.trim()
    node.value = trimmed
    if (!node.isNew) {
      node.isEdited = trimmed !== node.originalValue
    }
    return true
  }

  /**
   * Adds a temp child `tmp-<n>` under a cached node (DR-FE-4.3); expands parent and child; selects the child.
   * Returns the new key, or null (no change) for unknown / effectively deleted parents, invalid values, or during apply.
   */
  function addChild(parentId: CacheId, value: string): string | null {
    const parent = nodes.value[cacheKey(parentId)]
    if (!parent || applying.value || !canModify(parent, nodes.value) || validateValue(value) !== null) {
      return null
    }
    let tempId = `tmp-${nextTempSeq.value}`
    while (tempId in nodes.value) {
      nextTempSeq.value += 1
      tempId = `tmp-${nextTempSeq.value}`
    }
    nextTempSeq.value += 1
    nodes.value[tempId] = {
      id: tempId,
      parentId: parent.id,
      value: value.trim(),
      originalValue: '',
      isDeleted: false,
      hasChildren: false,
      isNew: true,
      isEdited: false,
      isPendingDelete: false,
      ancestorIds: [...parent.ancestorIds, parent.id],
    }
    expandKeys([cacheKey(parent.id), tempId])
    selectedKey.value = tempId
    return tempId
  }

  /**
   * Marks the node pending delete and cascades to every cached descendant, incl. temp nodes (propagateDeletes).
   * Returns false (no change) for unknown / effectively deleted nodes or during apply.
   */
  function deleteNode(id: CacheId): boolean {
    const node = nodes.value[cacheKey(id)]
    if (!node || applying.value || !canModify(node, nodes.value)) {
      return false
    }
    node.isPendingDelete = true
    propagateDeletes(nodes.value)
    return true
  }

  /**
   * Sends all pending changes in one POST /api/nodes/apply (DR-FE-4.6). Returns the applied plan on success, or
   * null when nothing was done (no pending changes, already applying, or a Reset happened meanwhile).
   * Throws the ApiError on failure; the cache is then left exactly as it was (client_rules.failure_handling).
   */
  async function apply(): Promise<ApplyPlan | null> {
    if (applying.value || !hasPendingChanges.value) {
      return null
    }
    const plan = buildApplyPlan(nodes.value)
    const startedEpoch = epoch.value
    applying.value = true
    try {
      const response = await applyChanges(plan.request)
      if (startedEpoch !== epoch.value) {
        return null
      }
      nodes.value = settleApplied(nodes.value, plan, response.idMap)
      selectedKey.value = rekeySelection(selectedKey.value, response.idMap, plan.droppedTempKeys)
      expandedKeys.value = rekeyExpanded(expandedKeys.value, response.idMap, plan.droppedTempKeys)
      mergeServerNodes(response.nodes)
      return plan
    } finally {
      if (startedEpoch === epoch.value) {
        applying.value = false
      }
    }
  }

  /** Empties the cache incl. pending changes (used by Reset) and starts a new epoch. */
  function clear(): void {
    nodes.value = {}
    selectedKey.value = null
    expandedKeys.value = {}
    nextTempSeq.value = 1
    applying.value = false
    epoch.value += 1
  }

  return {
    nodes,
    selectedKey,
    expandedKeys,
    nextTempSeq,
    applying,
    epoch,
    nodeList,
    isEmpty,
    selectedNode,
    pendingCount,
    hasPendingChanges,
    canModifySelected,
    realIds,
    treeNodes,
    mergeServerNodes,
    loadNode,
    editValue,
    addChild,
    deleteNode,
    apply,
    clear,
  }
})
