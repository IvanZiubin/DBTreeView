<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { MAX_VALUE_LENGTH, validateValue } from '../cache/pending'

const props = defineProps<{
  visible: boolean
  header: string
  confirmLabel: string
  initialValue: string
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  confirm: [value: string]
}>()

const draft = ref('')
const submitted = ref(false)

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      draft.value = props.initialValue
      submitted.value = false
    }
  },
  { immediate: true },
)

const error = computed<string | null>(() => validateValue(draft.value))
const showError = computed<boolean>(() => submitted.value && error.value !== null)

function onInput(value: string | undefined): void {
  draft.value = value ?? ''
}

function close(): void {
  emit('update:visible', false)
}

/** Validates (contract value_rules), emits the trimmed value, closes. Enter in the input calls this too. */
function submit(): void {
  submitted.value = true
  if (error.value !== null) {
    return
  }
  emit('confirm', draft.value.trim())
  close()
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="header"
    :draggable="false"
    :style="{ width: '28rem' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="value-dialog" data-testid="node-value-dialog">
      <label for="node-value-input" class="value-dialog__label">Value</label>
      <InputText
        id="node-value-input"
        :model-value="draft"
        :invalid="showError"
        autofocus
        fluid
        data-testid="node-value-input"
        @update:model-value="onInput"
        @keydown.enter.prevent="submit"
      />
      <small v-if="showError" class="value-dialog__error" data-testid="node-value-error">{{ error }}</small>
      <small v-else class="value-dialog__hint">
        1–{{ MAX_VALUE_LENGTH }} characters; leading and trailing spaces are removed.
      </small>
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" outlined data-testid="node-value-cancel" @click="close" />
      <Button :label="confirmLabel" data-testid="node-value-confirm" @click="submit" />
    </template>
  </Dialog>
</template>

<style scoped>
.value-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.value-dialog__label {
  font-weight: 600;
}

.value-dialog__error {
  color: var(--p-red-500);
}

.value-dialog__hint {
  color: var(--p-text-muted-color);
}
</style>
