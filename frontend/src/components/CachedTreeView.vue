<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Tree from 'primevue/tree'
import type { TreeNode } from 'primevue/treenode'
import { useToast } from 'primevue/usetoast'
import NodeLabel from './NodeLabel.vue'
import NodeValueDialog from './NodeValueDialog.vue'
import { gapTooltip } from '../cache/hierarchy'
import type { CacheId, CacheTreeNodeData } from '../cache/model'
import { describeApplyPlan, nodeStatus } from '../cache/pending'
import { reportError } from '../errors'
import { useCacheStore } from '../stores/cache'
import { useDbTreeStore } from '../stores/dbTree'

const cache = useCacheStore()
const dbTree = useDbTreeStore()
const toast = useToast()

/** Bridges PrimeVue single-selection keys to cache.selectedKey. */
const selectionKeys = computed<Record<string, boolean>>({
  get: () => (cache.selectedKey === null ? {} : { [cache.selectedKey]: true }),
  set: (keys) => {
    const key = Object.keys(keys).find((k) => keys[k])
    cache.selectedKey = key ?? null
  },
})

type DialogMode = 'edit' | 'add'

/** Open dialog mode (null = closed) and the node it targets, captured when the dialog opens. */
const dialogMode = ref<DialogMode | null>(null)
const dialogTargetId = ref<CacheId | null>(null)
const dialogInitialValue = ref('')

const dialogVisible = computed<boolean>({
  get: () => dialogMode.value !== null,
  set: (visible) => {
    if (!visible) {
      dialogMode.value = null
      dialogTargetId.value = null
    }
  },
})

const dialogHeader = computed<string>(() => (dialogMode.value === 'add' ? 'Add child' : 'Edit value'))
const dialogConfirmLabel = computed<string>(() => (dialogMode.value === 'add' ? 'Add' : 'Save'))

const applyBadge = computed<string | undefined>(() =>
  cache.pendingCount > 0 ? String(cache.pendingCount) : undefined,
)

function rowData(node: TreeNode): CacheTreeNodeData {
  return node.data as CacheTreeNodeData
}

function openEdit(): void {
  const node = cache.selectedNode
  if (node === null || !cache.canModifySelected) {
    return
  }
  dialogTargetId.value = node.id
  dialogInitialValue.value = node.value
  dialogMode.value = 'edit'
}

function openAddChild(): void {
  const node = cache.selectedNode
  if (node === null || !cache.canModifySelected) {
    return
  }
  dialogTargetId.value = node.id
  dialogInitialValue.value = ''
  dialogMode.value = 'add'
}

function onDialogConfirm(value: string): void {
  const id = dialogTargetId.value
  const mode = dialogMode.value
  if (id === null || mode === null) {
    return
  }
  const done = mode === 'edit' ? cache.editValue(id, value) : cache.addChild(id, value) !== null
  if (!done) {
    reportError(new Error('The node can no longer be modified (it is deleted or an apply is running).'))
  }
}

function onDelete(): void {
  const node = cache.selectedNode
  if (node === null) {
    return
  }
  if (!cache.deleteNode(node.id)) {
    reportError(new Error('The node can no longer be deleted (it is deleted or an apply is running).'))
  }
}

/** POST /api/nodes/apply via the store; on success: toast + DB tree refresh. Failures keep all pending changes. */
async function onApply(): Promise<void> {
  try {
    const plan = await cache.apply()
    if (plan === null) {
      return
    }
    toast.add({ severity: 'success', summary: 'Changes applied', detail: describeApplyPlan(plan), life: 3000 })
  } catch (err) {
    reportError(err)
    return
  }
  try {
    await dbTree.refresh()
  } catch (err) {
    reportError(err)
  }
}
</script>

<template>
  <section class="tree-panel" data-testid="cached-tree-view">
    <header class="tree-panel__header">
      <h2 class="tree-panel__title">Cache</h2>
      <div class="tree-panel__toolbar">
        <Button
          label="Edit"
          icon="pi pi-pencil"
          size="small"
          severity="secondary"
          :disabled="!cache.canModifySelected"
          data-testid="cache-edit"
          @click="openEdit"
        />
        <Button
          label="Add child"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          :disabled="!cache.canModifySelected"
          data-testid="cache-add-child"
          @click="openAddChild"
        />
        <Button
          label="Delete"
          icon="pi pi-trash"
          size="small"
          severity="danger"
          :disabled="!cache.canModifySelected"
          data-testid="cache-delete"
          @click="onDelete"
        />
        <Button
          label="Apply"
          icon="pi pi-check"
          size="small"
          severity="success"
          :badge="applyBadge"
          badge-severity="contrast"
          :disabled="!cache.hasPendingChanges || cache.applying"
          :loading="cache.applying"
          data-testid="cache-apply"
          @click="onApply"
        />
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
          <span
            class="cache-row"
            :data-testid="`cache-node-${node.key}`"
            :data-status="nodeStatus(rowData(node).node)"
          >
            <span
              v-if="rowData(node).missingAncestorIds.length > 0"
              class="cache-row__gap"
              :title="gapTooltip(rowData(node).missingAncestorIds)"
              :aria-label="gapTooltip(rowData(node).missingAncestorIds)"
              :data-gap-depth="rowData(node).missingAncestorIds.length"
              data-testid="cache-gap-marker"
            >…</span>
            <NodeLabel :value="rowData(node).node.value" :status="nodeStatus(rowData(node).node)" />
          </span>
        </template>
      </Tree>
    </div>
    <NodeValueDialog
      v-model:visible="dialogVisible"
      :header="dialogHeader"
      :confirm-label="dialogConfirmLabel"
      :initial-value="dialogInitialValue"
      @confirm="onDialogConfirm"
    />
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
