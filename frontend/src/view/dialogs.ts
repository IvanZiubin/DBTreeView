// Pure texts and itemisation for the Apply and Clear-cache dialogs (no Vue/Pinia imports).
import { cacheKey, type CachedNode } from '../cache/model'
import type { ApplyPlan } from '../cache/pending'

export type ApplyItemKind = 'add' | 'edit' | 'delete' | 'discard'

export interface ApplyItem {
  kind: ApplyItemKind
  /** Tag text (the kind). */
  tag: string
  /** Industry tag classes. */
  tagClass: string
  text: string
}

const TAG_CLASS: Record<ApplyItemKind, string> = {
  add: 'tag tag-accent',
  edit: 'tag tag-outline',
  delete: 'tag tag-neutral',
  discard: 'tag tag-neutral',
}

function item(kind: ApplyItemKind, text: string): ApplyItem {
  return { kind, tag: kind, tagClass: TAG_CLASS[kind], text }
}

/** "#id value" for a real node, "value" for a temp node, "#key" when the key is not cached. */
export function nodeLabel(key: string, nodes: Readonly<Record<string, CachedNode>>): string {
  const node = nodes[key]
  if (!node) {
    return `#${key}`
  }
  return node.isNew ? node.value : `#${node.id} ${node.value}`
}

/**
 * Dialog rows in order: adds, edits, top-most deletes (exactly what is sent), then discards (dropped temp nodes and
 * edits of effectively deleted nodes, which the apply settles without sending).
 */
export function buildApplyItems(plan: ApplyPlan, nodes: Readonly<Record<string, CachedNode>>): ApplyItem[] {
  const items: ApplyItem[] = []
  for (const add of plan.request.adds) {
    const parentKey = typeof add.parentTempId === 'string' ? add.parentTempId : String(add.parentId)
    items.push(item('add', `${add.value} under ${nodeLabel(parentKey, nodes)}`))
  }
  for (const edit of plan.request.edits) {
    const node = nodes[cacheKey(edit.id)]
    items.push(
      item('edit', node ? `#${edit.id} ${node.originalValue} → ${edit.value}` : `#${edit.id} → ${edit.value}`),
    )
  }
  for (const id of plan.request.deletes) {
    items.push(item('delete', `${nodeLabel(cacheKey(id), nodes)} and all descendants`))
  }
  for (const key of plan.droppedTempKeys) {
    const node = nodes[key]
    items.push(item('discard', `${node ? node.value : key} (new) is discarded`))
  }
  for (const key of plan.discardedEditKeys) {
    items.push(item('discard', `#${key} edit is discarded (node is deleted)`))
  }
  return items
}

/** Number of changes actually sent (edits + adds + deletes). */
export function sentChangeCount(plan: ApplyPlan): number {
  const { edits, adds, deletes } = plan.request
  return edits.length + adds.length + deletes.length
}

export function applySummary(plan: ApplyPlan): string {
  const count = sentChangeCount(plan)
  if (count === 0) {
    return 'Nothing will be written to the database; discarded local changes are removed from the cache.'
  }
  return `${count} pending change${count === 1 ? '' : 's'} will be written to the database in one transaction.`
}

export type ClearCacheDecision = 'disabled' | 'confirm' | 'clear'

export interface ClearCacheState {
  isEmpty: boolean
  applying: boolean
  pendingCount: number
}

/** Clear cache button: disabled when empty or applying; confirm only when pending changes would be lost. */
export function decideClearCache(state: ClearCacheState): ClearCacheDecision {
  if (state.isEmpty || state.applying) {
    return 'disabled'
  }
  return state.pendingCount > 0 ? 'confirm' : 'clear'
}

export function clearCacheMessage(pendingCount: number): string {
  return `${pendingCount} unapplied change${pendingCount === 1 ? '' : 's'} will be lost.`
}
