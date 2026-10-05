import { describe, expect, it } from 'vitest'
import { computeLinkLines, linkPath, sameLines, type LinkLineInput } from './linkLines'

function input(over: Partial<LinkLineInput> = {}): LinkLineInput {
  return {
    origin: { left: 0, top: 0, right: 1000, bottom: 600 },
    dbPanel: { left: 20, top: 100, right: 420, bottom: 500 },
    cachePanel: { left: 570, top: 100, right: 970, bottom: 500 },
    dbRows: [{ key: '1', top: 110, bottom: 140 }],
    cacheRows: [{ key: '1', top: 200, bottom: 230 }],
    activeKeys: new Set<string>(),
    ...over,
  }
}

describe('linkLines', () => {
  it('LL1 basic line', () => {
    expect(computeLinkLines(input())).toEqual([{ key: '1', x1: 420, y1: 125, x2: 570, y2: 215, active: false }])
  })

  it('LL2 origin offset', () => {
    const [l] = computeLinkLines(input({ origin: { left: 10, top: 50, right: 1000, bottom: 600 } }))
    expect([l.x1, l.y1, l.x2, l.y2]).toEqual([410, 75, 560, 165])
  })

  it('LL3 key on one side only', () => {
    const lines = computeLinkLines(
      input({
        dbRows: [{ key: '2', top: 110, bottom: 140 }],
        cacheRows: [{ key: '1', top: 200, bottom: 230 }, { key: 'tmp-1', top: 240, bottom: 270 }],
      }),
    )
    expect(lines).toEqual([])
  })

  it('LL4 visibility', () => {
    const cacheRows = [{ key: '1', top: 200, bottom: 230 }]
    expect(computeLinkLines(input({ dbRows: [{ key: '1', top: 70, bottom: 102 }], cacheRows }))).toEqual([])
    expect(
      computeLinkLines(input({ cacheRows: [{ key: '1', top: 498, bottom: 528 }] })),
    ).toEqual([])
    expect(computeLinkLines(input({ dbRows: [{ key: '1', top: 90, bottom: 120 }], cacheRows }))).toHaveLength(1)
  })

  it('LL5 active ordering', () => {
    const rows = ['1', '4', '5'].map((key, i) => ({ key, top: 110 + i * 30, bottom: 140 + i * 30 }))
    const lines = computeLinkLines(input({ dbRows: rows, cacheRows: rows, activeKeys: new Set(['1']) }))
    expect(lines.map((l) => l.key)).toEqual(['4', '5', '1'])
    expect(lines.filter((l) => l.active).map((l) => l.key)).toEqual(['1'])
  })

  it('LL6 rounding', () => {
    const [l] = computeLinkLines(input({ dbRows: [{ key: '1', top: 110, bottom: 141 }] }))
    expect(l.y1).toBe(126)
  })

  it('LL7 linkPath', () => {
    expect(linkPath({ key: '1', x1: 420, y1: 125, x2: 570, y2: 215, active: false })).toBe(
      'M420 125 C495 125, 495 215, 570 215',
    )
  })

  it('LL8 sameLines', () => {
    const a = { key: '1', x1: 1, y1: 2, x2: 3, y2: 4, active: false }
    expect(sameLines([a], [{ ...a }])).toBe(true)
    expect(sameLines([a], [{ ...a, active: true }])).toBe(false)
    expect(sameLines([a], [])).toBe(false)
  })
})
