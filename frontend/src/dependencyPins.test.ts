// Guards the stage-3 PrimeVue styling fix (docs/plans/stage-3-frontend.yaml fix_ui_theme; DR-FE-4.9).
// `?raw` imports are typed by vite/client (src/vite-env.d.ts) and inlined by Vitest; no JSON-module typing needed.
import { describe, expect, it } from 'vitest'
import packageJsonText from '../package.json?raw'
import installedStylesPackageJsonText from '../node_modules/@primeuix/styles/package.json?raw'
import installedButtonStyleText from '../node_modules/@primeuix/styles/button/index.mjs?raw'

interface PackageJson {
  version?: string
  dependencies?: Record<string, string>
  overrides?: Record<string, string>
}

const PIN_MESSAGE =
  'primevue 4.3.3 and @primeuix/themes 1.0.3 use the @primeuix/styled 0.5 engine, which only understands the CSS ' +
  'of @primeuix/styles 1.0.x (newer styles emit dt() calls and the UI renders unstyled). Keep primevue 4.3.3, ' +
  '@primeuix/themes 1.0.3 and @primeuix/styles 1.0.3 (in dependencies AND overrides) together; change them only ' +
  'together, in one planned upgrade, and re-check the UI in a browser.'

const pkg = JSON.parse(packageJsonText) as PackageJson
const installedStyles = JSON.parse(installedStylesPackageJsonText) as PackageJson

describe('PrimeVue styling pin', () => {
  it('dependencies pin primevue 4.3.3 with @primeuix/themes 1.0.3 and @primeuix/styles 1.0.3', () => {
    expect(pkg.dependencies?.primevue, PIN_MESSAGE).toBe('4.3.3')
    expect(pkg.dependencies?.['@primeuix/themes'], PIN_MESSAGE).toBe('1.0.3')
    expect(pkg.dependencies?.['@primeuix/styles'], PIN_MESSAGE).toBe('1.0.3')
  })

  it('overrides force the same @primeuix/styles 1.0.3 for primevue', () => {
    expect(pkg.overrides?.['@primeuix/styles'], PIN_MESSAGE).toBe('1.0.3')
  })

  it('the installed @primeuix/styles is 1.0.3 and its CSS has no dt() calls', () => {
    expect(installedStyles.version, PIN_MESSAGE).toBe('1.0.3')
    expect(installedButtonStyleText.includes("dt('"), PIN_MESSAGE).toBe(false)
  })
})
