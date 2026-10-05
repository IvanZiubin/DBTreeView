<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import BlueprintCorners from './BlueprintCorners.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    confirmLabel: string
    /** 540px instead of 440px (Apply dialog). */
    wide?: boolean
    /** data-testid of the dialog; buttons get `<testid>-cancel` / `<testid>-confirm`. */
    testid?: string
  }>(),
  { wide: false, testid: 'confirm-dialog' },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const cancelButton = ref<HTMLButtonElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick()
      cancelButton.value?.focus()
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dialog-backdrop app-dialog-backdrop"
      @click.self="emit('cancel')"
      @keydown.esc="emit('cancel')"
    >
      <div
        class="dialog blueprint app-dialog"
        :class="{ 'app-dialog--wide': wide }"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        :data-testid="testid"
      >
        <BlueprintCorners />
        <div class="dialog-title">{{ title }}</div>
        <slot />
        <div class="dialog-actions">
          <button
            ref="cancelButton"
            type="button"
            class="btn btn-secondary"
            :data-testid="`${testid}-cancel`"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary blueprint"
            :data-testid="`${testid}-confirm`"
            @click="emit('confirm')"
          >
            <BlueprintCorners />
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
