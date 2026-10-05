import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, getNode } from '../api/client'
import { reparentedKeys } from '../cache/hierarchy'
import { cacheKey } from '../cache/model'
import { reportError } from '../errors'
import type { LastLoad } from '../view/transfer'
import { useCacheStore } from './cache'
import { useHighlightStore } from './highlight'

export interface PendingLoad {
  id: number
  label: string
  seq: number
}

export interface DragState {
  id: number
  label: string
}

/** A node that was new to the cache on its last load; CachedTreeView plays the fly-in once per seq. */
export interface Flight {
  key: string
  label: string
  seq: number
}

/** DB -> cache transfer: the single load path, drag state and gutter stats (DR-FE-5.7). */
export const useTransferStore = defineStore('transfer', () => {
  const pendingLoad = ref<PendingLoad | null>(null)
  const lastLoad = ref<LastLoad | null>(null)
  const drag = ref<DragState | null>(null)
  const flight = ref<Flight | null>(null)
  let loadSeq = 0

  const isLoading = computed<boolean>(() => pendingLoad.value !== null)

  /**
   * The only GET /api/nodes/{id} call (button, double-click and drop all use it). Ignored (false) while another load
   * is in flight. The response is discarded when the cache epoch changed or reset() ran meanwhile (Reset / Clear
   * cache). On success: re-parent count, fly-in flight for new nodes, cache.loadNode, lastLoad, re-parented flash.
   * On failure: lastLoad with the error status, reportError. Returns true when the node was merged into the cache.
   */
  async function loadIntoCache(id: number, label: string): Promise<boolean> {
    if (pendingLoad.value !== null) {
      return false
    }
    const cache = useCacheStore()
    const highlight = useHighlightStore()
    loadSeq += 1
    const seq = loadSeq
    const startedEpoch = cache.epoch
    pendingLoad.value = { id, label, seq }
    const startedAt = performance.now()
    const isCurrent = (): boolean =>
      startedEpoch === cache.epoch && pendingLoad.value !== null && pendingLoad.value.seq === seq
    try {
      const details = await getNode(id)
      const durationMs = Math.round(performance.now() - startedAt)
      if (!isCurrent()) {
        return false
      }
      const key = cacheKey(details.id)
      const isNewToCache = !(key in cache.nodes)
      const moved = isNewToCache ? reparentedKeys(cache.nodeList, details.id) : []
      if (isNewToCache) {
        flight.value = { key, label: details.value, seq }
      }
      cache.loadNode(details)
      lastLoad.value = {
        id: details.id,
        label: details.value,
        status: 200,
        durationMs,
        reparented: moved.length,
      }
      const flashes: Record<string, string> = {}
      for (const movedKey of moved) {
        flashes[`c:${movedKey}`] = 're-parented'
      }
      highlight.flashKeys(flashes)
      return true
    } catch (err) {
      const durationMs = Math.round(performance.now() - startedAt)
      if (isCurrent()) {
        lastLoad.value = {
          id,
          label,
          status: err instanceof ApiError ? err.status : 0,
          durationMs,
          reparented: 0,
        }
      }
      reportError(err)
      return false
    } finally {
      if (pendingLoad.value !== null && pendingLoad.value.seq === seq) {
        pendingLoad.value = null
      }
    }
  }

  function startDrag(id: number, label: string): void {
    drag.value = { id, label }
  }

  function endDrag(): void {
    drag.value = null
  }

  /** Forgets every transfer state; an in-flight load is then discarded (Reset / Clear cache). */
  function reset(): void {
    pendingLoad.value = null
    lastLoad.value = null
    drag.value = null
    flight.value = null
  }

  return { pendingLoad, lastLoad, drag, flight, isLoading, loadIntoCache, startDrag, endDrag, reset }
})
