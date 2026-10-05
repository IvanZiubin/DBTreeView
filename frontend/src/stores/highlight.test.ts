import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHighlightStore } from './highlight'

describe('highlight store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('HL1 hover link', () => {
    const h = useHighlightStore()
    h.setHover('db', '4')
    expect(h.isLinked('cache', '4')).toBe(true)
    expect(h.isLinked('db', '4')).toBe(false)
    expect(h.isLinked('cache', '5')).toBe(false)
    h.clearHover()
    expect(h.hover).toBeNull()
  })

  it('HL2 flash lifetime', () => {
    const h = useHighlightStore()
    h.flashKeys({ 'c:10': 're-parented', 'db:10': '' })
    expect(h.flashTag('c', '10')).toBe('re-parented')
    expect(h.isFlashing('db', '10')).toBe(true)
    expect(h.flashTag('db', '10')).toBeNull()
    vi.advanceTimersByTime(1800)
    expect(h.isFlashing('c', '10')).toBe(false)
    expect(h.isFlashing('db', '10')).toBe(false)
  })

  it('HL3 newer flash survives', () => {
    const h = useHighlightStore()
    h.flashKeys({ 'c:1': 'cascade' })
    vi.advanceTimersByTime(1000)
    h.flashKeys({ 'c:1': 'saved' })
    vi.advanceTimersByTime(800)
    expect(h.flashTag('c', '1')).toBe('saved')
    vi.advanceTimersByTime(1000)
    expect(h.isFlashing('c', '1')).toBe(false)
  })

  it('HL4 clear', () => {
    const h = useHighlightStore()
    h.setHover('db', '1')
    h.flashKeys({ 'c:1': 'x' })
    h.clear()
    expect(h.hover).toBeNull()
    expect(h.flash).toEqual({})
    h.flashKeys({ 'c:2': 'y' })
    vi.advanceTimersByTime(1800)
    // first timer fires at 1800 and must be a no-op; second fires at 1800 too, so check mid-way separately
    expect(h.flash).toEqual({})
  })

  it('HL4b first timer does not touch a later flash', () => {
    const h = useHighlightStore()
    h.flashKeys({ 'c:1': 'x' })
    vi.advanceTimersByTime(1000)
    h.clear()
    h.flashKeys({ 'c:2': 'y' })
    vi.advanceTimersByTime(800)
    expect(h.flashTag('c', '2')).toBe('y')
  })

  it('HL5 empty entries', () => {
    const h = useHighlightStore()
    h.flashKeys({})
    expect(h.flash).toEqual({})
    expect(vi.getTimerCount()).toBe(0)
  })
})
