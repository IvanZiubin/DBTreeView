import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { installErrorToast, reportError } from '../errors'
import { useToastStore } from './toasts'

describe('toast store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('TS1 default life', () => {
    const s = useToastStore()
    expect(s.show({ severity: 'info', summary: 'S', detail: 'D' })).toBe(1)
    expect(s.toasts).toEqual([{ id: 1, severity: 'info', summary: 'S', detail: 'D' }])
    vi.advanceTimersByTime(3200)
    expect(s.toasts).toEqual([])
  })

  it('TS2 custom life', () => {
    const s = useToastStore()
    s.show({ severity: 'info', summary: 'S', detail: 'D', lifeMs: 6000 })
    vi.advanceTimersByTime(3200)
    expect(s.toasts).toHaveLength(1)
    vi.advanceTimersByTime(2800)
    expect(s.toasts).toHaveLength(0)
  })

  it('TS3 max 4', () => {
    const s = useToastStore()
    for (let i = 0; i < 5; i++) s.show({ severity: 'info', summary: 'S', detail: 'D' })
    expect(s.toasts.map((t) => t.id)).toEqual([2, 3, 4, 5])
  })

  it('TS4 dismiss', () => {
    const s = useToastStore()
    const first = s.show({ severity: 'info', summary: 'A', detail: '' })
    const second = s.show({ severity: 'info', summary: 'B', detail: '' })
    s.dismiss(first)
    expect(s.toasts.map((t) => t.id)).toEqual([second])
  })

  it('TS5 reportError wiring', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = useToastStore()
    installErrorToast((t) => {
      s.show(t)
    })
    reportError(new ApiError(409, { title: 'Conflict', detail: 'Node 3 is deleted' }, 'x'))
    expect(s.toasts).toHaveLength(1)
    expect(s.toasts[0]).toMatchObject({ severity: 'error', summary: 'Conflict', detail: 'Node 3 is deleted' })
    vi.advanceTimersByTime(3200)
    expect(s.toasts).toHaveLength(1)
    vi.advanceTimersByTime(2800)
    expect(s.toasts).toHaveLength(0)
  })
})
