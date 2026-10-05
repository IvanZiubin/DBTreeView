<script setup lang="ts">
import { computed } from 'vue'
import type { NodeStatus } from '../cache/pending'
import { statusTag } from '../view/treeRows'

const props = defineProps<{
  status: NodeStatus
  /** Transient flash tag (re-parented / cascade / saved #id), null for none. */
  flash: string | null
}>()

const tag = computed(() => statusTag(props.status))
</script>

<template>
  <span v-if="tag" class="tree-tag" :class="tag.className" data-testid="status-tag">{{ tag.label }}</span>
  <span v-if="flash" class="tree-tag tree-tag--flash tag tag-accent" data-testid="flash-tag">{{ flash }}</span>
</template>
