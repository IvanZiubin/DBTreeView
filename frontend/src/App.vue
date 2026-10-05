<script setup lang="ts">
import { ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import CachedTreeView from './components/CachedTreeView.vue'
import DbTreeView from './components/DbTreeView.vue'
import LinkLines from './components/LinkLines.vue'
import NetworkLog from './components/NetworkLog.vue'
import ToastStack from './components/ToastStack.vue'
import TransferGutter from './components/TransferGutter.vue'
import { installErrorToast } from './errors'
import { useToastStore } from './stores/toasts'

const toasts = useToastStore()
installErrorToast((toast) => {
  toasts.show(toast)
})

/** The workspace grid; LinkLines measures rows relative to it. */
const workspaceEl = ref<HTMLElement | null>(null)
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main ref="workspaceEl" class="workspace" data-testid="workspace">
      <DbTreeView />
      <TransferGutter />
      <CachedTreeView />
      <LinkLines :container="workspaceEl" />
    </main>
    <NetworkLog />
    <ToastStack />
  </div>
</template>
