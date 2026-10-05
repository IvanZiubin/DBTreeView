import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TreeNode } from 'primevue/treenode'
import { getChildren, getRoots } from '../api/client'
import type { Node } from '../api/types'

/** Maps an API node to a PrimeVue TreeNode. Children are loaded lazily. */
export function toTreeNode(node: Node): TreeNode {
  return {
    key: String(node.id),
    label: node.value,
    leaf: !node.hasChildren,
    loading: false,
    data: node,
  }
}

function findTreeNode(nodes: TreeNode[], key: string): TreeNode | null {
  for (const node of nodes) {
    if (node.key === key) {
      return node
    }
    if (node.children) {
      const found = findTreeNode(node.children, key)
      if (found) {
        return found
      }
    }
  }
  return null
}

export const useDbTreeStore = defineStore('dbTree', () => {
  const roots = ref<TreeNode[]>([])
  const rootsLoading = ref(false)
  const expandedKeys = ref<Record<string, boolean>>({})
  const selectionKeys = ref<Record<string, boolean>>({})
  /** Keys whose children have been fetched; re-expanding never refetches. */
  const loadedKeys = ref<Record<string, boolean>>({})
  /** Incremented by setRoots(); late children responses from an older tree are discarded. */
  let generation = 0

  const selectedId = computed<number | null>(() => {
    const key = Object.keys(selectionKeys.value).find((k) => selectionKeys.value[k])
    return key === undefined ? null : Number(key)
  })

  const selectedNode = computed<Node | null>(() => {
    if (selectedId.value === null) {
      return null
    }
    const treeNode = findTreeNode(roots.value, String(selectedId.value))
    return treeNode ? (treeNode.data as Node) : null
  })

  /** Replaces the whole tree with fresh roots and clears expansion/selection state. */
  function setRoots(nodes: Node[]): void {
    generation += 1
    roots.value = nodes.map(toTreeNode)
    expandedKeys.value = {}
    selectionKeys.value = {}
    loadedKeys.value = {}
  }

  async function loadRoots(): Promise<void> {
    rootsLoading.value = true
    try {
      setRoots(await getRoots())
    } finally {
      rootsLoading.value = false
    }
  }

  /** Loads one level of children for the node with the given key (called on node-expand). */
  async function loadChildren(key: string): Promise<void> {
    if (loadedKeys.value[key]) {
      return
    }
    const target = findTreeNode(roots.value, key)
    if (!target || target.leaf || target.loading) {
      return
    }
    const startedGeneration = generation
    target.loading = true
    try {
      const children = await getChildren(Number(key))
      if (startedGeneration !== generation) {
        return
      }
      target.children = children.map(toTreeNode)
      target.leaf = children.length === 0
      loadedKeys.value[key] = true
    } catch (err) {
      if (startedGeneration === generation) {
        delete expandedKeys.value[key]
      }
      throw err
    } finally {
      target.loading = false
    }
  }

  /**
   * Re-fetches the roots and, level by level, the children of every previously loaded node; restores expansion
   * and selection for nodes that still exist. Used after a successful Apply (DR-FE-4.8). Only levels the user
   * had opened are fetched (stays lazy). A setRoots() meanwhile (Reset, another refresh) aborts it.
   */
  async function refresh(): Promise<void> {
    const wasLoaded = Object.keys(loadedKeys.value).filter((key) => loadedKeys.value[key])
    const wasExpanded = Object.keys(expandedKeys.value).filter((key) => expandedKeys.value[key])
    const wasSelected = Object.keys(selectionKeys.value).filter((key) => selectionKeys.value[key])
    const startedGeneration = generation
    rootsLoading.value = true
    let freshRoots: Node[] = []
    try {
      freshRoots = await getRoots()
    } finally {
      rootsLoading.value = false
    }
    if (startedGeneration !== generation) {
      return
    }
    setRoots(freshRoots)
    const refreshGeneration = generation

    let pending = wasLoaded
    while (pending.length > 0) {
      const ready = pending.filter((key) => {
        const target = findTreeNode(roots.value, key)
        return target !== null && !target.leaf
      })
      if (ready.length === 0) {
        break
      }
      const results = await Promise.all(ready.map((key) => getChildren(Number(key))))
      if (refreshGeneration !== generation) {
        return
      }
      ready.forEach((key, index) => {
        const target = findTreeNode(roots.value, key)
        if (target) {
          target.children = results[index].map(toTreeNode)
          target.leaf = results[index].length === 0
          loadedKeys.value[key] = true
        }
      })
      pending = pending.filter((key) => !ready.includes(key))
    }

    const nextExpanded: Record<string, boolean> = {}
    for (const key of wasExpanded) {
      if (loadedKeys.value[key]) {
        nextExpanded[key] = true
      }
    }
    expandedKeys.value = nextExpanded

    const nextSelection: Record<string, boolean> = {}
    for (const key of wasSelected) {
      if (findTreeNode(roots.value, key) !== null) {
        nextSelection[key] = true
      }
    }
    selectionKeys.value = nextSelection
  }

  return {
    roots,
    rootsLoading,
    expandedKeys,
    selectionKeys,
    selectedId,
    selectedNode,
    setRoots,
    loadRoots,
    loadChildren,
    refresh,
  }
})
