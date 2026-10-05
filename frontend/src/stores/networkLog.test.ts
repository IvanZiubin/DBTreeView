import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRoots, setRequestObserver } from '../api/client'
import { useNetworkLogStore } from './networkLog'

describe('network log store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setRequestObserver(null)
  })

  it('NL1 start', () => {
    const s = useNetworkLogStore()
    expect(s.start('GET', '/api/nodes/roots')).toBe(1)
    expect(s.start('GET', '/api/nodes/1')).toBe(2)
    expect(s.entries.map((e) => e.id)).toEqual([2, 1])
    expect(s.entries.every((e) => e.status === null)).toBe(true)
    expect(s.hasPending).toBe(true)
    expect(s.last?.id).toBe(2)
  })

  it('NL2 finish', () => {
    const s = useNetworkLogStore()
    s.start('GET', '/api/nodes/roots')
    s.start('GET', '/api/nodes/1')
    s.finish(1, 200, 5)
    s.finish(2, 404, 7)
    expect(s.entries.find((e) => e.id === 1)).toMatchObject({ status: 200, durationMs: 5 })
    expect(s.entries.find((e) => e.id === 2)).toMatchObject({ status: 404, durationMs: 7 })
    expect(s.hasPending).toBe(false)
  })

  it('NL3 toggle', () => {
    const s = useNetworkLogStore()
    expect(s.open).toBe(false)
    s.toggle()
    expect(s.open).toBe(true)
    s.toggle()
    expect(s.open).toBe(false)
  })

  it('NL4 time from now param', () => {
    const s = useNetworkLogStore()
    s.start('POST', '/api/reset', new Date(2026, 0, 1, 9, 8, 7))
    expect(s.entries[0].time).toBe('09:08:07')
  })

  it('NL5 wired to the real client', async () => {
    const s = useNetworkLogStore()
    setRequestObserver({ start: (m, p) => s.start(m, p), finish: (i, st, d) => s.finish(i, st, d) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await getRoots()
    expect(s.entries).toHaveLength(1)
    expect(s.entries[0]).toMatchObject({ method: 'GET', path: '/api/nodes/roots', status: 200 })
    expect(s.entries[0].durationMs).toBeGreaterThanOrEqual(0)
  })
})
