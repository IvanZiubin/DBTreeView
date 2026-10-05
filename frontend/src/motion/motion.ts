// DOM-only motion helpers (Web Animations API), no Vue imports. Not unit-tested (Vitest runs in Node); every helper
// is a no-op when the user prefers reduced motion.

export const FLIP_MS = 460
export const FADE_IN_MS = 320
export const FLY_MS = 720

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Rects of every element carrying `attr`, keyed by the attribute value. */
export function captureRowRects(container: HTMLElement | null, attr: string): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>()
  if (container === null) {
    return rects
  }
  for (const element of Array.from(container.querySelectorAll<HTMLElement>(`[${attr}]`))) {
    const key = element.getAttribute(attr)
    if (key !== null) {
      rects.set(key, element.getBoundingClientRect())
    }
  }
  return rects
}

/** FLIP: rows that moved slide from their old position; rows that are new fade in (except skipKey, the fly target). */
export function playFlip(
  container: HTMLElement | null,
  attr: string,
  before: ReadonlyMap<string, DOMRect>,
  skipKey: string | null,
): void {
  if (container === null || prefersReducedMotion()) {
    return
  }
  for (const element of Array.from(container.querySelectorAll<HTMLElement>(`[${attr}]`))) {
    const key = element.getAttribute(attr)
    if (key === null || key === skipKey) {
      continue
    }
    const now = element.getBoundingClientRect()
    const previous = before.get(key)
    if (previous) {
      const dx = previous.left - now.left
      const dy = previous.top - now.top
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        element.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: FLIP_MS, easing: 'cubic-bezier(.2,.7,.2,1)' },
        )
      }
    } else {
      element.animate(
        [
          { opacity: 0, transform: 'translateX(-10px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: FADE_IN_MS, easing: 'ease-out' },
      )
    }
  }
}

/** Accent chip with `label` flies from the DB row value (source) to the cache row (target), which appears on arrival. */
export function flyChip(source: Element, target: Element, label: string): void {
  if (prefersReducedMotion()) {
    return
  }
  const from = source.getBoundingClientRect()
  const targetValue = target.querySelector('[data-val]') ?? target
  const to = targetValue.getBoundingClientRect()
  target.animate([{ opacity: 0 }, { opacity: 0, offset: 0.82 }, { opacity: 1 }], { duration: FLY_MS })
  const chip = document.createElement('div')
  chip.className = 'fly-chip'
  chip.textContent = label
  chip.style.left = `${from.left - 8}px`
  chip.style.top = `${from.top + from.height / 2 - 13}px`
  document.body.appendChild(chip)
  const dx = to.left - from.left
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  const animation = chip.animate(
    [
      { transform: 'translate(0, 0) scale(.96)', opacity: 0 },
      { transform: 'translate(0, -3px) scale(1.04)', opacity: 1, offset: 0.12 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.06)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1, offset: 0.86 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 0 },
    ],
    { duration: FLY_MS, easing: 'cubic-bezier(.35,.55,.2,1)' },
  )
  animation.onfinish = () => {
    chip.remove()
  }
  animation.oncancel = () => {
    chip.remove()
  }
}
