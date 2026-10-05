import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { addEntry, completeEntry, formatClockTime, type NetworkLogEntry } from '../api/networkLog'

/** Every API request issued by the UI (fed by the RequestObserver registered in main.ts, DR-FE-5.5). */
export const useNetworkLogStore = defineStore('networkLog', () => {
  /** Newest first, at most MAX_LOG_ENTRIES. Never cleared (Reset / Clear cache keep the history). */
  const entries = ref<NetworkLogEntry[]>([])
  /** Footer table expanded. */
  const open = ref(false)
  let nextId = 1

  const hasPending = computed<boolean>(() => entries.value.some((entry) => entry.status === null))
  const last = computed<NetworkLogEntry | null>(() => (entries.value.length > 0 ? entries.value[0] : null))

  function start(method: string, path: string, now: Date = new Date()): number {
    const id = nextId
    nextId += 1
    entries.value = addEntry(entries.value, {
      id,
      time: formatClockTime(now),
      method,
      path,
      status: null,
      durationMs: null,
    })
    return id
  }

  function finish(id: number, status: number, durationMs: number): void {
    entries.value = completeEntry(entries.value, id, status, durationMs)
  }

  function toggle(): void {
    open.value = !open.value
  }

  return { entries, open, hasPending, last, start, finish, toggle }
})
