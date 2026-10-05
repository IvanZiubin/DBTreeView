// Pure hierarchy assembly for CachedTreeView (no Vue/Pinia imports). See docs/plans/stage-3-frontend.md DR-FE-3.1.
import type { TreeNode } from 'primevue/treenode'
import { cacheKey, type CacheId, type CachedNode, type CacheTreeNodeData } from './model'

const TEMP_ID_PATTERN = /^tmp-(\d+)$/

/** Sibling order: real ids ascending, then temp ids "tmp-<n>" by n (creation order), then other strings. */
export function compareCacheIds(a: CacheId, b: CacheId): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }
  if (typeof a === 'number') {
    return -1
  }
  if (typeof b === 'number') {
    return 1
  }
  const matchA = TEMP_ID_PATTERN.exec(a)
  const matchB = TEMP_ID_PATTERN.exec(b)
  if (matchA && matchB) {
    return Number(matchA[1]) - Number(matchB[1])
  }
  if (matchA) {
    return -1
  }
  if (matchB) {
    return 1
  }
  return a < b ? -1 : a > b ? 1 : 0
}

export interface Placement {
  /** Key of the nearest cached ancestor, or null when no ancestor is cached (top-level row). */
  parentKey: string | null
  /** Uncached ancestors between the display parent (or the top) and the node, ordered root -> parent. */
  missingAncestorIds: CacheId[]
}

/** Finds the nearest cached ancestor by scanning ancestorIds from the parent end towards the root. */
export function placeNode(node: CachedNode, isCached: (key: string) => boolean): Placement {
  const ancestors = node.ancestorIds
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const ancestorKey = cacheKey(ancestors[i])
    if (isCached(ancestorKey)) {
      return { parentKey: ancestorKey, missingAncestorIds: ancestors.slice(i + 1) }
    }
  }
  return { parentKey: null, missingAncestorIds: ancestors.slice() }
}

/**
 * Assembles cached nodes (any order, any gaps) into PrimeVue TreeNodes. Each node is displayed under its
 * nearest cached ancestor; nodes without a cached ancestor are top-level. Siblings sorted by compareCacheIds.
 * TreeNode: { key: cacheKey(id), label: value, leaf: no displayed children, children, data: CacheTreeNodeData }.
 */
export function buildCacheTree(nodes: readonly CachedNode[]): TreeNode[] {
  const cachedKeys = new Set<string>()
  for (const node of nodes) {
    cachedKeys.add(cacheKey(node.id))
  }

  const childrenByParent = new Map<string | null, CachedNode[]>()
  const placements = new Map<string, Placement>()
  for (const node of nodes) {
    const key = cacheKey(node.id)
    const placement = placeNode(node, (candidate) => candidate !== key && cachedKeys.has(candidate))
    placements.set(key, placement)
    const siblings = childrenByParent.get(placement.parentKey)
    if (siblings) {
      siblings.push(node)
    } else {
      childrenByParent.set(placement.parentKey, [node])
    }
  }

  const visited = new Set<string>()

  function build(parentKey: string | null): TreeNode[] {
    const group = (childrenByParent.get(parentKey) ?? []).slice().sort((a, b) => compareCacheIds(a.id, b.id))
    const result: TreeNode[] = []
    for (const node of group) {
      const key = cacheKey(node.id)
      if (visited.has(key)) {
        continue
      }
      visited.add(key)
      const children = build(key)
      const data: CacheTreeNodeData = {
        node,
        missingAncestorIds: placements.get(key)?.missingAncestorIds ?? [],
      }
      result.push({ key, label: node.value, leaf: children.length === 0, children, data })
    }
    return result
  }

  return build(null)
}

/** Tooltip / aria-label of the gap marker, e.g. "3 level(s) not loaded: #4, #10, #18". */
export function gapTooltip(missingAncestorIds: readonly CacheId[]): string {
  const ids = missingAncestorIds.map((id) => `#${id}`).join(', ')
  return `${missingAncestorIds.length} level(s) not loaded: ${ids}`
}
