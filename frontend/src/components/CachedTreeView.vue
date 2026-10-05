<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import Tree from 'primevue/tree'
import type { TreeNode } from 'primevue/treenode'
import NodeLabel from './NodeLabel.vue'
import { gapTooltip } from '../cache/hierarchy'
import type { CacheTreeNodeData } from '../cache/model'
import { useCacheStore } from '../stores/cache'

const cache = useCacheStore()

/** Bridges PrimeVue single-selection keys to cache.selectedKey. */
const selectionKeys = computed<Record<string, boolean>>({
  get: () => (cache.selectedKey === null ? {} : { [cache.selectedKey]: true }),
  set: (keys) => {
    const key = Object.keys(keys).find((k) => keys[k])
    cache.selectedKey = key ?? null
  },
})

function rowData(node: TreeNode): CacheTreeNodeData {
  return node.data as CacheTreeNodeData
}
</script>

<template>
  <section class="tree-panel" data-testid="cached-tree-view">
    <header class="tree-panel__header">
      <h2 class="tree-panel__title">Cache</h2>
      <!-- TODO stage 4: enable actions for the selected non-deleted node and Apply when there are pending changes. -->
      <div class="tree-panel__toolbar">
        <Button label="Edit" icon="pi pi-pencil" size="small" severity="secondary" disabled data-testid="cache-edit" />
        <Button label="Add child" icon="pi pi-plus" size="small" severity="secondary" disabled data-testid="cache-add-child" />
        <Button label="Delete" icon="pi pi-trash" size="small" severity="danger" disabled data-testid="cache-delete" />
        <Button label="Apply" icon="pi pi-check" size="small" severity="success" disabled data-testid="cache-apply" />
      </div>
    </header>
    <div class="tree-panel__body">
      <p v-if="cache.isEmpty" class="tree-panel__empty" data-testid="cache-empty">
        The cache is empty. Select a node in the database tree and click “Load into cache”.
      </p>
      <Tree
        v-else
        v-model:selection-keys="selectionKeys"
        v-model:expanded-keys="cache.expandedKeys"
        :value="cache.treeNodes"
        selection-mode="single"
        :meta-key-selection="false"
        class="tree-panel__tree"
        data-testid="cache-tree"
      >
        <template #default="{ node }">
          <span class="cache-row" :data-testid="`cache-node-${node.key}`">
            <span
              v-if="rowData(node).missingAncestorIds.length > 0"
              class="cache-row__gap"
              :title="gapTooltip(rowData(node).missingAncestorIds)"
              :aria-label="gapTooltip(rowData(node).missingAncestorIds)"
              :data-gap-depth="rowData(node).missingAncestorIds.length"
              data-testid="cache-gap-marker"
            >…</span>
            <NodeLabel
              :value="rowData(node).node.value"
              :deleted="rowData(node).node.isDeleted || rowData(node).node.isPendingDelete"
            />
          </span>
        </template>
      </Tree>
    </div>
  </section>
</template>

<style scoped>
.cache-row {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.cache-row__gap {
  padding: 0 0.3rem;
  border: 1px dashed var(--p-content-border-color);
  border-radius: 4px;
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
  line-height: 1.3;
  cursor: help;
}
</style>
