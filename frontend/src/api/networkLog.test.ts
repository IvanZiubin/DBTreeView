import { describe, expect, it } from 'vitest'
import {
  addEntry,
  completeEntry,
  durationLabel,
  entrySummary,
  formatClockTime,
  requestCountLabel,
  statusLabel,
  statusTagClass,
  type NetworkLogEntry,
} from './networkLog'

function entry(id: number, status: number | null = null, durationMs: number | null = null, method = 'GET', path = '/api/nodes/4'): NetworkLogEntry {
  return { id, time: '00:00:00', method, path, status, durationMs }
}

describe('networkLog model', () => {
  it('L1 formatClockTime', () => {
    expect(formatClockTime(new Date(2026, 0, 2, 3, 4, 5))).toBe('03:04:05')
  })

  it('L2 addEntry newest first + cap', () => {
    let entries: NetworkLogEntry[] = []
    for (let id = 1; id <= 81; id++) entries = addEntry(entries, entry(id))
    expect(entries).toHaveLength(80)
    expect(entries[0].id).toBe(81)
    expect(entries[entries.length - 1].id).toBe(2)
  })

  it('L3 completeEntry', () => {
    const entries = [entry(2), entry(1)]
    const next = completeEntry(entries, 1, 404, 9)
    expect(next).not.toBe(entries)
    expect(next[1]).toMatchObject({ id: 1, status: 404, durationMs: 9 })
    expect(next[0]).toBe(entries[0])
    expect(completeEntry(entries, 99, 200, 1)).toEqual(entries)
  })

  it('L4 statusLabel', () => {
    expect(statusLabel(entry(1, null))).toBe('pending')
    expect(statusLabel(entry(1, 0))).toBe('failed')
    expect(statusLabel(entry(1, 404))).toBe('404')
  })

  it('L5 statusTagClass', () => {
    expect(statusTagClass(entry(1, null))).toBe('tag tag-neutral')
    expect(statusTagClass(entry(1, 200))).toBe('tag tag-accent')
    expect(statusTagClass(entry(1, 204))).toBe('tag tag-accent')
    for (const s of [404, 500, 0]) expect(statusTagClass(entry(1, s))).toBe('tag tag-outline')
  })

  it('L6 durationLabel', () => {
    expect(durationLabel(entry(1, null, null))).toBe('…')
    expect(durationLabel(entry(1, 200, 12))).toBe('12 ms')
  })

  it('L7 entrySummary', () => {
    expect(entrySummary(entry(1))).toBe('GET /api/nodes/4 → …')
    expect(entrySummary(entry(1, 200, 12))).toBe('GET /api/nodes/4 → 200 · 12 ms')
    expect(entrySummary(entry(1, 0, 3, 'POST', '/api/reset'))).toBe('POST /api/reset → failed · 3 ms')
  })

  it('L8 requestCountLabel', () => {
    expect(requestCountLabel(0)).toBe('0 requests')
    expect(requestCountLabel(1)).toBe('1 request')
    expect(requestCountLabel(2)).toBe('2 requests')
  })
})
