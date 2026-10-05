import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getChildren, getRoots } from '../api/client'
import type { Node } from '../api/types'
import { useDbTreeStore } from './dbTree'

vi.mock('../api/client', () => ({ getRoots: vi.fn(), getChildren: vi.fn() }))

function n(id: number, parentId: number | null, hasChildren: boolean): Node {
  return { id, parentId, value: `Node ${id}`, isDeleted: false, hasChildren }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useDbTreeStore refresh', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getRoots).mockReset()
    vi.mocked(getChildren).mockReset()
  })

  it('R1 refresh keeps expansion and selection', async () => {
    const db = useDbTreeStore()
    db.setRoots([n(1, null, true), n(2, null, true)])
    vi.mocked(getChildren).mockResolvedValueOnce([n(4, 1, true), n(5, 1, false)])
    await db.loadChildren('1')
    vi.mocked(getChildren).mockResolvedValueOnce([n(10, 4, false)])
    await db.loadChildren('4')
    db.expandedKeys = { '1': true, '4': true }
    db.selectionKeys = { '10': true }

    vi.mocked(getChildren).mockReset()
    vi.mocked(getRoots).mockResolvedValueOnce([n(1, null, true), n(2, null, true)])
    vi.mocked(getChildren)
      .mockResolvedValueOnce([n(4, 1, true), n(5, 1, false)])
      .mockResolvedValueOnce([n(10, 4, false), n(31, 4, false)])
    await db.refresh()

    expect(vi.mocked(getChildren).mock.calls.map((c) => c[0])).toEqual([1, 4])
    const node4 = db.roots[0].children?.find((c) => c.key === '4')
    expect(node4?.children?.map((c) => c.key)).toEqual(['10', '31'])
    expect(db.expandedKeys).toEqual({ '1': true, '4': true })
    expect(db.selectionKeys).toEqual({ '10': true })
  })

  it('R2 refresh drops state for vanished nodes', async () => {
    const db = useDbTreeStore()
    db.setRoots([n(1, null, true)])
    vi.mocked(getChildren).mockResolvedValueOnce([n(4, 1, false), n(5, 1, false)])
    await db.loadChildren('1')
    db.selectionKeys = { '5': true }

    vi.mocked(getRoots).mockResolvedValueOnce([n(1, null, true)])
    vi.mocked(getChildren).mockResolvedValueOnce([n(4, 1, false)])
    await db.refresh()
    expect(db.selectionKeys).toEqual({})
  })

  it('R3 refresh aborted by setRoots', async () => {
    const db = useDbTreeStore()
    const d = deferred<Node[]>()
    vi.mocked(getRoots).mockReturnValueOnce(d.promise)
    const promise = db.refresh()
    db.setRoots([n(3, null, true)])
    d.resolve([n(1, null, true), n(2, null, true)])
    await promise
    expect(db.roots.map((r) => r.key)).toEqual(['3'])
    expect(getChildren).not.toHaveBeenCalled()
  })

  it('R4 leaf flag updated', async () => {
    const db = useDbTreeStore()
    db.setRoots([n(2, null, false)])
    expect(db.roots[0].leaf).toBe(true)
    vi.mocked(getRoots).mockResolvedValueOnce([n(2, null, true)])
    await db.refresh()
    expect(db.roots[0].key).toBe('2')
    expect(db.roots[0].leaf).toBe(false)
  })
})
