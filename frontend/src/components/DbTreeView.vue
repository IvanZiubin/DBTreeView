<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ChevronRight, Download, LoaderCircle } from 'lucide-vue-next'
import BlueprintCorners from './BlueprintCorners.vue'
import StatusTags from './StatusTags.vue'
import { reportError } from '../errors'
import { useCacheStore } from '../stores/cache'
import { useDbTreeStore } from '../stores/dbTree'
import { useHighlightStore } from '../stores/highlight'
import { useTransferStore } from '../stores/transfer'
import { flattenDbTree, guideWidth, type DbRow } from '../view/treeRows'

const dbTree = useDbTreeStore()
const cache = useCacheStore()
const highlight = useHighlightStore()
const transfer = useTransferStore()

const rows = computed<DbRow[]>(() => flattenDbTree(dbTree.roots, dbTree.expandedKeys))
const selectedKey = computed<string | null>(() => (dbTree.selectedId === null ? null : String(dbTree.selectedId)))
const loadDisabled = computed<boolean>(() => dbTree.selectedNode === null || transfer.pendingLoad !== null)

onMounted(async () => {
  try {
    await dbTree.loadRoots()
  } catch (err) {
    reportError(err)
  }
})

function selectRow(key: string): void {
  dbTree.selectionKeys = { [key]: true }
}

/** Chevron: collapse, or expand and lazily fetch one level (GET /api/nodes/{id}/children, once per node). */
async function toggleRow(row: DbRow): Promise<void> {
  if (row.expanded) {
    const next: Record<string, boolean> = { ...dbTree.expandedKeys }
    delete next[row.key]
    dbTree.expandedKeys = next
    return
  }
  dbTree.expandedKeys = { ...dbTree.expandedKeys, [row.key]: true }
  try {
    await dbTree.loadChildren(row.key)
  } catch (err) {
    reportError(err)
  }
}

/** Button, double-click and drop all use transfer.loadIntoCache, the single GET /api/nodes/{id} path. */
function onLoadSelected(): void {
  const node = dbTree.selectedNode
  if (node === null) {
    return
  }
  void transfer.loadIntoCache(node.id, node.value)
}

function onRowDoubleClick(row: DbRow): void {
  selectRow(row.key)
  void transfer.loadIntoCache(row.node.data.id, row.node.data.value)
}

function onDragStart(event: DragEvent, row: DbRow): void {
  selectRow(row.key)
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', row.key)
    event.dataTransfer.effectAllowed = 'copy'
  }
  transfer.startDrag(row.node.data.id, row.node.data.value)
}

function onDragEnd(): void {
  transfer.endDrag()
}

function isCached(key: string): boolean {
  return key in cache.nodes
}
</script>

<template>
  <section class="panel blueprint" data-testid="db-tree-view" aria-labelledby="db-panel-title">
    <BlueprintCorners />
    <header class="panel__header">
      <div class="panel__heading">
        <span class="card-kicker panel__kicker">DBTreeView</span>
        <h3 id="db-panel-title" class="panel__title">Database</h3>
      </div>
      <button
        type="button"
        class="btn btn-primary btn-sm blueprint"
        :disabled="loadDisabled"
        data-testid="load-into-cache"
        @click="onLoadSelected"
      >
        <BlueprintCorners />
        <LoaderCircle v-if="transfer.pendingLoad !== null" class="spin" :size="14" :stroke-width="1.5" />
        <Download v-else :size="14" :stroke-width="1.5" />
        Load into cache
      </button>
    </header>
    <div class="panel__body" data-testid="db-tree-body">
      <div v-if="dbTree.rootsLoading && rows.length === 0" class="panel__loading" data-testid="db-roots-loading">
        <LoaderCircle class="spin" :size="14" :stroke-width="1.5" />
        Loading roots
        <span class="mono-hint">GET /api/nodes/roots</span>
      </div>
      <div v-if="rows.length > 0" class="tree" role="tree" aria-label="Database tree" data-testid="db-tree">
        <div
          v-for="row in rows"
          :key="row.key"
          class="tree-row"
          :class="{
            'is-selected': selectedKey === row.key,
            'is-linked': highlight.isLinked('db', row.key),
            'is-flash': highlight.isFlashing('db', row.key),
            'is-struck': row.node.data.isDeleted,
          }"
          role="treeitem"
          tabindex="0"
          draggable="true"
          :aria-level="row.depth + 1"
          :aria-selected="selectedKey === row.key"
          :aria-expanded="row.hasToggle ? row.expanded : undefined"
          :data-db-row="row.key"
          :data-testid="`db-node-${row.key}`"
          @click="selectRow(row.key)"
          @dblclick="onRowDoubleClick(row)"
          @keydown.enter.self.prevent="selectRow(row.key)"
          @keydown.space.self.prevent="selectRow(row.key)"
          @mouseenter="highlight.setHover('db', row.key)"
          @mouseleave="highlight.clearHover()"
          @dragstart="onDragStart($event, row)"
          @dragend="onDragEnd"
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
            <LoaderCircle v-if="row.loading" class="tree-row__spinner spin" :size="13" :stroke-width="1.5" />
            <ChevronRight
              v-else
              class="tree-row__chevron"
              :class="{ 'is-open': row.expanded }"
              :size="14"
              :stroke-width="1.5"
            />
          </button>
          <span v-else class="tree-row__leaf" aria-hidden="true"><span class="tree-row__leaf-dot"></span></span>
          <span
            class="tree-row__value"
            data-val
            data-testid="node-label"
            :data-status="row.node.data.isDeleted ? 'deleted' : 'clean'"
          >{{ row.node.data.value }}</span>
          <StatusTags :status="row.node.data.isDeleted ? 'deleted' : 'clean'" :flash="null" />
          <span class="tree-row__spacer"></span>
          <span class="tree-row__id">#{{ row.node.data.id }}</span>
          <span
            v-if="isCached(row.key)"
            class="tree-row__cached"
            title="In cache"
            data-testid="db-cached-marker"
          ></span>
        </div>
      </div>
      <p v-if="!dbTree.rootsLoading && dbTree.roots.length === 0" class="panel__empty">No nodes in the database.</p>
    </div>
  </section>
</template>
