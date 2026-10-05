// Pure row models for the two tree views (no Vue/Pinia imports). See docs/plans/stage-5-frontend.md DR-FE-5.4.
import { compareCacheIds } from '../cache/hierarchy'
import type { CacheId, CachedNode, CacheTreeNode } from '../cache/model'
import { nodeStatus, type NodeStatus } from '../cache/pending'
import type { DbTreeNode } from './types'

/** Indent per depth level in px (hairline rows); equals --row-indent in src/styles/app.css. */
export const ROW_INDENT_PX = 18

export interface DbRow {
  key: string
  depth: number
  node: DbTreeNode
  /** Not a leaf: shows the chevron (or the spinner while loading). */
  hasToggle: boolean
  /** Expanded AND children loaded; only then are children listed. */
  expanded: boolean
  loading: boolean
}

/** Depth-first visible DB rows; children are listed only for expanded nodes whose children are loaded. */
export function flattenDbTree(
  roots: readonly DbTreeNode[],
  expandedKeys: Readonly<Record<string, boolean>>,
): DbRow[] {
  const rows: DbRow[] = []
  function walk(nodes: readonly DbTreeNode[], depth: number): void {
    for (const node of nodes) {
      const expanded = !node.leaf && expandedKeys[node.key] === true && node.children !== undefined
      rows.push({ key: node.key, depth, node, hasToggle: !node.leaf, expanded, loading: node.loading })
      if (expanded && node.children !== undefined) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(roots, 0)
  return rows
}

export interface CacheRow {
  key: string
  depth: number
  node: CachedNode
  missingAncestorIds: CacheId[]
  hasToggle: boolean
  expanded: boolean
  status: NodeStatus
}

/** Depth-first visible cache rows from buildCacheTree output; children listed only for expanded rows. */
export function flattenCacheTree(
  tree: readonly CacheTreeNode[],
  expandedKeys: Readonly<Record<string, boolean>>,
): CacheRow[] {
  const rows: CacheRow[] = []
  function walk(nodes: readonly CacheTreeNode[], depth: number): void {
    for (const treeNode of nodes) {
      const hasToggle = treeNode.children.length > 0
      const expanded = hasToggle && expandedKeys[treeNode.key] === true
      rows.push({
        key: treeNode.key,
        depth,
        node: treeNode.data.node,
        missingAncestorIds: treeNode.data.missingAncestorIds,
        hasToggle,
        expanded,
        status: nodeStatus(treeNode.data.node),
      })
      if (expanded) {
        walk(treeNode.children, depth + 1)
      }
    }
  }
  walk(tree, 0)
  return rows
}

export interface TagSpec {
  label: string
  /** Industry tag classes. */
  className: string
}

const STATUS_TAGS: Record<NodeStatus, TagSpec | null> = {
  clean: null,
  new: { label: 'new', className: 'tag tag-accent' },
  edited: { label: 'edited', className: 'tag tag-outline' },
  'pending-delete': { label: 'to delete', className: 'tag tag-neutral' },
  deleted: { label: 'deleted', className: 'tag tag-neutral' },
}

export function statusTag(status: NodeStatus): TagSpec | null {
  return STATUS_TAGS[status]
}

/** Value shown struck through (deleted in the DB or marked for deletion). */
export function isStruck(status: NodeStatus): boolean {
  return status === 'deleted' || status === 'pending-delete'
}

/** Right-hand id label: "tmp" for new nodes, "#<id>" otherwise. */
export function idLabel(node: CachedNode): string {
  return node.isNew ? 'tmp' : `#${node.id}`
}

/** "parent #<parentId>" when the direct parent is not cached (gap), '' otherwise. */
export function gapHint(row: CacheRow): string {
  return row.missingAncestorIds.length > 0 && row.node.parentId !== null ? `parent #${row.node.parentId}` : ''
}

export function guideWidth(depth: number): string {
  return `${depth * ROW_INDENT_PX}px`
}

/** Keys of all nodes with isPendingDelete, ordered by compareCacheIds (used for the "cascade" flash). */
export function pendingDeleteKeys(nodes: Readonly<Record<string, CachedNode>>): string[] {
  return Object.keys(nodes)
    .filter((key) => nodes[key].isPendingDelete)
    .sort((a, b) => compareCacheIds(nodes[a].id, nodes[b].id))
}
