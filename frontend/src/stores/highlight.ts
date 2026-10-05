import { defineStore } from 'pinia'
import { ref } from 'vue'

export type HoverSide = 'db' | 'cache'

export interface Hover {
  side: HoverSide
  key: string
}

/** Flash map prefixes: 'c' = cache row, 'db' = DB row. */
export type FlashScope = 'c' | 'db'

export const FLASH_MS = 1800

/** Cross-panel hover link and transient flash tags. */
export const useHighlightStore = defineStore('highlight', () => {
  const hover = ref<Hover | null>(null)
  /** '<scope>:<key>' -> transient tag label ('' = highlight only). */
  const flash = ref<Record<string, string>>({})
  let flashGeneration = 0

  function setHover(side: HoverSide, key: string): void {
    const current = hover.value
    if (current !== null && current.side === side && current.key === key) {
      return
    }
    hover.value = { side, key }
  }

  function clearHover(): void {
    if (hover.value !== null) {
      hover.value = null
    }
  }

  /** A row on `side` is linked when the same key is hovered in the other panel. */
  function isLinked(side: HoverSide, key: string): boolean {
    const current = hover.value
    return current !== null && current.side !== side && current.key === key
  }

  /** Adds entries for FLASH_MS; an entry is removed only if it still has the same value (newer flashes survive). */
  function flashKeys(entries: Readonly<Record<string, string>>): void {
    const keys = Object.keys(entries)
    if (keys.length === 0) {
      return
    }
    flash.value = { ...flash.value, ...entries }
    const generation = flashGeneration
    setTimeout(() => {
      if (generation !== flashGeneration) {
        return
      }
      const next: Record<string, string> = { ...flash.value }
      for (const key of keys) {
        if (next[key] === entries[key]) {
          delete next[key]
        }
      }
      flash.value = next
    }, FLASH_MS)
  }

  function isFlashing(scope: FlashScope, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(flash.value, `${scope}:${key}`)
  }

  /** Transient tag label, or null when none / highlight only. */
  function flashTag(scope: FlashScope, key: string): string | null {
    const value = flash.value[`${scope}:${key}`]
    return value ? value : null
  }

  /** Drops hover and every flash; pending timers become no-ops (Reset / Clear cache). */
  function clear(): void {
    hover.value = null
    flash.value = {}
    flashGeneration += 1
  }

  return { hover, flash, setHover, clearHover, isLinked, flashKeys, isFlashing, flashTag, clear }
})
