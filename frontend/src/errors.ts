import type { useToast } from 'primevue/usetoast'
import { ApiError } from './api/client'

type ToastApi = ReturnType<typeof useToast>

let toastApi: ToastApi | null = null

/** Called once from App.vue setup with useToast(). */
export function installErrorToast(toast: ToastApi): void {
  toastApi = toast
}

export function describeError(err: unknown): { summary: string; detail: string } {
  if (err instanceof ApiError) {
    return { summary: err.title, detail: err.detail }
  }
  if (err instanceof Error) {
    return { summary: 'Unexpected error', detail: err.message }
  }
  return { summary: 'Unexpected error', detail: String(err) }
}

/** Logs the error and shows an error toast with ProblemDetails title/detail. */
export function reportError(err: unknown): void {
  console.error(err)
  const { summary, detail } = describeError(err)
  toastApi?.add({ severity: 'error', summary, detail, life: 6000 })
}
