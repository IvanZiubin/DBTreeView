<script setup lang="ts">
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import AppHeader from './components/AppHeader.vue'
import CachedTreeView from './components/CachedTreeView.vue'
import DbTreeView from './components/DbTreeView.vue'
import { installErrorToast } from './errors'

installErrorToast(useToast())
</script>

<template>
  <Toast position="top-right" />
  <ConfirmDialog />
  <AppHeader />
  <main class="app-main">
    <DbTreeView />
    <CachedTreeView />
  </main>
</template>

<style scoped>
.app-main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 1rem;
  min-height: 0;
}

@media (max-width: 900px) {
  .app-main {
    grid-template-columns: 1fr;
  }
}
</style>
