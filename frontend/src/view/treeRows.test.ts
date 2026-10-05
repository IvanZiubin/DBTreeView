import { describe, expect, it } from 'vitest'
import { buildCacheTree } from '../cache/hierarchy'
import type { CachedNode } from '../cache/model'
import type { NodeStatus } from '../cache/pending'
import { toTreeNode } from '../stores/dbTree'
import {
  flattenCacheTree,
  flattenDbTree,
  gapHint,
  guideWidth,
  idLabel,
  isStruck,
  pendingDeleteKeys,
  statusTag,
} from './treeRows'

const ANC: Record<string, (number | string)[]> = {
  '1': [], '2': [], '4': [1], '5': [1], '10': [1, 4], '18': [1, 4, 10], '26': [1, 4, 10, 18], 'tmp-1': [1],
}

function cn(id: number | string, over: Partial<CachedNode> = {}): CachedNode {
  const anc = ANC[String(id)]
  return {
    id,
    parentId: anc.length ? anc[anc.length - 1] : null,
    value: `Node ${id}`,
    originalValue: `Node ${id}`,
    isDeleted: false,
    hasChildren: false,
    isNew: typeof id === 'string',
    isEdited: false,
    isPendingDelete: false,
    ancestorIds: anc,
    ...over,
  }
}

function db(id: number, hasChildren: boolean) {
  return toTreeNode({ id, parentId: null, value: `Node ${id}`, isDeleted: false, hasChildren })
}

describe('treeRows', () => {
  it('TR1 flattenDbTree collapsed', () => {
    const rows = flattenDbTree([db(1, true), db(2, false)], {})
    expect(rows.map((r) => r.key)).toEqual(['1', '2'])
    expect(rows.map((r) => r.depth)).toEqual([0, 0])
    expect(rows.map((r) => r.hasToggle)).toEqual([true, false])
    expect(rows.map((r) => r.expanded)).toEqual([false, false])
  })

  it('TR2 flattenDbTree expanded', () => {
    const r1 = db(1, true)
    const r4 = db(4, true)
    r4.children = [db(10, false)]
    r1.children = [r4, db(5, false)]
    const rows = flattenDbTree([r1, db(2, false)], { '1': true, '4': true })
    expect(rows.map((r) => r.key)).toEqual(['1', '4', '10', '5', '2'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1, 0])
  })

  it('TR3 expanded but children not loaded', () => {
    const r1 = db(1, true)
    r1.loading = true
    const rows = flattenDbTree([r1], { '1': true })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ expanded: false, loading: true, hasToggle: true })
  })

  it('TR4 leaf never expanded', () => {
    const leaf = db(2, false)
    leaf.children = []
    const rows = flattenDbTree([leaf], { '2': true })
    expect(rows[0]).toMatchObject({ hasToggle: false, expanded: false })
  })

  it('TR5 flattenCacheTree', () => {
    const tree = buildCacheTree([cn(1), cn(10), cn(26)])
    const open = flattenCacheTree(tree, { '1': true, '10': true })
    expect(open.map((r) => r.key)).toEqual(['1', '10', '26'])
    expect(open.map((r) => r.depth)).toEqual([0, 1, 2])
    expect(open[1].missingAncestorIds).toEqual([4])
    const closed = flattenCacheTree(tree, { '1': true })
    expect(closed.map((r) => r.key)).toEqual(['1', '10'])
    expect(closed[1]).toMatchObject({ hasToggle: true, expanded: false })
  })

  it('TR6 status and statusTag', () => {
    const nodes = [
      cn(1),
      cn('tmp-1'),
      cn(4, { isEdited: true }),
      cn(5, { isPendingDelete: true }),
      cn(2, { isDeleted: true }),
    ]
    const rows = flattenCacheTree(buildCacheTree(nodes), { '1': true })
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by['1'].status).toBe('clean')
    expect(statusTag(by['1'].status)).toBeNull()
    expect(statusTag(by['tmp-1'].status)).toEqual({ label: 'new', className: 'tag tag-accent' })
    expect(statusTag(by['4'].status)).toEqual({ label: 'edited', className: 'tag tag-outline' })
    expect(statusTag(by['5'].status)).toEqual({ label: 'to delete', className: 'tag tag-neutral' })
    expect(statusTag(by['2'].status)).toEqual({ label: 'deleted', className: 'tag tag-neutral' })
  })

  it('TR7 isStruck', () => {
    const all: NodeStatus[] = ['clean', 'new', 'edited', 'pending-delete', 'deleted']
    expect(all.filter(isStruck)).toEqual(['pending-delete', 'deleted'])
  })

  it('TR8 idLabel and gapHint', () => {
    expect(idLabel(cn('tmp-1'))).toBe('tmp')
    expect(idLabel(cn(26))).toBe('#26')
    const rows = flattenCacheTree(buildCacheTree([cn(1), cn(10)]), { '1': true })
    expect(gapHint(rows[0])).toBe('')
    expect(gapHint(rows[1])).toBe('parent #4')
    const lone = flattenCacheTree(buildCacheTree([cn(26)]), {})
    expect(gapHint(lone[0])).toBe('parent #18')
    const direct = flattenCacheTree(buildCacheTree([cn(1), cn(4)]), { '1': true })
    expect(gapHint(direct[1])).toBe('')
  })

  it('TR9 guideWidth', () => {
    expect(guideWidth(0)).toBe('0px')
    expect(guideWidth(3)).toBe('54px')
  })

  it('TR10 pendingDeleteKeys', () => {
    const nodes = {
      '26': cn(26, { isPendingDelete: true }),
      '10': cn(10, { isPendingDelete: true }),
      'tmp-1': cn('tmp-1', { isPendingDelete: true }),
      '1': cn(1),
    }
    expect(pendingDeleteKeys(nodes)).toEqual(['10', '26', 'tmp-1'])
  })
})
