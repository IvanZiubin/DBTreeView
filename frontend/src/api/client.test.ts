import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, applyChanges, getChildren, getNode, getRoots, setRequestObserver } from './client'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('api client request observer', () => {
  const fetchMock = vi.fn()
  const observer = { start: vi.fn(() => 7), finish: vi.fn() }

  beforeEach(() => {
    fetchMock.mockReset()
    observer.start.mockClear()
    observer.finish.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    setRequestObserver(observer)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setRequestObserver(null)
  })

  it('N1 GET success is reported', async () => {
    fetchMock.mockResolvedValue(json([]))
    await expect(getRoots()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/nodes/roots')
    expect(fetchMock.mock.calls[0][1].method).toBe('GET')
    expect(observer.start).toHaveBeenCalledTimes(1)
    expect(observer.start).toHaveBeenCalledWith('GET', '/api/nodes/roots')
    expect(observer.finish).toHaveBeenCalledTimes(1)
    const call = observer.finish.mock.calls[0] as unknown as [number, number, number]
    expect(call[0]).toBe(7)
    expect(call[1]).toBe(200)
    expect(call[2]).toBeGreaterThanOrEqual(0)
  })

  it('N2 POST body and path', async () => {
    fetchMock.mockResolvedValue(json({ idMap: {}, nodes: [] }))
    const req = { edits: [], adds: [], deletes: [1], refreshIds: [1] }
    await applyChanges(req)
    expect(observer.start).toHaveBeenCalledWith('POST', '/api/nodes/apply')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(req)
    expect(observer.finish.mock.calls[0][1]).toBe(200)
  })

  it('N3 404 ProblemDetails', async () => {
    fetchMock.mockResolvedValue(json({ title: 'Not Found', detail: 'Node 999 not found' }, 404))
    const err = await getNode(999).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err as ApiError
    expect(apiErr.status).toBe(404)
    expect(apiErr.title).toBe('Not Found')
    expect(apiErr.detail).toBe('Node 999 not found')
    expect(observer.finish).toHaveBeenCalledTimes(1)
    expect(observer.finish.mock.calls[0][1]).toBe(404)
  })

  it('N4 network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    const err = (await getChildren(1).catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
    expect(err.title).toBe('Network error')
    expect(observer.finish).toHaveBeenCalledTimes(1)
    expect(observer.finish.mock.calls[0][1]).toBe(0)
  })

  it('N5 invalid JSON on 200', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
    await expect(getRoots()).rejects.toBeDefined()
    expect(observer.finish).toHaveBeenCalledTimes(1)
    expect(observer.finish.mock.calls[0][1]).toBe(200)
  })

  it('N6 no observer', async () => {
    setRequestObserver(null)
    fetchMock.mockResolvedValue(json([]))
    await expect(getRoots()).resolves.toEqual([])
    expect(observer.start).not.toHaveBeenCalled()
  })

  it('N7 observer captured at start', async () => {
    let resolve: (r: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    const b = { start: vi.fn(() => 9), finish: vi.fn() }
    const pending = getRoots()
    setRequestObserver(b)
    resolve(json([]))
    await pending
    expect(observer.finish).toHaveBeenCalledTimes(1)
    expect(b.start).not.toHaveBeenCalled()
    expect(b.finish).not.toHaveBeenCalled()
  })
})
