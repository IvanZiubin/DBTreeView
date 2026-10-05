import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TreeNode } from 'primevue/treenode'
import type { NodeDetails } from '../api/types'
import { buildCacheTree } from '../cache/hierarchy'
import { cacheKey, type CacheId, type CachedNode } from '../cache/model'

// Re-exported so components keep importing cache types from the store module.
export { cacheKey }
export type { CacheId, CachedNode }

export const useCacheStore = defineStore('cache', () => {
  /** All cached nodes keyed by cacheKey(id). Flat: the hierarchy is derived in treeNodes, never stored. */
  const nodes = ref<Record<string, CachedNode>>({})
  const selectedKey = ref<string | null>(null)
  /** PrimeVue Tree expandedKeys. New nodes start expanded; user collapse removes keys. Always replaced, never mutated. */
  const expandedKeys = ref<Record<string, boolean>>({})
  const nextTempSeq = ref(1)
  const applying = ref(false)
  /** Incremented by clear(); callers discard getNode responses that started in an older epoch (Reset race). */
  const epoch = ref(0)

  const nodeList = computed<CachedNode[]>(() => Object.values(nodes.value))

  const isEmpty = computed<boolean>(() => Object.keys(nodes.value).length === 0)

  const selectedNode = computed<CachedNode | null>(() =>
    selectedKey.value === null ? null : (nodes.value[selectedKey.value] ?? null),
  )

  const hasPendingChanges = computed<boolean>(() =>
    nodeList.value.some((n) => n.isNew || n.isEdited || n.isPendingDelete),
  )

  /** Every real (numeric) id in the cache, ascending. Stage 4 apply sends this as refreshIds (contract v2). */
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
   * never touched. Newly inserted nodes are added to expandedKeys. Used by loadNode and by stage-4 apply.
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

  /** TODO stage 4: change value of a non-deleted node; mark isEdited. */
  function editValue(_id: CacheId, _value: string): void {
    // Intentionally empty until stage 4.
  }

  /**
   * TODO stage 4: add a child with temp id `tmp-${nextTempSeq}` under a non-deleted node;
   * ancestorIds = [...parent.ancestorIds, parent.id]; expand parent and new key via expandKeys.
   */
  function addChild(_parentId: CacheId, _value: string): void {
    // Intentionally empty until stage 4.
  }

  /** TODO stage 4: mark the node and all cached descendants (ancestorIds contains id) as pending-deleted. */
  function deleteNode(_id: CacheId): void {
    // Intentionally empty until stage 4.
  }

  /**
   * TODO stage 4: build ApplyRequest with refreshIds = realIds.value, call applyChanges, re-key temp ids via
   * idMap (also inside ancestorIds/parentId/selectedKey/expandedKeys), clear pending flags of applied nodes,
   * then mergeServerNodes(response.nodes).
   */
  async function apply(): Promise<void> {
    // Intentionally empty until stage 4.
  }

  /** Empties the cache (used by Reset) and starts a new epoch. */
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
    hasPendingChanges,
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
