import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyChanges } from '../api/client'
import type { ApplyResponse, NodeDetails } from '../api/types'
import { nodeStatus } from '../cache/pending'
import { useCacheStore } from './cache'

vi.mock('../api/client', () => ({ applyChanges: vi.fn() }))

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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

type Store = ReturnType<typeof useCacheStore>

/** State of C22: 1, 4, 10, 26 loaded; 4 edited; tmp-1 under 4; tmp-2 under tmp-1; 10 (+26) pending delete. */
function c22State(): Store {
  const cache = useCacheStore()
  for (const id of [1, 4, 10, 26]) {
    cache.loadNode(details(id))
  }
  cache.editValue(4, 'Comp')
  cache.addChild(4, 'T')
  cache.addChild('tmp-1', 'U')
  cache.deleteNode(10)
  return cache
}

function c22Response(): ApplyResponse {
  return {
    idMap: { 'tmp-1': 31, 'tmp-2': 32 },
    nodes: [
      details(1),
      details(4, { value: 'Comp' }),
      details(10, { isDeleted: true }),
      details(26, { isDeleted: true }),
      { id: 31, parentId: 4, value: 'T', isDeleted: false, hasChildren: true, ancestorIds: [1, 4] },
      { id: 32, parentId: 31, value: 'U', isDeleted: false, hasChildren: false, ancestorIds: [1, 4, 31] },
    ],
  }
}

describe('useCacheStore pending changes', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(applyChanges).mockReset()
  })

  it('C13 editValue real node', () => {
    const cache = useCacheStore()
    cache.loadNode(details(4))
    expect(cache.editValue(4, '  New  ')).toBe(true)
    expect(cache.nodes['4'].value).toBe('New')
    expect(cache.nodes['4'].isEdited).toBe(true)
    expect(cache.pendingCount).toBe(1)
    expect(cache.editValue(4, 'Node 4')).toBe(true)
    expect(cache.nodes['4'].isEdited).toBe(false)
    expect(cache.hasPendingChanges).toBe(false)
  })

  it('C14 editValue rejections', () => {
    const cache = useCacheStore()
    cache.loadNode(details(4))
    expect(cache.editValue(4, '   ')).toBe(false)
    expect(cache.editValue(999, 'x')).toBe(false)
    cache.loadNode(details(10, { isDeleted: true }))
    expect(cache.editValue(10, 'x')).toBe(false)
    expect(cache.deleteNode(4)).toBe(true)
    expect(cache.editValue(4, 'x')).toBe(false)
    expect(cache.nodes['4'].value).toBe('Node 4')
    expect(cache.nodes['10'].value).toBe('Node 10')
  })

  it('C15 editValue temp node', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    cache.addChild(1, 'A')
    expect(cache.editValue('tmp-1', 'B')).toBe(true)
    expect(cache.nodes['tmp-1'].value).toBe('B')
    expect(cache.nodes['tmp-1'].isEdited).toBe(false)
    expect(cache.nodes['tmp-1'].isNew).toBe(true)
  })

  it('C16 addChild', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    expect(cache.addChild(1, ' A ')).toBe('tmp-1')
    expect(cache.addChild('tmp-1', 'B')).toBe('tmp-2')
    expect(cache.nodes['tmp-1']).toMatchObject({
      parentId: 1,
      ancestorIds: [1],
      value: 'A',
      originalValue: '',
      isNew: true,
      hasChildren: false,
    })
    expect(cache.nodes['tmp-2']).toMatchObject({ parentId: 'tmp-1', ancestorIds: [1, 'tmp-1'] })
    expect(cache.nextTempSeq).toBe(3)
    expect(cache.expandedKeys['1']).toBe(true)
    expect(cache.expandedKeys['tmp-1']).toBe(true)
    expect(cache.expandedKeys['tmp-2']).toBe(true)
    expect(cache.selectedKey).toBe('tmp-2')
    expect(cache.treeNodes.map((n) => n.key)).toEqual(['1'])
    expect(cache.treeNodes[0].children?.map((n) => n.key)).toEqual(['tmp-1'])
    expect(cache.treeNodes[0].children?.[0].children?.map((n) => n.key)).toEqual(['tmp-2'])
  })

  it('C17 addChild rejections', () => {
    const cache = useCacheStore()
    cache.loadNode(details(10, { isDeleted: true }))
    expect(cache.addChild(10, 'x')).toBeNull()
    cache.loadNode(details(1))
    cache.deleteNode(1)
    expect(cache.addChild(1, 'x')).toBeNull()
    cache.loadNode(details(2))
    expect(cache.addChild(2, '')).toBeNull()
    expect(Object.keys(cache.nodes).filter((k) => k.startsWith('tmp-'))).toEqual([])
    expect(cache.nextTempSeq).toBe(1)
  })

  it('C18 deleteNode cascade', () => {
    const cache = useCacheStore()
    for (const id of [1, 10, 26]) {
      cache.loadNode(details(id))
    }
    cache.addChild(10, 'T')
    expect(cache.deleteNode(10)).toBe(true)
    expect(cache.nodes['10'].isPendingDelete).toBe(true)
    expect(cache.nodes['26'].isPendingDelete).toBe(true)
    expect(cache.nodes['tmp-1'].isPendingDelete).toBe(true)
    expect(cache.nodes['1'].isPendingDelete).toBe(false)
    expect(cache.deleteNode(26)).toBe(false)
    cache.selectedKey = '26'
    expect(cache.canModifySelected).toBe(false)
  })

  it('C19 load under pending delete (insert branch)', () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    cache.loadNode(details(10))
    cache.deleteNode(10)
    cache.loadNode(details(27))
    expect(cache.nodes['27'].isPendingDelete).toBe(true)
    expect(nodeStatus(cache.nodes['27'])).toBe('pending-delete')
  })

  it('C20 reload under pending delete (refresh branch)', () => {
    const cache = useCacheStore()
    cache.loadNode(details(10))
    cache.loadNode(details(26))
    cache.deleteNode(10)
    cache.nodes['26'].isPendingDelete = false
    cache.loadNode(details(26))
    expect(cache.nodes['26'].isPendingDelete).toBe(true)
  })

  it('C21 derived deleted on reload of ancestor', () => {
    const cache = useCacheStore()
    cache.loadNode(details(10))
    cache.loadNode(details(26))
    cache.loadNode(details(10, { isDeleted: true }))
    expect(cache.nodes['26'].isDeleted).toBe(true)
  })

  it('C22 apply success', async () => {
    const cache = c22State()
    expect(cache.selectedKey).toBe('tmp-2')
    vi.mocked(applyChanges).mockResolvedValueOnce(c22Response())
    const plan = await cache.apply()
    expect(applyChanges).toHaveBeenCalledTimes(1)
    expect(applyChanges).toHaveBeenCalledWith({
      edits: [{ id: 4, value: 'Comp' }],
      adds: [
        { tempId: 'tmp-1', parentId: 4, value: 'T' },
        { tempId: 'tmp-2', parentTempId: 'tmp-1', value: 'U' },
      ],
      deletes: [10],
      refreshIds: [1, 4, 10, 26],
    })
    expect(plan).not.toBeNull()
    expect(plan?.request.deletes).toEqual([10])
    expect(Object.keys(cache.nodes)).toEqual(['1', '4', '10', '26', '31', '32'])
    for (const n of cache.nodeList) {
      expect(n.isNew).toBe(false)
      expect(n.isEdited).toBe(false)
      expect(n.isPendingDelete).toBe(false)
    }
    expect(cache.nodes['10'].isDeleted).toBe(true)
    expect(cache.nodes['26'].isDeleted).toBe(true)
    expect(cache.nodes['4'].value).toBe('Comp')
    expect(cache.nodes['4'].originalValue).toBe('Comp')
    expect(cache.selectedKey).toBe('32')
    expect(cache.expandedKeys['31']).toBe(true)
    expect(cache.expandedKeys['32']).toBe(true)
    expect(Object.keys(cache.expandedKeys).some((k) => k.startsWith('tmp-'))).toBe(false)
    expect(cache.applying).toBe(false)
    expect(cache.hasPendingChanges).toBe(false)
  })

  it('C23 apply drops temp under pending delete and discards edits', async () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    cache.loadNode(details(5))
    cache.editValue(5, 'M')
    cache.addChild(5, 'F')
    cache.deleteNode(1)
    vi.mocked(applyChanges).mockResolvedValueOnce({
      idMap: {},
      nodes: [details(1, { isDeleted: true }), details(5, { isDeleted: true })],
    })
    await cache.apply()
    const body = vi.mocked(applyChanges).mock.calls[0][0]
    expect(body.edits).toEqual([])
    expect(body.adds).toEqual([])
    expect(body.deletes).toEqual([1])
    expect('tmp-1' in cache.nodes).toBe(false)
    expect(cache.nodes['5'].value).toBe('Node 5')
    expect(cache.nodes['5'].isEdited).toBe(false)
    expect(cache.nodes['5'].isDeleted).toBe(true)
  })

  it('C24 apply failure keeps everything', async () => {
    const cache = c22State()
    const snapshot = () =>
      JSON.stringify([cache.nodes, cache.selectedKey, cache.expandedKeys, cache.nextTempSeq])
    const before = snapshot()
    vi.mocked(applyChanges).mockRejectedValueOnce(new Error('boom'))
    await expect(cache.apply()).rejects.toThrow('boom')
    expect(snapshot()).toBe(before)
    expect(cache.applying).toBe(false)
    expect(cache.hasPendingChanges).toBe(true)
  })

  it('C24b 409 recovery: conflicting nodes become deleted, other changes stay pending', async () => {
    const cache = useCacheStore()
    for (const id of [1, 4, 5, 10]) {
      cache.loadNode(details(id))
    }
    cache.editValue(4, 'Comp')
    cache.addChild(4, 'T')
    cache.editValue(5, 'Phones')

    // Another client deleted 4 (and so 10): apply returns 409 with nodeIds [4]; the cache is untouched.
    expect(cache.markDeletedInDb([4, 999])).toEqual(['4'])

    expect(nodeStatus(cache.nodes['4'])).toBe('deleted')
    expect(cache.nodes['4'].value).toBe('Node 4')
    expect(cache.nodes['4'].isEdited).toBe(false)
    expect(nodeStatus(cache.nodes['10'])).toBe('deleted')
    expect(cache.nodes['tmp-1'].isPendingDelete).toBe(true)
    expect(cache.nodes['5'].isEdited).toBe(true)

    vi.mocked(applyChanges).mockResolvedValueOnce({ idMap: {}, nodes: [details(5, { value: 'Phones' })] })
    await cache.apply()
    expect(applyChanges).toHaveBeenLastCalledWith({
      edits: [{ id: 5, value: 'Phones' }],
      adds: [],
      deletes: [],
      refreshIds: [1, 4, 5, 10],
    })
    expect('tmp-1' in cache.nodes).toBe(false)
    expect(cache.hasPendingChanges).toBe(false)
  })

  it('C25 apply ignored after Reset (epoch)', async () => {
    const cache = useCacheStore()
    cache.loadNode(details(4))
    cache.editValue(4, 'X')
    const d = deferred<ApplyResponse>()
    vi.mocked(applyChanges).mockReturnValueOnce(d.promise)
    const promise = cache.apply()
    cache.clear()
    d.resolve({ idMap: {}, nodes: [details(4, { value: 'X' })] })
    expect(await promise).toBeNull()
    expect(cache.isEmpty).toBe(true)
    expect(cache.applying).toBe(false)
  })

  it('C26 apply no-op', async () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    expect(await cache.apply()).toBeNull()
    expect(applyChanges).not.toHaveBeenCalled()
  })

  it('C27 actions rejected while applying', async () => {
    const cache = useCacheStore()
    cache.loadNode(details(1))
    cache.loadNode(details(4))
    cache.editValue(4, 'x4')
    const d = deferred<ApplyResponse>()
    vi.mocked(applyChanges).mockReturnValueOnce(d.promise)
    const promise = cache.apply()
    expect(cache.editValue(1, 'x')).toBe(false)
    expect(cache.addChild(1, 'x')).toBeNull()
    expect(cache.deleteNode(1)).toBe(false)
    expect(await cache.apply()).toBeNull()
    expect(applyChanges).toHaveBeenCalledTimes(1)
    expect(cache.canModifySelected).toBe(false)
    d.resolve({ idMap: {}, nodes: [details(1), details(4, { value: 'x4' })] })
    await promise
  })
})
