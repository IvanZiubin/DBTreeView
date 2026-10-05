<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { resetDatabase } from '../api/client'
import { reportError } from '../errors'
import { useCacheStore } from '../stores/cache'
import { useDbTreeStore } from '../stores/dbTree'

const confirm = useConfirm()
const toast = useToast()
const dbTree = useDbTreeStore()
const cache = useCacheStore()
const resetting = ref(false)

async function doReset(): Promise<void> {
  resetting.value = true
  try {
    const roots = await resetDatabase()
    dbTree.setRoots(roots)
    cache.clear()
    toast.add({
      severity: 'success',
      summary: 'Reset complete',
      detail: 'Database restored to the sample data; cache cleared.',
      life: 3000,
    })
  } catch (err) {
    reportError(err)
  } finally {
    resetting.value = false
  }
}

function onResetClick(): void {
  confirm.require({
    header: 'Reset database',
    message:
      'Restore the database to the initial sample data and clear the cache? Unapplied cache changes will be lost.',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Reset', severity: 'danger' },
    accept: () => {
      void doReset()
    },
  })
}
</script>

<template>
  <header class="app-header">
    <h1 class="app-header__title">Tree Editor</h1>
    <Button
      label="Reset"
      icon="pi pi-refresh"
      severity="danger"
      :loading="resetting"
      data-testid="reset-button"
      @click="onResetClick"
    />
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--p-content-background);
  border-bottom: 1px solid var(--p-content-border-color);
}

.app-header__title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
}
</style>
