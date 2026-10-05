<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useCacheStore } from '../stores/cache'
import { useDbTreeStore } from '../stores/dbTree'
import { useHighlightStore } from '../stores/highlight'
import { useTransferStore } from '../stores/transfer'
import { computeLinkLines, linkPath, sameLines, type Box, type LinkLine, type RowBox } from '../view/linkLines'

/** Second measure after FLIP (460 ms) and fly-in (720 ms) animations have settled (DR-FE-5.10). */
const SETTLE_MS = 760
/** Side of the square drawn at each line end. */
const END_SIZE = 5

const props = defineProps<{
  /** The workspace element (main.workspace); lines are positioned relative to it. */
  container: HTMLElement | null
}>()

const cache = useCacheStore()
const dbTree = useDbTreeStore()
const highlight = useHighlightStore()
const transfer = useTransferStore()

const lines = ref<LinkLine[]>([])

function toBox(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

function rowBoxes(body: HTMLElement, attr: string): RowBox[] {
  const boxes: RowBox[] = []
  for (const element of Array.from(body.querySelectorAll<HTMLElement>(`[${attr}]`))) {
    const key = element.getAttribute(attr)
    if (key !== null) {
      const rect = element.getBoundingClientRect()
      boxes.push({ key, top: rect.top, bottom: rect.bottom })
    }
  }
  return boxes
}

function activeKeys(): Set<string> {
  const keys = new Set<string>()
  if (highlight.hover !== null) {
    keys.add(highlight.hover.key)
  }
  if (dbTree.selectedId !== null) {
    keys.add(String(dbTree.selectedId))
  }
  if (cache.selectedKey !== null) {
    keys.add(cache.selectedKey)
  }
  return keys
}

function measure(): void {
  const workspace = props.container
  const dbBody = workspace?.querySelector<HTMLElement>('[data-testid="db-tree-body"]') ?? null
  const cacheBody = workspace?.querySelector<HTMLElement>('[data-testid="cache-tree-body"]') ?? null
  if (!workspace || dbBody === null || cacheBody === null) {
    if (lines.value.length > 0) {
      lines.value = []
    }
    return
  }
  const next = computeLinkLines({
    origin: toBox(workspace.getBoundingClientRect()),
    dbPanel: toBox(dbBody.getBoundingClientRect()),
    cachePanel: toBox(cacheBody.getBoundingClientRect()),
    dbRows: rowBoxes(dbBody, 'data-db-row'),
    cacheRows: rowBoxes(cacheBody, 'data-cache-row'),
    activeKeys: activeKeys(),
  })
  if (!sameLines(lines.value, next)) {
    lines.value = next
  }
}

let frame = 0
let settleTimer: ReturnType<typeof setTimeout> | null = null

/** Measure on the next frame and once more after animations settle. */
function scheduleMeasure(): void {
  if (frame === 0) {
    frame = requestAnimationFrame(() => {
      frame = 0
      measure()
    })
  }
  if (settleTimer !== null) {
    clearTimeout(settleTimer)
  }
  settleTimer = setTimeout(() => {
    settleTimer = null
    measure()
  }, SETTLE_MS)
}

watch(
  () => props.container,
  (element, _previous, onCleanup) => {
    if (element === null) {
      return
    }
    element.addEventListener('scroll', scheduleMeasure, true)
    window.addEventListener('resize', scheduleMeasure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleMeasure())
    observer?.observe(element)
    scheduleMeasure()
    onCleanup(() => {
      element.removeEventListener('scroll', scheduleMeasure, true)
      window.removeEventListener('resize', scheduleMeasure)
      observer?.disconnect()
    })
  },
  { immediate: true },
)

watch(
  () => [
    dbTree.roots,
    dbTree.expandedKeys,
    dbTree.selectionKeys,
    cache.treeNodes,
    cache.expandedKeys,
    cache.selectedKey,
    highlight.hover,
    transfer.pendingLoad,
    transfer.lastLoad,
  ],
  () => {
    scheduleMeasure()
  },
  { deep: true, flush: 'post' },
)

onBeforeUnmount(() => {
  if (frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }
  if (settleTimer !== null) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
})
</script>

<template>
  <svg class="link-lines" data-testid="link-lines" aria-hidden="true">
    <g
      v-for="line in lines"
      :key="line.key"
      class="link-line"
      :class="{ 'is-active': line.active }"
      :data-testid="`link-line-${line.key}`"
    >
      <path class="link-line__path" :d="linkPath(line)" />
      <rect
        class="link-line__end"
        :x="line.x1 - END_SIZE / 2"
        :y="line.y1 - END_SIZE / 2"
        :width="END_SIZE"
        :height="END_SIZE"
      />
      <rect
        class="link-line__end"
        :x="line.x2 - END_SIZE / 2"
        :y="line.y2 - END_SIZE / 2"
        :width="END_SIZE"
        :height="END_SIZE"
      />
    </g>
  </svg>
</template>
