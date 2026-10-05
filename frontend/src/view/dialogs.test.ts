import { describe, expect, it } from 'vitest'
import type { CachedNode } from '../cache/model'
import { buildApplyPlan } from '../cache/pending'
import { applySummary, buildApplyItems, clearCacheMessage, decideClearCache, nodeLabel } from './dialogs'

function cn(id: number | string, anc: (number | string)[], over: Partial<CachedNode> = {}): CachedNode {
  const isNew = typeof id === 'string'
  return {
    id,
    parentId: anc.length ? anc[anc.length - 1] : null,
    value: `Node ${id}`,
    originalValue: isNew ? '' : `Node ${id}`,
    isDeleted: false,
    hasChildren: false,
    isNew,
    isEdited: false,
    isPendingDelete: false,
    ancestorIds: anc,
    ...over,
  }
}

function map(nodes: CachedNode[]): Record<string, CachedNode> {
  return Object.fromEntries(nodes.map((x) => [String(x.id), x]))
}

describe('dialogs', () => {
  it('D1 itemise adds / edits / deletes', () => {
    const nodes = map([
      cn(1, []),
      cn(4, [1], { value: 'Comp', isEdited: true }),
      cn(10, [1, 4], { isPendingDelete: true }),
      cn(26, [1, 4, 10, 18], { isPendingDelete: true }),
      cn('tmp-1', [1, 4], { value: 'T' }),
      cn('tmp-2', [1, 4, 'tmp-1'], { value: 'U' }),
    ])
    const items = buildApplyItems(buildApplyPlan(nodes), nodes)
    expect(items.map((i) => i.kind)).toEqual(['add', 'add', 'edit', 'delete'])
    expect(items.map((i) => i.text)).toEqual([
      'T under #4 Comp',
      'U under T',
      '#4 Node 4 → Comp',
      '#10 Node 10 and all descendants',
    ])
    expect(items.map((i) => i.tagClass)).toEqual([
      'tag tag-accent', 'tag tag-accent', 'tag tag-outline', 'tag tag-neutral',
    ])
    expect(items.every((i) => i.tag === i.kind)).toBe(true)
  })

  it('D2 discards', () => {
    const nodes = map([
      cn(1, [], { isPendingDelete: true }),
      cn('tmp-1', [1], { value: 'X', isPendingDelete: true }),
      cn(5, [1], { isEdited: true, isPendingDelete: true }),
    ])
    const items = buildApplyItems(buildApplyPlan(nodes), nodes)
    const idx = items.findIndex((i) => i.kind === 'delete')
    expect(idx).toBeGreaterThanOrEqual(0)
    const rest = items.slice(idx + 1)
    expect(rest.map((i) => i.kind)).toEqual(['discard', 'discard'])
    expect(rest.map((i) => i.text)).toEqual(['X (new) is discarded', '#5 edit is discarded (node is deleted)'])
  })

  it('D3 applySummary', () => {
    const four = map([cn(1, []), cn(5, [], { value: 'f', isEdited: true }), cn(2, [], { value: 'e', isEdited: true }), cn(3, [], { isPendingDelete: true }), cn('tmp-1', [1], { value: 'T' })])
    expect(applySummary(buildApplyPlan(four))).toBe('4 pending changes will be written to the database in one transaction.')
    const one = map([cn(1, []), cn(2, [], { isPendingDelete: true })])
    expect(applySummary(buildApplyPlan(one))).toBe('1 pending change will be written to the database in one transaction.')
    expect(applySummary(buildApplyPlan(map([cn(1, [])])))).toBe(
      'Nothing will be written to the database; discarded local changes are removed from the cache.',
    )
  })

  it('D4 decideClearCache', () => {
    expect(decideClearCache({ isEmpty: true, applying: false, pendingCount: 0 })).toBe('disabled')
    expect(decideClearCache({ isEmpty: false, applying: true, pendingCount: 2 })).toBe('disabled')
    expect(decideClearCache({ isEmpty: false, applying: false, pendingCount: 2 })).toBe('confirm')
    expect(decideClearCache({ isEmpty: false, applying: false, pendingCount: 0 })).toBe('clear')
  })

  it('D5 clearCacheMessage', () => {
    expect(clearCacheMessage(1)).toBe('1 unapplied change will be lost.')
    expect(clearCacheMessage(3)).toBe('3 unapplied changes will be lost.')
  })

  it('D6 nodeLabel', () => {
    const nodes = map([cn(4, [1]), cn('tmp-1', [1], { value: 'T' })])
    expect(nodeLabel('99', nodes)).toBe('#99')
    expect(nodeLabel('4', nodes)).toBe('#4 Node 4')
    expect(nodeLabel('tmp-1', nodes)).toBe('T')
  })
})
