import { describe, expect, it } from 'vitest'
import type { CacheId, CachedNode } from './model'
import {
  buildApplyPlan,
  canModify,
  describeApplyPlan,
  nodeStatus,
  propagateDeletes,
  rekeyExpanded,
  rekeyId,
  rekeyKey,
  rekeySelection,
  settleApplied,
  validateValue,
} from './pending'

function node(id: CacheId, ancestorIds: CacheId[], flags: Partial<CachedNode> = {}): CachedNode {
  const value = `Node ${id}`
  return {
    id,
    parentId: ancestorIds.length > 0 ? ancestorIds[ancestorIds.length - 1] : null,
    value,
    originalValue: typeof id === 'number' ? value : '',
    isDeleted: false,
    hasChildren: false,
    isNew: typeof id === 'string',
    isEdited: false,
    isPendingDelete: false,
    ancestorIds,
    ...flags,
  }
}

describe('pending (smoke)', () => {
  it('cascades a pending delete and builds a request with only the top-most delete', () => {
    const nodes: Record<string, CachedNode> = {
      '1': node(1, []),
      '10': node(10, [1, 4], { isPendingDelete: true }),
      '26': node(26, [1, 4, 10, 18], { isEdited: true, value: 'Local' }),
      'tmp-1': node('tmp-1', [1, 4, 10]),
      'tmp-2': node('tmp-2', [1]),
    }

    propagateDeletes(nodes)
    expect(nodes['26'].isPendingDelete).toBe(true)
    expect(nodes['tmp-1'].isPendingDelete).toBe(true)
    expect(nodes['tmp-2'].isPendingDelete).toBe(false)

    const plan = buildApplyPlan(nodes)
    expect(plan.request).toEqual({
      edits: [],
      adds: [{ tempId: 'tmp-2', parentId: 1, value: 'Node tmp-2' }],
      deletes: [10],
      refreshIds: [1, 10, 26],
    })
    expect(plan.editedKeys).toEqual([])
    expect(plan.discardedEditKeys).toEqual(['26'])
    expect(plan.pendingDeleteKeys).toEqual(['10', '26'])
    expect(plan.addedKeys).toEqual(['tmp-2'])
    expect(plan.droppedTempKeys).toEqual(['tmp-1'])
  })
})

function rec(...list: CachedNode[]): Record<string, CachedNode> {
  const out: Record<string, CachedNode> = {}
  for (const n of list) {
    out[String(n.id)] = n
  }
  return out
}

describe('pending cases', () => {
  it('P1 validateValue', () => {
    expect(validateValue('')).toBe('Value must not be empty.')
    expect(validateValue('   ')).toBe('Value must not be empty.')
    expect(validateValue(' a ')).toBeNull()
    expect(validateValue('x'.repeat(200))).toBeNull()
    expect(validateValue('x'.repeat(201))).toBe('Value must be at most 200 characters.')
    expect(validateValue(' ' + 'x'.repeat(200) + ' ')).toBeNull()
  })

  it('P2 nodeStatus priority', () => {
    const all = { isDeleted: true, isPendingDelete: true, isNew: true, isEdited: true }
    expect(nodeStatus(node(1, [], all))).toBe('deleted')
    expect(nodeStatus(node(1, [], { ...all, isDeleted: false }))).toBe('pending-delete')
    expect(nodeStatus(node(1, [], { isNew: true, isEdited: true }))).toBe('new')
    expect(nodeStatus(node(1, [], { isEdited: true }))).toBe('edited')
    expect(nodeStatus(node(1, []))).toBe('clean')
  })

  function p3Set(reverse: boolean): Record<string, CachedNode> {
    const list = [node(1, []), node(10, [1, 4], { isPendingDelete: true }), node(26, [1, 4, 10, 18]), node(5, [1])]
    return rec(...(reverse ? list.slice().reverse() : list))
  }

  it('P3 pending delete cascades across gaps', () => {
    const nodes = p3Set(false)
    propagateDeletes(nodes)
    expect(nodes['26'].isPendingDelete).toBe(true)
    expect(nodes['1'].isPendingDelete).toBe(false)
    expect(nodes['5'].isPendingDelete).toBe(false)
  })

  it('P4 temp nodes under pending delete', () => {
    const nodes = rec(
      node(10, [1, 4], { isPendingDelete: true }),
      node('tmp-1', [1, 4, 10]),
      node('tmp-2', [1, 4, 10, 'tmp-1']),
    )
    propagateDeletes(nodes)
    expect(nodes['tmp-1'].isPendingDelete).toBe(true)
    expect(nodes['tmp-2'].isPendingDelete).toBe(true)
  })

  it('P5 derived isDeleted and normalisation', () => {
    const nodes = rec(
      node(10, [1, 4], { isDeleted: true }),
      node(26, [1, 4, 10, 18], { isEdited: true, value: 'Local', originalValue: 'Node 26', isPendingDelete: true }),
      node('tmp-1', [1, 4, 10, 18, 26]),
    )
    propagateDeletes(nodes)
    expect(nodes['26'].isDeleted).toBe(true)
    expect(nodes['26'].isPendingDelete).toBe(false)
    expect(nodes['26'].isEdited).toBe(false)
    expect(nodes['26'].value).toBe('Node 26')
    expect(nodes['tmp-1'].isPendingDelete).toBe(true)
    expect(nodes['tmp-1'].isDeleted).toBe(false)
  })

  it('P6 order independence', () => {
    const a = p3Set(false)
    const b = p3Set(true)
    propagateDeletes(a)
    propagateDeletes(b)
    for (const key of Object.keys(a)) {
      expect(b[key].isPendingDelete).toBe(a[key].isPendingDelete)
      expect(b[key].isDeleted).toBe(a[key].isDeleted)
    }
  })

  it('P7 top-most deletes only', () => {
    const nodes = rec(
      node(1, [], { isPendingDelete: true }),
      node(4, [1], { isPendingDelete: true }),
      node(10, [1, 4], { isPendingDelete: true }),
      node(2, [], { isPendingDelete: true }),
    )
    const plan = buildApplyPlan(nodes)
    expect(plan.request.deletes).toEqual([1, 2])
    expect(plan.pendingDeleteKeys).toEqual(['1', '2', '4', '10'])
  })

  it('P8 already-deleted pending node not sent', () => {
    const n = node(10, [1, 4])
    n.isDeleted = true
    n.isPendingDelete = true
    const plan = buildApplyPlan(rec(n))
    expect(plan.request.deletes).toEqual([])
    expect(plan.pendingDeleteKeys).toEqual(['10'])
  })

  it('P9 edits filter', () => {
    const nodes = rec(
      node(4, [1], { isEdited: true, value: 'A' }),
      node(10, [1, 4], { isEdited: true, isPendingDelete: true }),
      node(26, [1, 4, 10, 18], { isEdited: true }),
      node(5, [1], { isEdited: true, isDeleted: true }),
    )
    const plan = buildApplyPlan(nodes)
    expect(plan.request.edits).toEqual([{ id: 4, value: 'A' }])
    expect(plan.editedKeys).toEqual(['4'])
    expect(plan.discardedEditKeys).toEqual(['5', '10', '26'])
  })

  it('P10 adds with parentId / parentTempId in creation order', () => {
    const nodes = rec(node(4, [1]), node('tmp-2', [1, 4]), node('tmp-10', [1, 4, 'tmp-2']))
    const plan = buildApplyPlan(nodes)
    expect(plan.request.adds).toEqual([
      { tempId: 'tmp-2', parentId: 4, value: 'Node tmp-2' },
      { tempId: 'tmp-10', parentTempId: 'tmp-2', value: 'Node tmp-10' },
    ])
    expect('parentTempId' in plan.request.adds[0]).toBe(false)
    expect('parentId' in plan.request.adds[1]).toBe(false)
  })

  it('P11 dropped temps', () => {
    const nodes = rec(
      node(4, [1], { isPendingDelete: true }),
      node('tmp-1', [1, 4]),
      node(1, []),
      node('tmp-2', [1], { isPendingDelete: true }),
      node('tmp-3', [1, 'tmp-2']),
      node('tmp-4', [99]),
    )
    const plan = buildApplyPlan(nodes)
    expect(plan.request.adds).toEqual([])
    expect(plan.droppedTempKeys).toEqual(['tmp-1', 'tmp-2', 'tmp-3', 'tmp-4'])
  })

  it('P12 new node with edited value goes to adds only', () => {
    const plan = buildApplyPlan(rec(node(1, []), node('tmp-1', [1], { value: 'Changed' })))
    expect(plan.request.adds[0].value).toBe('Changed')
    expect(plan.request.edits).toEqual([])
  })

  it('P13 refreshIds', () => {
    const nodes = rec(
      node(26, [1, 4, 10, 18]),
      node(1, []),
      node(10, [1, 4], { isDeleted: true }),
      node(4, [1], { isPendingDelete: true }),
      node('tmp-1', [1]),
    )
    expect(buildApplyPlan(nodes).request.refreshIds).toEqual([1, 4, 10, 26])
  })

  it('P14 empty arrays when only a dropped temp is pending', () => {
    const plan = buildApplyPlan(rec(node(1, []), node('tmp-1', [1], { isPendingDelete: true })))
    expect(plan.request).toEqual({ edits: [], adds: [], deletes: [], refreshIds: [1] })
    expect(plan.droppedTempKeys).toEqual(['tmp-1'])
  })

  it('P15 settleApplied', () => {
    const nodes = rec(
      node(4, [1], { isEdited: true, value: 'A' }),
      node(10, [1, 4], { isPendingDelete: true }),
      node(26, [1, 4, 10, 18], { isPendingDelete: true }),
      node('tmp-1', [1, 4]),
      node('tmp-2', [1, 4, 'tmp-1']),
      node('tmp-3', [1, 4, 10]),
    )
    const plan = buildApplyPlan(nodes)
    expect(plan.droppedTempKeys).toEqual(['tmp-3'])
    const result = settleApplied(nodes, plan, { 'tmp-1': 31, 'tmp-2': 32 })
    expect(Object.keys(result)).toEqual(['4', '10', '26', '31', '32'])
    expect(result['4'].isEdited).toBe(false)
    expect(result['10'].isPendingDelete).toBe(false)
    expect(result['26'].isPendingDelete).toBe(false)
    expect(result['31'].id).toBe(31)
    expect(result['31'].isNew).toBe(false)
    expect(result['31'].parentId).toBe(4)
    expect(result['32'].parentId).toBe(31)
    expect(result['32'].ancestorIds).toEqual([1, 4, 31])
    expect(result).not.toBe(nodes)
  })

  it('P16 settleApplied without idMap entry', () => {
    const nodes = rec(node(1, []), node('tmp-1', [1]))
    const plan = buildApplyPlan(nodes)
    expect(plan.addedKeys).toEqual(['tmp-1'])
    const result = settleApplied(nodes, plan, {})
    expect(result['tmp-1']).toBeDefined()
    expect(result['tmp-1'].isNew).toBe(true)
  })

  it('P17 rekey helpers', () => {
    const idMap = { 'tmp-1': 31 }
    expect(rekeyId('tmp-1', idMap)).toBe(31)
    expect(rekeyId(5, idMap)).toBe(5)
    expect(rekeyId('tmp-9', idMap)).toBe('tmp-9')
    expect(rekeyKey('tmp-1', idMap)).toBe('31')
    expect(rekeyKey('4', idMap)).toBe('4')
    expect(rekeySelection('tmp-2', idMap, ['tmp-2'])).toBeNull()
    expect(rekeySelection('tmp-1', idMap, ['tmp-2'])).toBe('31')
    expect(rekeySelection(null, idMap, ['tmp-2'])).toBeNull()
    expect(rekeyExpanded({ '1': true, 'tmp-1': true, 'tmp-2': true, '5': false }, idMap, ['tmp-2'])).toEqual({
      '1': true,
      '31': true,
    })
  })

  it('P18 describeApplyPlan', () => {
    const plan = buildApplyPlan(rec(node(4, [1], { isEdited: true }), node('tmp-1', [4]), node('tmp-2', [4])))
    expect(plan.request.edits).toHaveLength(1)
    expect(plan.request.adds).toHaveLength(2)
    expect(describeApplyPlan(plan)).toBe('1 edit(s), 2 addition(s), 0 deletion(s) saved.')
  })

  it('P19 canModify', () => {
    const n5 = node(5, [1])
    n5.isDeleted = true
    const nodes = rec(node(1, []), node(10, [1, 4], { isPendingDelete: true }), node(26, [1, 4, 10, 18]), n5)
    expect(canModify(nodes['1'], nodes)).toBe(true)
    expect(canModify(nodes['10'], nodes)).toBe(false)
    expect(canModify(nodes['26'], nodes)).toBe(false)
    expect(canModify(nodes['5'], nodes)).toBe(false)
  })
})
