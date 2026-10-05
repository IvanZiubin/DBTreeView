<script setup lang="ts">
import Button from 'primevue/button'
import Tree from 'primevue/tree'
import type { TreeNode } from 'primevue/treenode'
import NodeLabel from './NodeLabel.vue'
import { useCacheStore, type CachedNode } from '../stores/cache'

const cache = useCacheStore()

function cachedData(node: TreeNode): CachedNode {
  return node.data as CachedNode
}
</script>

<template>
  <section class="tree-panel" data-testid="cached-tree-view">
    <header class="tree-panel__header">
      <h2 class="tree-panel__title">Cache</h2>
      <!-- TODO stage 3/4: enable actions based on the selected cached node and pending changes. -->
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
      <Tree v-else :value="cache.treeNodes" selection-mode="single" class="tree-panel__tree">
        <template #default="{ node }">
          <NodeLabel
            :value="cachedData(node).value"
            :deleted="cachedData(node).isDeleted || cachedData(node).isPendingDelete"
          />
        </template>
      </Tree>
    </div>
  </section>
</template>
