import { ApiError } from './api/client'
import type { ToastInput } from './stores/toasts'

/** Error toasts stay longer than the 3.2 s default. */
export const ERROR_TOAST_LIFE_MS = 6000

type ShowToast = (toast: ToastInput) => void

let showToast: ShowToast | null = null

/** Called once from App.vue setup with the toast store's show(). */
export function installErrorToast(show: ShowToast): void {
  showToast = show
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
  showToast?.({ severity: 'error', summary, detail, lifeMs: ERROR_TOAST_LIFE_MS })
}
