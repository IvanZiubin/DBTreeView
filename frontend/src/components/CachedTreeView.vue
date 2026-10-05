<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, ChevronRight, Download, Eraser, Pencil, Plus, Trash } from 'lucide-vue-next'
import BlueprintCorners from './BlueprintCorners.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import StatusTags from './StatusTags.vue'
import { gapTooltip } from '../cache/hierarchy'
import { buildApplyPlan, describeApplyPlan, validateValue, type ApplyPlan } from '../cache/pending'
import { reportError } from '../errors'
import { captureRowRects, flyChip, playFlip, prefersReducedMotion } from '../motion/motion'
import { useCacheStore } from '../stores/cache'
import { useDbTreeStore } from '../stores/dbTree'
import { useHighlightStore } from '../stores/highlight'
import { useToastStore } from '../stores/toasts'
import { useTransferStore } from '../stores/transfer'
import {
  applySummary,
  buildApplyItems,
  clearCacheMessage,
  decideClearCache,
  type ApplyItem,
  type ClearCacheDecision,
} from '../view/dialogs'
import { nodeRef } from '../view/transfer'
import {
  flattenCacheTree,
  gapHint,
  guideWidth,
  idLabel,
  isStruck,
  pendingDeleteKeys,
  type CacheRow,
} from '../view/treeRows'

/** Value of a node created by Add child before the user types (mock behaviour, DR-FE-5.8). */
const NEW_NODE_VALUE = 'New node'
const CACHE_ROW_ATTR = 'data-cache-row'
const MODIFY_REJECTED = 'The node can no longer be modified (it is deleted or an apply is running).'

const cache = useCacheStore()
const dbTree = useDbTreeStore()
const highlight = useHighlightStore()
const toasts = useToastStore()
const transfer = useTransferStore()

const bodyEl = ref<HTMLElement | null>(null)
/** Row whose inline editor is open (null = none) and the editor text. */
const editingKey = ref<string | null>(null)
const draft = ref('')
/** True while a DB row is dragged over this panel. */
const dragOver = ref(false)
/** Plan shown in the Apply dialog (null = closed). */
const applyPreview = ref<ApplyPlan | null>(null)
const clearDialogOpen = ref(false)

const rows = computed<CacheRow[]>(() => flattenCacheTree(cache.treeNodes, cache.expandedKeys))
const applyItems = computed<ApplyItem[]>(() =>
  applyPreview.value === null ? [] : buildApplyItems(applyPreview.value, cache.nodes),
)
const clearDecision = computed<ClearCacheDecision>(() =>
  decideClearCache({ isEmpty: cache.isEmpty, applying: cache.applying, pendingCount: cache.pendingCount }),
)

/** Reset / Clear cache start a new epoch: close the editor and dialogs of the previous one. */
watch(
  () => cache.epoch,
  () => {
    editingKey.value = null
    applyPreview.value = null
    clearDialogOpen.value = false
  },
)

function selectRow(key: string): void {
  cache.selectedKey = key
}

function toggleRow(row: CacheRow): void {
  const next: Record<string, boolean> = { ...cache.expandedKeys }
  if (row.expanded) {
    delete next[row.key]
  } else {
    next[row.key] = true
  }
  cache.expandedKeys = next
}

/** Opens the inline editor (double-click, F2, Edit button, after Add child) for a modifiable node. */
async function startEdit(key: string): Promise<void> {
  if (editingKey.value !== null && editingKey.value !== key) {
    commitEdit()
  }
  cache.selectedKey = key
  const node = cache.nodes[key]
  if (!node || !cache.canModifySelected) {
    return
  }
  editingKey.value = key
  draft.value = node.value
  await nextTick()
  const input = bodyEl.value?.querySelector<HTMLInputElement>('[data-testid="cache-value-input"]') ?? null
  input?.focus()
  input?.select()
}

/** Enter / blur: invalid -> error toast, value kept; unchanged -> no-op; otherwise cache.editValue (pending). */
function commitEdit(): void {
  const key = editingKey.value
  if (key === null) {
    return
  }
  editingKey.value = null
  const error = validateValue(draft.value)
  if (error !== null) {
    toasts.show({ severity: 'error', summary: 'Invalid value', detail: error, lifeMs: 6000 })
    return
  }
  const node = cache.nodes[key]
  if (!node || draft.value.trim() === node.value) {
    return
  }
  if (!cache.editValue(node.id, draft.value)) {
    reportError(new Error(MODIFY_REJECTED))
  }
}

/** Escape: close the editor, keep the value. */
function cancelEdit(): void {
  editingKey.value = null
}

function onEdit(): void {
  if (cache.selectedKey !== null) {
    void startEdit(cache.selectedKey)
  }
}

async function onAddChild(): Promise<void> {
  commitEdit()
  const parent = cache.selectedNode
  if (parent === null || !cache.canModifySelected) {
    return
  }
  const key = cache.addChild(parent.id, NEW_NODE_VALUE)
  if (key === null) {
    reportError(new Error(MODIFY_REJECTED))
    return
  }
  await startEdit(key)
}

/** Pending delete with cascade; cached descendants newly marked get the "cascade" flash. */
function onDelete(): void {
  commitEdit()
  const node = cache.selectedNode
  const targetKey = cache.selectedKey
  if (node === null || targetKey === null) {
    return
  }
  const before = new Set(pendingDeleteKeys(cache.nodes))
  if (!cache.deleteNode(node.id)) {
    reportError(new Error('The node can no longer be deleted (it is deleted or an apply is running).'))
    return
  }
  const flashes: Record<string, string> = {}
  for (const key of pendingDeleteKeys(cache.nodes)) {
    if (key !== targetKey && !before.has(key)) {
      flashes[`c:${key}`] = 'cascade'
    }
  }
  highlight.flashKeys(flashes)
}

function onApplyClick(): void {
  commitEdit()
  if (!cache.hasPendingChanges || cache.applying) {
    return
  }
  applyPreview.value = buildApplyPlan(cache.nodes)
}

/** POST /api/nodes/apply via the store; success: flashes, toast, DB tree refresh. Failure keeps all pending changes. */
async function confirmApply(): Promise<void> {
  applyPreview.value = null
  let plan: ApplyPlan | null
  try {
    plan = await cache.apply()
  } catch (err) {
    reportError(err)
    return
  }
  if (plan === null) {
    return
  }
  const flashes: Record<string, string> = {}
  for (const key of plan.editedKeys) {
    flashes[`c:${key}`] = 'saved'
    flashes[`db:${key}`] = ''
  }
  for (const key of plan.addedKeys) {
    const realId = cache.lastIdMap[key]
    if (realId !== undefined) {
      flashes[`c:${realId}`] = `saved #${realId}`
      flashes[`db:${realId}`] = ''
    }
  }
  highlight.flashKeys(flashes)
  toasts.show({ severity: 'success', summary: 'Changes applied', detail: describeApplyPlan(plan) })
  try {
    await dbTree.refresh()
  } catch (err) {
    reportError(err)
  }
}

/** Clear cache (DR-FE-5.6): disabled when empty / applying; confirm only when pending changes would be lost. */
function onClearClick(): void {
  cancelEdit()
  const decision = clearDecision.value
  if (decision === 'disabled') {
    return
  }
  if (decision === 'confirm') {
    clearDialogOpen.value = true
    return
  }
  clearCache()
}

/** Client-only: no API request, the database is untouched. */
function clearCache(): void {
  clearDialogOpen.value = false
  if (cache.isEmpty || cache.applying) {
    return
  }
  editingKey.value = null
  cache.clear()
  transfer.reset()
  highlight.clear()
  toasts.show({
    severity: 'info',
    summary: 'Cache cleared',
    detail: 'The local cache is empty. The database was not changed.',
  })
}

function onDragOver(event: DragEvent): void {
  if (transfer.drag === null) {
    return
  }
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
  dragOver.value = true
}

function onDragLeave(event: DragEvent): void {
  const panel = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Element | null
  if (panel !== null && next !== null && panel.contains(next)) {
    return
  }
  dragOver.value = false
}

/** Drop of a dragged DB row: the same single load path as the button and double-click (DR-FE-5.7). */
function onDrop(event: DragEvent): void {
  const drag = transfer.drag
  if (drag === null) {
    return
  }
  event.preventDefault()
  dragOver.value = false
  transfer.endDrag()
  void transfer.loadIntoCache(drag.id, drag.label)
}

/** FLIP + fly-in (DR-FE-5.11): rects captured before every row-list change, animated after the DOM update. */
const rowSignature = computed<string>(() => rows.value.map((row) => `${row.key}/${row.depth}`).join('|'))
let flipBefore: Map<string, DOMRect> | null = null
let playedFlightSeq = 0

watch(
  rowSignature,
  () => {
    flipBefore = prefersReducedMotion() ? null : captureRowRects(bodyEl.value, CACHE_ROW_ATTR)
  },
  { flush: 'pre' },
)

watch(
  rowSignature,
  () => {
    const before = flipBefore
    flipBefore = null
    const flight = transfer.flight
    const flyKey = flight !== null && flight.seq !== playedFlightSeq ? flight.key : null
    if (flight !== null) {
      playedFlightSeq = flight.seq
    }
    if (before === null) {
      return
    }
    playFlip(bodyEl.value, CACHE_ROW_ATTR, before, flyKey)
    if (flyKey !== null && flight !== null) {
      const source = document.querySelector(`[data-db-row="${flyKey}"] [data-val]`)
      const target = bodyEl.value?.querySelector(`[${CACHE_ROW_ATTR}="${flyKey}"]`) ?? null
      if (source !== null && target !== null) {
        flyChip(source, target, flight.label)
      }
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <section
    class="panel blueprint"
    data-testid="cached-tree-view"
    aria-labelledby="cache-panel-title"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <BlueprintCorners />
    <header class="panel__header">
      <div class="panel__heading">
        <span class="card-kicker panel__kicker">CachedTreeView</span>
        <h3 id="cache-panel-title" class="panel__title">Cache</h3>
      </div>
      <div class="panel__toolbar">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!cache.canModifySelected"
          data-testid="cache-edit"
          @click="onEdit"
        >
          <Pencil :size="14" :stroke-width="1.5" />
          Edit
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!cache.canModifySelected"
          data-testid="cache-add-child"
          @click="onAddChild"
        >
          <Plus :size="14" :stroke-width="1.5" />
          Add child
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!cache.canModifySelected"
          data-testid="cache-delete"
          @click="onDelete"
        >
          <Trash :size="14" :stroke-width="1.5" />
          Delete
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="clearDecision === 'disabled'"
          data-testid="cache-clear"
          @click="onClearClick"
        >
          <Eraser :size="14" :stroke-width="1.5" />
          Clear cache
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm blueprint"
          :disabled="!cache.hasPendingChanges || cache.applying"
          data-testid="cache-apply"
          @click="onApplyClick"
        >
          <BlueprintCorners />
          <Check :size="14" :stroke-width="1.5" :class="{ pulse: cache.applying }" />
          Apply
          <span v-if="cache.pendingCount > 0" class="btn-count" data-testid="cache-apply-count">{{
            cache.pendingCount
          }}</span>
        </button>
      </div>
    </header>
    <div ref="bodyEl" class="panel__body" data-testid="cache-tree-body">
      <p v-if="cache.isEmpty" class="panel__empty" data-testid="cache-empty">
        The cache is empty. Select a node in the database tree and click “Load into cache”, double-click it, or drag
        it here.
      </p>
      <div v-else class="tree" role="tree" aria-label="Cached nodes" data-testid="cache-tree">
        <div
          v-for="row in rows"
          :key="row.key"
          class="tree-row"
          :class="{
            'is-selected': cache.selectedKey === row.key,
            'is-linked': highlight.isLinked('cache', row.key),
            'is-flash': highlight.isFlashing('c', row.key),
            'is-struck': isStruck(row.status),
          }"
          role="treeitem"
          tabindex="0"
          :aria-level="row.depth + 1"
          :aria-selected="cache.selectedKey === row.key"
          :aria-expanded="row.hasToggle ? row.expanded : undefined"
          :data-cache-row="row.key"
          :data-testid="`cache-node-${row.key}`"
          :data-status="row.status"
          @click="selectRow(row.key)"
          @dblclick="startEdit(row.key)"
          @keydown.enter.self.prevent="selectRow(row.key)"
          @keydown.space.self.prevent="selectRow(row.key)"
          @keydown.f2.self.prevent="startEdit(row.key)"
          @mouseenter="highlight.setHover('cache', row.key)"
          @mouseleave="highlight.clearHover()"
        >
          <span class="tree-row__guides" :style="{ width: guideWidth(row.depth) }"></span>
          <button
            v-if="row.hasToggle"
            type="button"
            class="tree-row__toggle"
            :aria-label="row.expanded ? 'Collapse' : 'Expand'"
            @click.stop="toggleRow(row)"
            @dblclick.stop
          >
            <ChevronRight
              class="tree-row__chevron"
              :class="{ 'is-open': row.expanded }"
              :size="14"
              :stroke-width="1.5"
            />
          </button>
          <span v-else class="tree-row__leaf" aria-hidden="true"><span class="tree-row__leaf-dot"></span></span>
          <input
            v-if="editingKey === row.key"
            v-model="draft"
            type="text"
            class="input tree-row__input"
            data-testid="cache-value-input"
            :aria-label="`New value for ${idLabel(row.node)}`"
            @click.stop
            @dblclick.stop
            @keydown.enter.prevent="commitEdit"
            @keydown.esc.prevent="cancelEdit"
            @blur="commitEdit"
          />
          <span
            v-else
            class="tree-row__value"
            data-val
            data-testid="node-label"
            :data-status="row.status"
          >{{ row.node.value }}</span>
          <StatusTags :status="row.status" :flash="highlight.flashTag('c', row.key)" />
          <span class="tree-row__spacer"></span>
          <span
            v-if="row.missingAncestorIds.length > 0"
            class="tree-row__hint"
            :title="gapTooltip(row.missingAncestorIds)"
            :aria-label="gapTooltip(row.missingAncestorIds)"
            :data-gap-depth="row.missingAncestorIds.length"
            data-testid="cache-gap-marker"
          >{{ gapHint(row) }}</span>
          <span class="tree-row__id">{{ idLabel(row.node) }}</span>
        </div>
      </div>
    </div>
    <div v-if="dragOver" class="drop-zone" data-testid="cache-drop-zone">
      <Download class="drop-zone__icon" :size="22" :stroke-width="1.5" />
      <span class="drop-zone__title">Drop to load</span>
      <span class="drop-zone__label">{{
        transfer.drag === null ? '' : nodeRef(transfer.drag.id, transfer.drag.label)
      }}</span>
    </div>
    <ConfirmDialog
      :open="applyPreview !== null"
      title="Apply changes"
      confirm-label="Apply"
      wide
      testid="apply-dialog"
      @confirm="confirmApply"
      @cancel="applyPreview = null"
    >
      <div class="dialog-body" data-testid="apply-dialog-summary">
        {{ applyPreview === null ? '' : applySummary(applyPreview) }}
      </div>
      <ul class="apply-list">
        <li
          v-for="(item, index) in applyItems"
          :key="index"
          class="apply-list__item"
          data-testid="apply-dialog-item"
          :data-kind="item.kind"
        >
          <span :class="item.tagClass">{{ item.tag }}</span>
          <span>{{ item.text }}</span>
        </li>
      </ul>
      <p v-if="applyPreview !== null && applyPreview.request.deletes.length > 0" class="apply-note">
        Deleting also deletes all descendants in the database, including ones that were never loaded.
      </p>
    </ConfirmDialog>
    <ConfirmDialog
      :open="clearDialogOpen"
      title="Clear cache?"
      confirm-label="Clear cache"
      testid="clear-cache-dialog"
      @confirm="clearCache"
      @cancel="clearDialogOpen = false"
    >
      <div class="dialog-body" data-testid="clear-cache-message">{{ clearCacheMessage(cache.pendingCount) }}</div>
    </ConfirmDialog>
  </section>
</template>
