<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import BlueprintCorners from './BlueprintCorners.vue'
import { useTransferStore } from '../stores/transfer'
import { lastLoadStatusText, loadPath, nodeRef } from '../view/transfer'

const transfer = useTransferStore()
</script>

<template>
  <aside class="gutter" data-testid="transfer-gutter" aria-live="polite">
    <div class="gutter__stack">
      <div v-if="transfer.drag !== null" class="blueprint gutter-card" data-testid="drag-card">
        <BlueprintCorners />
        <span class="card-kicker panel__kicker">Dragging</span>
        <span class="gutter-card__label">{{ nodeRef(transfer.drag.id, transfer.drag.label) }}</span>
        <ArrowRight class="gutter-card__arrow" :size="26" :stroke-width="1.5" />
        <span class="gutter-card__meta">Drop on Cache</span>
      </div>
      <div
        v-else-if="transfer.pendingLoad !== null"
        class="blueprint gutter-card"
        data-testid="transfer-card"
        data-state="loading"
      >
        <BlueprintCorners />
        <span class="card-kicker panel__kicker">Loading</span>
        <span class="gutter-card__label">{{ nodeRef(transfer.pendingLoad.id, transfer.pendingLoad.label) }}</span>
        <span class="gutter-card__mono">{{ loadPath(transfer.pendingLoad.id) }}</span>
        <span class="gutter-card__status">pending…</span>
      </div>
      <div
        v-else-if="transfer.lastLoad !== null"
        class="blueprint gutter-card"
        data-testid="transfer-card"
        data-state="last"
      >
        <BlueprintCorners />
        <span class="card-kicker panel__kicker">Last load</span>
        <span class="gutter-card__label">{{ nodeRef(transfer.lastLoad.id, transfer.lastLoad.label) }}</span>
        <span class="gutter-card__mono">{{ loadPath(transfer.lastLoad.id) }}</span>
        <span class="gutter-card__status">{{ lastLoadStatusText(transfer.lastLoad) }}</span>
      </div>
      <p v-else class="gutter__hint" data-testid="transfer-hint">
        Select a node and load it, double-click it, or drag it across to the cache.
      </p>
    </div>
  </aside>
</template>
