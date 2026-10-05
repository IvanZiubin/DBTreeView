<script setup lang="ts">
import { computed } from 'vue'
import Tag from 'primevue/tag'
import type { NodeStatus } from '../cache/pending'

type TagSeverity = 'secondary' | 'danger' | 'success' | 'warn'

const TAGS: Record<NodeStatus, { label: string; severity: TagSeverity } | null> = {
  clean: null,
  new: { label: 'new', severity: 'success' },
  edited: { label: 'edited', severity: 'warn' },
  'pending-delete': { label: 'to delete', severity: 'danger' },
  deleted: { label: 'deleted', severity: 'secondary' },
}

const props = defineProps<{
  value: string
  status: NodeStatus
}>()

const tag = computed(() => TAGS[props.status])
</script>

<template>
  <span class="node-label" :class="`node-label--${status}`" :data-status="status" data-testid="node-label">
    <span class="node-label__value">{{ value }}</span>
    <Tag v-if="tag" :value="tag.label" :severity="tag.severity" class="node-label__tag" />
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

.node-label--pending-delete .node-label__value {
  text-decoration: line-through;
  opacity: 0.75;
}

.node-label--new .node-label__value {
  font-style: italic;
}

.node-label__tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
}
</style>
