import { describe, expect, it } from 'vitest'
import { reparentedKeys } from './hierarchy'
import type { CachedNode } from './model'

const ANC: Record<string, (number | string)[]> = {
  '1': [], '2': [], '3': [], '4': [1], '5': [1], '10': [1, 4], '18': [1, 4, 10], '26': [1, 4, 10, 18], '27': [1, 4, 10, 18],
  'tmp-1': [1, 4, 10],
}

function n(id: number | string): CachedNode {
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
  }
}

describe('reparentedKeys', () => {
  it('RP1 load root above gap', () => {
    expect(reparentedKeys([n(10), n(26)], 1)).toEqual(['10'])
  })
  it('RP2 siblings move together', () => {
    expect(reparentedKeys([n(10), n(26), n(27)], 18)).toEqual(['26', '27'])
  })
  it('RP3 already cached', () => {
    expect(reparentedKeys([n(1), n(10)], 1)).toEqual([])
  })
  it('RP4 unrelated', () => {
    expect(reparentedKeys([n(5), n(2)], 10)).toEqual([])
  })
  it('RP5 temp nodes', () => {
    expect(reparentedKeys([n(1), n(10), n('tmp-1')], 4)).toEqual(['10'])
  })
  it('RP6 order', () => {
    expect(reparentedKeys([n(27), n(26)], 18)).toEqual(['26', '27'])
  })
})
