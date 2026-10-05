// Pure texts for the transfer gutter (no Vue/Pinia imports).

/** Outcome of the last GET /api/nodes/{id} issued by useTransferStore().loadIntoCache. */
export interface LastLoad {
  id: number
  label: string
  /** HTTP status; 0 = network failure. */
  status: number
  durationMs: number
  /** Cached rows that moved under the loaded node (0 for reloads and failures). */
  reparented: number
}

/** "#4 Computers" */
export function nodeRef(id: number, label: string): string {
  return `#${id} ${label}`
}

export function loadPath(id: number): string {
  return `GET /api/nodes/${id}`
}

/** "200 · 14 ms", "200 · 14 ms · 2 re-parented", "404 · 9 ms", "network error · 3 ms". */
export function lastLoadStatusText(last: LastLoad): string {
  const status = last.status === 0 ? 'network error' : String(last.status)
  const reparented = last.reparented > 0 ? ` · ${last.reparented} re-parented` : ''
  return `${status} · ${last.durationMs} ms${reparented}`
}
