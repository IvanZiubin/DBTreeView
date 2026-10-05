import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getNode } from '../api/client'
import type { NodeDetails } from '../api/types'
import { useCacheStore } from './cache'
import { useHighlightStore } from './highlight'
import { useTransferStore } from './transfer'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  getNode: vi.fn(),
}))

const ANC: Record<number, number[]> = { 1: [], 2: [], 4: [1], 10: [1, 4], 26: [1, 4, 10, 18] }

function details(id: number): NodeDetails {
  const a = ANC[id]
  return { id, parentId: a.length ? a[a.length - 1] : null, value: `Node ${id}`, isDeleted: false, hasChildren: true, ancestorIds: a }
}

const getNodeMock = vi.mocked(getNode)

function deferred() {
  let resolve: (d: NodeDetails) => void = () => {}
  const promise = new Promise<NodeDetails>((r) => (resolve = r))
  return { promise, resolve }
}

describe('transfer store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getNodeMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('T1 single load path', async () => {
    getNodeMock.mockResolvedValue(details(10))
    const t = useTransferStore()
    const cache = useCacheStore()
    expect(await t.loadIntoCache(10, 'Node 10')).toBe(true)
    expect(getNodeMock).toHaveBeenCalledTimes(1)
    expect(getNodeMock).toHaveBeenCalledWith(10)
    expect(cache.nodes['10']).toBeDefined()
    expect(cache.selectedKey).toBe('10')
    expect(t.lastLoad).toMatchObject({ id: 10, label: 'Node 10', status: 200, reparented: 0 })
    expect(t.lastLoad!.durationMs).toBeGreaterThanOrEqual(0)
    expect(t.pendingLoad).toBeNull()
    expect(t.flight).toEqual({ key: '10', label: 'Node 10', seq: 1 })
  })

  it('T2 re-parent count + flash', async () => {
    const cache = useCacheStore()
    cache.loadNode(details(10))
    cache.loadNode(details(26))
    getNodeMock.mockResolvedValue(details(4))
    const t = useTransferStore()
    await t.loadIntoCache(4, 'Node 4')
    expect(t.lastLoad!.reparented).toBe(1)
    const h = useHighlightStore()
    expect(h.flash['c:10']).toBe('re-parented')
    expect('c:26' in h.flash).toBe(false)
  })

  it('T3 reload', async () => {
    const cache = useCacheStore()
    cache.loadNode(details(10))
    getNodeMock.mockResolvedValue(details(10))
    const t = useTransferStore()
    expect(await t.loadIntoCache(10, 'Node 10')).toBe(true)
    expect(t.lastLoad!.reparented).toBe(0)
    expect(t.flight).toBeNull()
  })

  it('T4 concurrent call ignored', async () => {
    const d = deferred()
    getNodeMock.mockReturnValue(d.promise)
    const t = useTransferStore()
    const first = t.loadIntoCache(1, 'Node 1')
    expect(await t.loadIntoCache(2, 'Node 2')).toBe(false)
    expect(getNodeMock).toHaveBeenCalledTimes(1)
    expect(t.pendingLoad!.id).toBe(1)
    d.resolve(details(1))
    await first
    expect(t.pendingLoad).toBeNull()
  })

  it('T5 Clear cache / Reset mid-flight', async () => {
    const d = deferred()
    getNodeMock.mockReturnValue(d.promise)
    const t = useTransferStore()
    const cache = useCacheStore()
    const p = t.loadIntoCache(1, 'Node 1')
    cache.clear()
    t.reset()
    d.resolve(details(1))
    expect(await p).toBe(false)
    expect(cache.isEmpty).toBe(true)
    expect(t.lastLoad).toBeNull()
    expect(t.pendingLoad).toBeNull()
  })

  it('T6 failure', async () => {
    getNodeMock.mockRejectedValue(new ApiError(404, { title: 'Not Found' }, 'x'))
    const t = useTransferStore()
    const cache = useCacheStore()
    expect(await t.loadIntoCache(4, 'Node 4')).toBe(false)
    expect(t.lastLoad).toMatchObject({ id: 4, label: 'Node 4', status: 404, reparented: 0 })
    expect(cache.isEmpty).toBe(true)
    expect(t.pendingLoad).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('T7 drag + reset', () => {
    const t = useTransferStore()
    t.startDrag(4, 'Computers')
    expect(t.drag).toEqual({ id: 4, label: 'Computers' })
    t.reset()
    expect(t.drag).toBeNull()
    expect(t.pendingLoad).toBeNull()
    expect(t.lastLoad).toBeNull()
    expect(t.flight).toBeNull()
  })
})
