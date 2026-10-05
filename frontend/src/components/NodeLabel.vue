<script setup lang="ts">
import Tag from 'primevue/tag'

defineProps<{
  value: string
  deleted: boolean
}>()
</script>

<template>
  <span class="node-label" :class="{ 'node-label--deleted': deleted }" data-testid="node-label">
    <span class="node-label__value">{{ value }}</span>
    <Tag v-if="deleted" value="deleted" severity="secondary" class="node-label__tag" />
  </span>
</template>

<style scoped>
.node-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.node-label--deleted .node-label__value {
  text-decoration: line-through;
  opacity: 0.55;
}

.node-label__tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
}
</style>
