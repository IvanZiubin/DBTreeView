// Guards the stage-5 dependency decision (docs/plans/stage-5-frontend.md DR-FE-5.1, DR-FE-5.3): PrimeVue is removed
// completely and icons come only from lucide-vue-next, pinned exactly. Replaces the stage-4 PrimeVue pin guard (DR-FE-4.9).
// `?raw` imports are typed by vite/client (src/vite-env.d.ts) and inlined by Vitest; no JSON-module typing needed.
import { describe, expect, it } from 'vitest'
import packageJsonText from '../package.json?raw'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  overrides?: Record<string, string>
}

const REMOVED_PACKAGES = ['primevue', '@primeuix/themes', '@primeuix/styles', '@primeuix/styled', 'primeicons']

const MESSAGE =
  'Stage 5 removed PrimeVue (DR-FE-5.1): the UI is plain Vue on src/styles/industry.css + src/styles/app.css and ' +
  'icons come from lucide-vue-next 0.525.0 (exact). Do not re-add PrimeVue packages or an overrides block; change ' +
  'the icon package only via a plan.'

const pkg = JSON.parse(packageJsonText) as PackageJson

describe('dependency pins', () => {
  it('no PrimeVue package in dependencies or devDependencies', () => {
    for (const name of REMOVED_PACKAGES) {
      expect(pkg.dependencies?.[name], `${MESSAGE} (${name})`).toBeUndefined()
      expect(pkg.devDependencies?.[name], `${MESSAGE} (${name})`).toBeUndefined()
    }
  })

  it('no overrides block', () => {
    expect(pkg.overrides, MESSAGE).toBeUndefined()
  })

  it('lucide-vue-next is pinned exactly to 0.525.0', () => {
    expect(pkg.dependencies?.['lucide-vue-next'], MESSAGE).toBe('0.525.0')
  })
})
