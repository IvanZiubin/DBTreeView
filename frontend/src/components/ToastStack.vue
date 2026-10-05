<script setup lang="ts">
import BlueprintCorners from './BlueprintCorners.vue'
import { useToastStore } from '../stores/toasts'

const toasts = useToastStore()
</script>

<template>
  <div class="toast-stack" data-testid="toast-stack">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts.toasts"
        :key="toast.id"
        class="blueprint toast"
        :class="`toast--${toast.severity}`"
        :role="toast.severity === 'error' ? 'alert' : 'status'"
        data-testid="toast"
        :data-severity="toast.severity"
        @click="toasts.dismiss(toast.id)"
      >
        <BlueprintCorners />
        <span class="card-kicker toast__kicker">{{ toast.severity }}</span>
        <span class="toast__summary">{{ toast.summary }}</span>
        <span class="toast__detail">{{ toast.detail }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>
