import { describe, expect, it } from 'vitest'
import { lastLoadStatusText, loadPath, nodeRef } from './transfer'

describe('view/transfer', () => {
  it('VT1 nodeRef / loadPath', () => {
    expect(nodeRef(4, 'Computers')).toBe('#4 Computers')
    expect(loadPath(4)).toBe('GET /api/nodes/4')
  })

  it('VT2 lastLoadStatusText', () => {
    const base = { id: 1, label: 'x' }
    expect(lastLoadStatusText({ ...base, status: 200, durationMs: 14, reparented: 0 })).toBe('200 · 14 ms')
    expect(lastLoadStatusText({ ...base, status: 200, durationMs: 14, reparented: 2 })).toBe('200 · 14 ms · 2 re-parented')
    expect(lastLoadStatusText({ ...base, status: 404, durationMs: 9, reparented: 0 })).toBe('404 · 9 ms')
    expect(lastLoadStatusText({ ...base, status: 0, durationMs: 3, reparented: 0 })).toBe('network error · 3 ms')
  })
})
