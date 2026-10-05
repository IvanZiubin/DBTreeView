import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TreeNode } from 'primevue/treenode'
import type { NodeDetails } from '../api/types'

/** Real ids are numbers; temp ids (nodes added in the cache, not yet applied) are strings "tmp-<n>". */
export type CacheId = number | string

export interface CachedNode {
  id: CacheId
  parentId: CacheId | null
  /** Current (possibly edited) value. */
  value: string
  /** Value as last loaded from / applied to the DB ('' for new nodes). */
  originalValue: string
  /** Deleted state in the DB as of the last load/apply. */
  isDeleted: boolean
  /** Added in the cache, not yet applied (id is a temp id). */
  isNew: boolean
  /** Value edited in the cache, not yet applied. */
  isEdited: boolean
  /** Marked deleted in the cache (directly or by cascade), not yet applied. */
  isPendingDelete: boolean
  /** Ancestor ids ordered root -> parent. */
  ancestorIds: CacheId[]
}

/** Map key for a cache id: String(id). Real "42" and temp "tmp-1" never collide. */
export function cacheKey(id: CacheId): string {
  return String(id)
}

export const useCacheStore = defineStore('cache', () => {
  const nodes = ref<Record<string, CachedNode>>({})
  const selectedKey = ref<string | null>(null)
  const nextTempSeq = ref(1)
  const applying = ref(false)

  const nodeList = computed<CachedNode[]>(() => Object.values(nodes.value))

  const isEmpty = computed<boolean>(() => Object.keys(nodes.value).length === 0)

  const selectedNode = computed<CachedNode | null>(() =>
    selectedKey.value === null ? null : (nodes.value[selectedKey.value] ?? null),
  )

  const hasPendingChanges = computed<boolean>(() =>
    nodeList.value.some((n) => n.isNew || n.isEdited || n.isPendingDelete),
  )

  /** Hierarchy assembled from cached nodes. TODO stage 3: assemble using parentId/ancestorIds. */
  const treeNodes = computed<TreeNode[]>(() => [])

  /** TODO stage 3: insert/refresh a node loaded from GET /api/nodes/{id}. */
  function loadNode(_details: NodeDetails): void {
    // Intentionally empty in stage 2.
  }

  /** TODO stage 4: change value of a non-deleted node; mark isEdited. */
  function editValue(_id: CacheId, _value: string): void {
    // Intentionally empty in stage 2.
  }

  /** TODO stage 4: add a child with a new temp id under a non-deleted node. */
  function addChild(_parentId: CacheId, _value: string): void {
    // Intentionally empty in stage 2.
  }

  /** TODO stage 4: mark the node and all cached descendants as pending-deleted. */
  function deleteNode(_id: CacheId): void {
    // Intentionally empty in stage 2.
  }

  /** TODO stage 3/4: build ApplyRequest, POST /api/nodes/apply, map temp ids, resync. */
  async function apply(): Promise<void> {
    // Intentionally empty in stage 2.
  }

  /** Empties the cache (used by Reset). */
  function clear(): void {
    nodes.value = {}
    selectedKey.value = null
    nextTempSeq.value = 1
    applying.value = false
  }

  return {
    nodes,
    selectedKey,
    nextTempSeq,
    applying,
    nodeList,
    isEmpty,
    selectedNode,
    hasPendingChanges,
    treeNodes,
    loadNode,
    editValue,
    addChild,
    deleteNode,
    apply,
    clear,
  }
})
