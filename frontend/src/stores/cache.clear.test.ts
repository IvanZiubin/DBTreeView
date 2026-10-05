// Clear cache (DR-FE-5.6) is client-only: cache.clear() must empty every piece of cache state and issue no request.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setRequestObserver } from '../api/client'
import type { NodeDetails } from '../api/types'
import { useCacheStore } from './cache'

const ANC: Record<number, number[]> = {
  1: [],
  4: [1],
  10: [1, 4],
  26: [1, 4, 10, 18],
}

function details(id: number): NodeDetails {
  const ancestorIds = ANC[id]
  return {
    id,
    parentId: ancestorIds.length > 0 ? ancestorIds[ancestorIds.length - 1] : null,
    value: `Node ${id}`,
    isDeleted: false,
    hasChildren: true,
    ancestorIds,
  }
}

describe('cache clear (Clear cache button)', () => {
  const fetchMock = vi.fn()
  const start = vi.fn(() => 1)
  const finish = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    start.mockClear()
    finish.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    setRequestObserver({ start, finish })
  })

  afterEach(() => {
    setRequestObserver(null)
    vi.unstubAllGlobals()
  })

  it('K1 empties nodes, pending changes, selection, expansion and temp ids without any request', () => {
    const cache = useCacheStore()
    for (const id of [1, 4, 10, 26]) {
      cache.loadNode(details(id))
    }
    expect(cache.editValue(4, 'Edited')).toBe(true)
    expect(cache.addChild(4, 'New')).toBe('tmp-1')
    expect(cache.deleteNode(10)).toBe(true)
    expect(cache.hasPendingChanges).toBe(true)
    const epochBefore = cache.epoch

    cache.clear()

    expect(cache.nodes).toEqual({})
    expect(cache.isEmpty).toBe(true)
    expect(cache.treeNodes).toEqual([])
    expect(cache.realIds).toEqual([])
    expect(cache.pendingCount).toBe(0)
    expect(cache.hasPendingChanges).toBe(false)
    expect(cache.selectedKey).toBeNull()
    expect(cache.selectedNode).toBeNull()
    expect(cache.expandedKeys).toEqual({})
    expect(cache.nextTempSeq).toBe(1)
    expect(cache.lastIdMap).toEqual({})
    expect(cache.applying).toBe(false)
    expect(cache.epoch).toBe(epochBefore + 1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
    expect(finish).not.toHaveBeenCalled()
  })

  it('K2 temp ids restart at tmp-1 after clear', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    expect(cache.addChild(1, 'A')).toBe('tmp-1')
    expect(cache.addChild(1, 'B')).toBe('tmp-2')
    cache.clear()
    cache.loadNode(details(1))
    expect(cache.addChild(1, 'C')).toBe('tmp-1')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('K3 clearing an empty cache only starts a new epoch', () => {
    const cache = useCacheStore()
    const epochBefore = cache.epoch
    cache.clear()
    expect(cache.isEmpty).toBe(true)
    expect(cache.epoch).toBe(epochBefore + 1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })
})
