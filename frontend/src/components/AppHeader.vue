<script setup lang="ts">
import { ref } from 'vue'
import { Database, RefreshCw } from 'lucide-vue-next'
import ConfirmDialog from './ConfirmDialog.vue'
import { resetDatabase } from '../api/client'
import { reportError } from '../errors'
import { useCacheStore } from '../stores/cache'
import { useDbTreeStore } from '../stores/dbTree'
import { useHighlightStore } from '../stores/highlight'
import { useToastStore } from '../stores/toasts'
import { useTransferStore } from '../stores/transfer'

const dbTree = useDbTreeStore()
const cache = useCacheStore()
const highlight = useHighlightStore()
const toasts = useToastStore()
const transfer = useTransferStore()

const confirmOpen = ref(false)
const resetting = ref(false)

/** POST /api/reset, then fresh DB roots and an empty cache (incl. pending changes and temp ids). */
async function doReset(): Promise<void> {
  confirmOpen.value = false
  resetting.value = true
  try {
    const roots = await resetDatabase()
    dbTree.setRoots(roots)
    cache.clear()
    transfer.reset()
    highlight.clear()
    toasts.show({
      severity: 'success',
      summary: 'Reset complete',
      detail: 'Database restored to the sample data; cache cleared.',
    })
  } catch (err) {
    reportError(err)
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <header class="nav app-header">
    <div class="nav-brand app-header__brand">
      <Database class="app-header__logo" :size="18" :stroke-width="1.5" />
      Tree Editor
    </div>
    <button
      type="button"
      class="btn btn-secondary btn-sm"
      :disabled="resetting"
      data-testid="reset-button"
      @click="confirmOpen = true"
    >
      <RefreshCw :size="14" :stroke-width="1.5" :class="{ spin: resetting }" />
      Reset
    </button>
    <ConfirmDialog
      :open="confirmOpen"
      title="Reset database"
      confirm-label="Reset"
      testid="reset-dialog"
      @confirm="doReset"
      @cancel="confirmOpen = false"
    >
      <div class="dialog-body">
        Restore the database to the initial sample data and clear the cache? Unapplied cache changes will be lost.
      </div>
    </ConfirmDialog>
  </header>
</template>
