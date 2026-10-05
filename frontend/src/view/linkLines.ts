// Pure geometry for the SVG link lines between a DB row and its cached copy (no Vue/Pinia imports).

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface RowBox {
  key: string
  top: number
  bottom: number
}

export interface LinkLineInput {
  /** Workspace rect; every output coordinate is relative to its top-left corner. */
  origin: Box
  /** DB tree scroll body rect. */
  dbPanel: Box
  /** Cache tree scroll body rect. */
  cachePanel: Box
  dbRows: readonly RowBox[]
  cacheRows: readonly RowBox[]
  /** Hovered / selected keys (either side). */
  activeKeys: ReadonlySet<string>
}

export interface LinkLine {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  active: boolean
}

export const VISIBILITY_MARGIN_PX = 2

export function isRowVisible(row: RowBox, panel: Box): boolean {
  return row.bottom > panel.top + VISIBILITY_MARGIN_PX && row.top < panel.bottom - VISIBILITY_MARGIN_PX
}

/**
 * One line per key that is visible in both scroll bodies: from the DB body's right edge at the DB row centre to the
 * cache body's left edge at the cache row centre (y rounded). Inactive lines first, active lines last (drawn on top),
 * each group in cache-row order.
 */
export function computeLinkLines(input: LinkLineInput): LinkLine[] {
  const { origin, dbPanel, cachePanel } = input
  const dbCentres = new Map<string, number>()
  for (const row of input.dbRows) {
    if (isRowVisible(row, dbPanel)) {
      dbCentres.set(row.key, (row.top + row.bottom) / 2 - origin.top)
    }
  }
  const x1 = dbPanel.right - origin.left
  const x2 = cachePanel.left - origin.left
  const inactive: LinkLine[] = []
  const active: LinkLine[] = []
  for (const row of input.cacheRows) {
    const dbCentre = dbCentres.get(row.key)
    if (dbCentre === undefined || !isRowVisible(row, cachePanel)) {
      continue
    }
    const line: LinkLine = {
      key: row.key,
      x1,
      y1: Math.round(dbCentre),
      x2,
      y2: Math.round((row.top + row.bottom) / 2 - origin.top),
      active: input.activeKeys.has(row.key),
    }
    if (line.active) {
      active.push(line)
    } else {
      inactive.push(line)
    }
  }
  return inactive.concat(active)
}

/** Cubic bezier from the mock: control points at half the horizontal distance. */
export function linkPath(line: LinkLine): string {
  const half = (line.x2 - line.x1) * 0.5
  return `M${line.x1} ${line.y1} C${line.x1 + half} ${line.y1}, ${line.x2 - half} ${line.y2}, ${line.x2} ${line.y2}`
}

export function sameLines(a: readonly LinkLine[], b: readonly LinkLine[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((line, index) => {
    const other = b[index]
    return (
      line.key === other.key &&
      line.x1 === other.x1 &&
      line.y1 === other.y1 &&
      line.x2 === other.x2 &&
      line.y2 === other.y2 &&
      line.active === other.active
    )
  })
}
