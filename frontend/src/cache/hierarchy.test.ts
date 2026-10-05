import { describe, expect, it } from 'vitest'
import { buildCacheTree, compareCacheIds, gapTooltip } from './hierarchy'
import type { CacheId, CachedNode } from './model'

function cached(id: CacheId, ancestorIds: CacheId[]): CachedNode {
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

const ANC: Record<number, number[]> = {
  1: [],
  2: [],
  3: [],
  4: [1],
  5: [1],
  10: [1, 4],
  18: [1, 4, 10],
  26: [1, 4, 10, 18],
  27: [1, 4, 10, 18],
}

function seed(id: number): CachedNode {
  return cached(id, ANC[id])
}

function keys(nodes: { key?: string | number }[] | undefined): string[] {
  return (nodes ?? []).map((n) => String(n.key))
}

describe('buildCacheTree', () => {
  it('H1 child before parent', () => {
    const tree = buildCacheTree([seed(4), seed(1)])
    expect(keys(tree)).toEqual(['1'])
    expect(keys(tree[0].children)).toEqual(['4'])
    expect(tree[0].children?.[0].data.missingAncestorIds).toEqual([])
  })

  it('H2 parent before child gives the same tree', () => {
    const a = buildCacheTree([seed(1), seed(4)])
    const b = buildCacheTree([seed(4), seed(1)])
    expect(keys(a)).toEqual(keys(b))
    expect(keys(a[0].children)).toEqual(keys(b[0].children))
  })

  it('H3 gap between grandparent and grandchild', () => {
    const tree = buildCacheTree([seed(1), seed(10)])
    const n10 = tree[0].children?.[0]
    expect(n10?.key).toBe('10')
    expect(n10?.data.missingAncestorIds).toEqual([4])
    expect(gapTooltip(n10?.data.missingAncestorIds)).toBe('1 level(s) not loaded: #4')
  })

  it('H4 deep gap, later fill order 26, 1, 10', () => {
    const tree = buildCacheTree([seed(26), seed(1), seed(10)])
    expect(keys(tree)).toEqual(['1'])
    const n10 = tree[0].children?.[0]
    const n26 = n10?.children?.[0]
    expect(n10?.key).toBe('10')
    expect(n26?.key).toBe('26')
    expect(n10?.data.missingAncestorIds).toEqual([4])
    expect(n26?.data.missingAncestorIds).toEqual([18])
  })

  it('H5 top-level non-root shows full gap', () => {
    const tree = buildCacheTree([seed(26)])
    expect(keys(tree)).toEqual(['26'])
    expect(tree[0].data.missingAncestorIds).toEqual([1, 4, 10, 18])
    expect(gapTooltip(tree[0].data.missingAncestorIds)).toBe('4 level(s) not loaded: #1, #4, #10, #18')
  })

  it('H6 DB root has no gap', () => {
    const tree = buildCacheTree([seed(1)])
    expect(tree[0].data.missingAncestorIds).toEqual([])
  })

  it('H7 siblings ordered by id ascending', () => {
    const tree = buildCacheTree([seed(5), seed(1), seed(4)])
    expect(keys(tree[0].children)).toEqual(['4', '5'])
  })

  it('H8 multiple roots ordered', () => {
    expect(keys(buildCacheTree([seed(3), seed(1), seed(2)]))).toEqual(['1', '2', '3'])
  })

  it('H9 unrelated subtrees with gaps', () => {
    const tree = buildCacheTree([seed(26), seed(2)])
    expect(keys(tree)).toEqual(['2', '26'])
    expect(tree[1].data.missingAncestorIds).toEqual([1, 4, 10, 18])
  })

  it('H10 temp ids after real ids in creation order', () => {
    const tree = buildCacheTree([
      cached(1, []),
      cached('tmp-10', [1]),
      cached(5, [1]),
      cached('tmp-2', [1]),
      cached(4, [1]),
    ])
    expect(keys(tree[0].children)).toEqual(['4', '5', 'tmp-2', 'tmp-10'])
  })

  it('H11 temp child of temp node', () => {
    const tree = buildCacheTree([cached(1, []), cached('tmp-1', [1]), cached('tmp-2', [1, 'tmp-1'])])
    const t1 = tree[0].children?.[0]
    const t2 = t1?.children?.[0]
    expect(t1?.key).toBe('tmp-1')
    expect(t2?.key).toBe('tmp-2')
    expect(t1?.data.missingAncestorIds).toEqual([])
    expect(t2?.data.missingAncestorIds).toEqual([])
  })

  it('H12 leaf flag', () => {
    const tree = buildCacheTree([seed(1), seed(4)])
    expect(tree[0].leaf).toBe(false)
    expect(tree[0].children?.[0].leaf).toBe(true)
  })

  it('H13 data references the cached node', () => {
    const node = seed(10)
    const tree = buildCacheTree([node])
    expect(tree[0].data.node).toBe(node)
    expect(tree[0].label).toBe(node.value)
    expect(tree[0].key).toBe('10')
  })

  it('H14 compareCacheIds', () => {
    expect(compareCacheIds(3, 10)).toBeLessThan(0)
    expect(compareCacheIds(10, 'tmp-1')).toBeLessThan(0)
    expect(compareCacheIds('tmp-2', 'tmp-10')).toBeLessThan(0)
    expect(compareCacheIds('tmp-1', 'x')).toBeLessThan(0)
  })

  it('H15 empty input', () => {
    expect(buildCacheTree([])).toEqual([])
  })
})
