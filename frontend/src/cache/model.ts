// Pure cache model (no Vue/Pinia imports). Re-exported by src/stores/cache.ts.

/** Real ids are numbers; temp ids (nodes added in the cache, not yet applied) are strings "tmp-<n>". */
export type CacheId = number | string

export interface CachedNode {
  id: CacheId
  /** Direct parent id (null for a DB root). Display parent is derived, see src/cache/hierarchy.ts. */
  parentId: CacheId | null
  /** Current (possibly edited) value. */
  value: string
  /** Value as last loaded from / applied to the DB ('' for new nodes). */
  originalValue: string
  /** Deleted state in the DB as of the last load/apply. */
  isDeleted: boolean
  /** DB hasChildren as of the last load/apply (false for new nodes). */
  hasChildren: boolean
  /** Added in the cache, not yet applied (id is a temp id). */
  isNew: boolean
  /** Value edited in the cache, not yet applied. */
  isEdited: boolean
  /** Marked deleted in the cache (directly or by cascade), not yet applied. */
  isPendingDelete: boolean
  /** Ancestor ids ordered root -> parent ([] for a root). May contain temp ids for new nodes. */
  ancestorIds: CacheId[]
}

/** Map key for a cache id: String(id). Real "42" and temp "tmp-1" never collide. */
export function cacheKey(id: CacheId): string {
  return String(id)
}

/** `data` of every CacheTreeNode produced by buildCacheTree. */
export interface CacheTreeNodeData {
  node: CachedNode
  /**
   * Ancestors that are not cached between the row this node is displayed under and the node itself,
   * ordered root -> parent. For a top-level row: all its ancestorIds. Empty when the display parent is the
   * direct parent, or when the node is a DB root.
   */
  missingAncestorIds: CacheId[]
}

/** One assembled CachedTreeView node (replaces PrimeVue's TreeNode). */
export interface CacheTreeNode {
  /** cacheKey(id). */
  key: string
  /** Current value. */
  label: string
  /** No displayed children. */
  leaf: boolean
  children: CacheTreeNode[]
  data: CacheTreeNodeData
}
