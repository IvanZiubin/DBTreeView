<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Tree from 'primevue/tree'
import type { TreeNode } from 'primevue/treenode'
import NodeLabel from './NodeLabel.vue'
import { getNode } from '../api/client'
import type { Node } from '../api/types'
import { reportError } from '../errors'
import { useCacheStore } from '../stores/cache'
import { useDbTreeStore } from '../stores/dbTree'

const dbTree = useDbTreeStore()
const cache = useCacheStore()
const loadingIntoCache = ref(false)

onMounted(async () => {
  try {
    await dbTree.loadRoots()
  } catch (err) {
    reportError(err)
  }
})

async function onNodeExpand(node: TreeNode): Promise<void> {
  try {
    await dbTree.loadChildren(node.key)
  } catch (err) {
    reportError(err)
  }
}

/** GET /api/nodes/{id} -> cache.loadNode. No success toast: the node is selected and revealed in the cache. */
async function onLoadIntoCache(): Promise<void> {
  const id = dbTree.selectedId
  if (id === null) {
    return
  }
  const startedEpoch = cache.epoch
  loadingIntoCache.value = true
  try {
    const details = await getNode(id)
    if (startedEpoch !== cache.epoch) {
      return
    }
    cache.loadNode(details)
  } catch (err) {
    reportError(err)
  } finally {
    loadingIntoCache.value = false
  }
}

function nodeData(node: TreeNode): Node {
  return node.data as Node
}
</script>

<template>
  <section class="tree-panel" data-testid="db-tree-view">
    <header class="tree-panel__header">
      <h2 class="tree-panel__title">Database</h2>
      <Button
        label="Load into cache"
        icon="pi pi-download"
        size="small"
        :disabled="dbTree.selectedId === null || loadingIntoCache"
        :loading="loadingIntoCache"
        data-testid="load-into-cache"
        @click="onLoadIntoCache"
      />
    </header>
    <div class="tree-panel__body">
      <Tree
        v-model:selection-keys="dbTree.selectionKeys"
        v-model:expanded-keys="dbTree.expandedKeys"
        :value="dbTree.roots"
        selection-mode="single"
        :meta-key-selection="false"
        loading-mode="icon"
        :loading="dbTree.rootsLoading"
        class="tree-panel__tree"
        @node-expand="onNodeExpand"
      >
        <template #default="{ node }">
          <NodeLabel :value="nodeData(node).value" :status="nodeData(node).isDeleted ? 'deleted' : 'clean'" />
        </template>
      </Tree>
      <p v-if="!dbTree.rootsLoading && dbTree.roots.length === 0" class="tree-panel__empty">
        No nodes in the database.
      </p>
    </div>
  </section>
</template>
