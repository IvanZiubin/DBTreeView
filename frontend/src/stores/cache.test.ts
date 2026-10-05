import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { NodeDetails } from '../api/types'
import { useCacheStore } from './cache'

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

function details(id: number, overrides: Partial<NodeDetails> = {}): NodeDetails {
  const ancestorIds = ANC[id]
  return {
    id,
    parentId: ancestorIds.length > 0 ? ancestorIds[ancestorIds.length - 1] : null,
    value: `Node ${id}`,
    isDeleted: false,
    hasChildren: true,
    ancestorIds,
    ...overrides,
  }
}

describe('useCacheStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('C1 loadNode inserts', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1, { hasChildren: true }))
    const n = cache.nodes['1']
    expect(n.value).toBe(n.originalValue)
    expect(n.hasChildren).toBe(true)
    expect(n.isDeleted).toBe(false)
    expect(n.isNew).toBe(false)
    expect(n.isEdited).toBe(false)
    expect(n.isPendingDelete).toBe(false)
    expect(cache.isEmpty).toBe(false)
    expect(cache.selectedKey).toBe('1')
    expect(cache.expandedKeys['1']).toBe(true)
  })

  it('C2 treeNodes uses hierarchy', () => {
    const cache = useCacheStore()
    cache.loadNode(details(26))
    cache.loadNode(details(1))
    cache.loadNode(details(10))
    expect(cache.treeNodes.map((n) => n.key)).toEqual(['1'])
    expect(cache.treeNodes[0].children?.[0].key).toBe('10')
    expect(cache.treeNodes[0].children?.[0].children?.[0].key).toBe('26')
  })

  it('C3 reload refreshes server fields', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1, { value: 'A' }))
    cache.loadNode(details(1, { value: 'B', isDeleted: true, hasChildren: false }))
    expect(Object.keys(cache.nodes)).toEqual(['1'])
    const n = cache.nodes['1']
    expect(n.value).toBe('B')
    expect(n.originalValue).toBe('B')
    expect(n.isDeleted).toBe(true)
    expect(n.hasChildren).toBe(false)
  })

  it('C4 reload keeps pending flags and edited value', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    const n = cache.nodes['1']
    n.isEdited = true
    n.value = 'Local'
    n.isPendingDelete = true
    cache.loadNode(details(1, { value: 'Server' }))
    expect(cache.nodes['1'].value).toBe('Local')
    expect(cache.nodes['1'].originalValue).toBe('Server')
    expect(cache.nodes['1'].isEdited).toBe(true)
    expect(cache.nodes['1'].isPendingDelete).toBe(true)
    expect(cache.nodes['1'].isNew).toBe(false)
  })

  it('C5 mergeServerNodes batch', () => {
    const cache = useCacheStore()
    cache.mergeServerNodes([details(1), details(4), details(10)])
    expect(Object.keys(cache.nodes)).toHaveLength(3)
    expect(cache.expandedKeys).toEqual({ '1': true, '4': true, '10': true })
    expect(cache.selectedKey).toBeNull()
  })

  it('C6 user collapse is respected', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    cache.loadNode(details(4))
    cache.expandedKeys = { '4': true }
    cache.loadNode(details(2))
    expect(cache.expandedKeys['1']).toBeUndefined()
    expect(cache.expandedKeys['2']).toBe(true)
  })

  it('C7 load reveals cached ancestors', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    cache.loadNode(details(4))
    cache.expandedKeys = {}
    cache.loadNode(details(10))
    expect(cache.expandedKeys['1']).toBe(true)
    expect(cache.expandedKeys['4']).toBe(true)
    expect(cache.expandedKeys['10']).toBe(true)
    expect(cache.selectedKey).toBe('10')
  })

  it('C8 deleted display flags', () => {
    const cache = useCacheStore()
    cache.loadNode(details(10, { isDeleted: true }))
    expect(cache.treeNodes[0].data.node.isDeleted).toBe(true)
    cache.nodes['10'].isPendingDelete = true
    expect(cache.treeNodes[0].data.node.isPendingDelete).toBe(true)
  })

  it('C9 realIds', () => {
    const cache = useCacheStore()
    cache.loadNode(details(10))
    cache.loadNode(details(1))
    cache.loadNode(details(4))
    cache.nodes['tmp-1'] = {
      id: 'tmp-1',
      parentId: 1,
      value: 'new',
      originalValue: '',
      isDeleted: false,
      hasChildren: false,
      isNew: true,
      isEdited: false,
      isPendingDelete: false,
      ancestorIds: [1],
    }
    expect(cache.realIds).toEqual([1, 4, 10])
  })

  it('C10 clear (Reset)', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    cache.loadNode(details(4))
    const before = cache.epoch
    cache.clear()
    expect(cache.isEmpty).toBe(true)
    expect(cache.treeNodes).toEqual([])
    expect(cache.selectedKey).toBeNull()
    expect(cache.expandedKeys).toEqual({})
    expect(cache.nextTempSeq).toBe(1)
    expect(cache.epoch).toBe(before + 1)
    expect(cache.realIds).toEqual([])
  })

  it('C11 hasPendingChanges', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    expect(cache.hasPendingChanges).toBe(false)
    cache.nodes['1'].isEdited = true
    expect(cache.hasPendingChanges).toBe(true)
  })

  it('C12 selectedNode', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    expect(cache.selectedNode).toBe(cache.nodes['1'])
    cache.selectedKey = '999'
    expect(cache.selectedNode).toBeNull()
  })
})
