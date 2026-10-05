import { describe, expect, it } from 'vitest'
import { buildCacheTree } from './hierarchy'
import type { CachedNode } from './model'

function cached(id: number, ancestorIds: number[]): CachedNode {
  const value = `Node ${id}`
  return {
    id,
    parentId: ancestorIds.length > 0 ? ancestorIds[ancestorIds.length - 1] : null,
    value,
    originalValue: value,
    isDeleted: false,
    hasChildren: false,
    isNew: false,
    isEdited: false,
    isPendingDelete: false,
    ancestorIds,
  }
}

describe('buildCacheTree (smoke)', () => {
  it('nests 26 under 10 under 1 with gap markers when loaded as 26, 1, 10', () => {
    const tree = buildCacheTree([cached(26, [1, 4, 10, 18]), cached(1, []), cached(10, [1, 4])])

    expect(tree.map((n) => n.key)).toEqual(['1'])
    expect(tree[0].data.missingAncestorIds).toEqual([])

    const node10 = tree[0].children?.[0]
    expect(node10?.key).toBe('10')
    expect(node10?.data.missingAncestorIds).toEqual([4])

    const node26 = node10?.children?.[0]
    expect(node26?.key).toBe('26')
    expect(node26?.data.missingAncestorIds).toEqual([18])
    expect(node26?.leaf).toBe(true)
  })
})
