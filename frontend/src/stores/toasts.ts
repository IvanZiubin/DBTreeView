import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastSeverity = 'success' | 'info' | 'warn' | 'error'

export interface ToastInput {
  severity: ToastSeverity
  summary: string
  detail: string
  /** Auto-dismiss delay; default DEFAULT_TOAST_LIFE_MS. */
  lifeMs?: number
}

export interface Toast {
  id: number
  severity: ToastSeverity
  summary: string
  detail: string
}

export const DEFAULT_TOAST_LIFE_MS = 3200
export const MAX_TOASTS = 4

/** Blueprint toasts. */
export const useToastStore = defineStore('toasts', () => {
  /** Oldest first, at most MAX_TOASTS. */
  const toasts = ref<Toast[]>([])
  let nextId = 1

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function show(input: ToastInput): number {
    const id = nextId
    nextId += 1
    const toast: Toast = { id, severity: input.severity, summary: input.summary, detail: input.detail }
    toasts.value = [...toasts.value, toast].slice(-MAX_TOASTS)
    setTimeout(() => {
      dismiss(id)
    }, input.lifeMs ?? DEFAULT_TOAST_LIFE_MS)
    return id
  }

  return { toasts, show, dismiss }
})
