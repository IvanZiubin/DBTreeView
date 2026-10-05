// Pure network-log model (no Vue/Pinia imports). Entries are newest first.

export interface NetworkLogEntry {
  id: number
  /** Start time "HH:MM:SS" (local). */
  time: string
  method: string
  /** Full path incl. /api, e.g. "/api/nodes/4". */
  path: string
  /** HTTP status; 0 = network failure; null while pending. */
  status: number | null
  /** null while pending. */
  durationMs: number | null
}

export const MAX_LOG_ENTRIES = 80

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatClockTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

/** New array with `entry` first, capped at `max` (oldest dropped). */
export function addEntry(
  entries: readonly NetworkLogEntry[],
  entry: NetworkLogEntry,
  max: number = MAX_LOG_ENTRIES,
): NetworkLogEntry[] {
  return [entry, ...entries].slice(0, max)
}

/** New array where the entry with `id` gets status and duration; other entries unchanged. */
export function completeEntry(
  entries: readonly NetworkLogEntry[],
  id: number,
  status: number,
  durationMs: number,
): NetworkLogEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, status, durationMs } : entry))
}

export function statusLabel(entry: NetworkLogEntry): string {
  if (entry.status === null) {
    return 'pending'
  }
  if (entry.status === 0) {
    return 'failed'
  }
  return String(entry.status)
}

/** Industry tag classes: pending neutral, 2xx accent, everything else (4xx/5xx/network) outline. */
export function statusTagClass(entry: NetworkLogEntry): string {
  if (entry.status === null) {
    return 'tag tag-neutral'
  }
  if (entry.status >= 200 && entry.status < 300) {
    return 'tag tag-accent'
  }
  return 'tag tag-outline'
}

export function durationLabel(entry: NetworkLogEntry): string {
  return entry.durationMs === null ? '…' : `${entry.durationMs} ms`
}

/** Footer summary, e.g. "GET /api/nodes/4 → 200 · 12 ms" or "GET /api/nodes/4 → …" while pending. */
export function entrySummary(entry: NetworkLogEntry): string {
  const status = entry.status === null ? '…' : statusLabel(entry)
  const duration = entry.durationMs === null ? '' : ` · ${entry.durationMs} ms`
  return `${entry.method} ${entry.path} → ${status}${duration}`
}

export function requestCountLabel(count: number): string {
  return `${count} request${count === 1 ? '' : 's'}`
}
