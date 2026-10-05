# Stage 5 design reference — "Industry" Tree Editor

Imported from the claude.ai design project
[Tree Editor](https://claude.ai/design/p/c4013fb1-0341-440b-b446-4f41f68fe51a?file=Tree+Editor.dc.html)
on 2026-10-01. These are **reference copies** — the source for stage 5 UI work. Do not import them from `frontend/` directly;
the stage 5 frontend plan says how tokens and markup are ported into Vue.

| File | What it is |
|---|---|
| `tree-editor.dc.html` | The screen mock: markup (template with `{{ }}` bindings, `sc-if`/`sc-for`) + a React-like logic class with a simulated API. Behaviour reference, not production code. |
| `industry-styles.css` | The "Industry" design system: tokens (`--color-*`, `--font-*`, `--space-*`, `--shadow-*`) and component classes (`.btn`, `.tag`, `.nav`, `.dialog`, `.blueprint` + `.corner`, `.input`, `.seg`). |

Not copied (design-tool runtime only): `support.js`, `_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json`.

## Design system rules (condensed from the system's readme)

- Steel-blue wireframe on a light technical ground; one accent `#5980a6` with 100–900 ramps. No decorative color beyond the accent.
- Barlow Condensed (600) for headings/buttons, Barlow for body — Google Fonts.
- Cards, panels, dialogs and primary buttons are **blueprint objects**: square corners, 1px hairline border, transparent fill,
  `+` registration marks (`.blueprint` + four `<i class="corner tl|tr|bl|br">`). Never rounded, never surface-filled.
  The solid accent primary button is the one filled object.
- Icons: Lucide, stroke-width 1.5.
- States: hover tint + pressed step from the accent ramp; focus = `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`;
  disabled = 45% opacity. Paragraph text in accent uses `--color-accent-700`.
- Take every color/font/space/shadow from tokens — no hard-coded hex or font names.

## Screen anatomy (`tree-editor.dc.html`)

1. **Header** (`.nav`): database icon + "Tree Editor" brand, Reset (`.btn-secondary`, spinning icon while resetting) → confirm dialog.
2. **Main grid**: `DBTreeView` panel | 150px transfer gutter | `CachedTreeView` panel. Panels are `.blueprint` sections
   with a header (kicker + `h3`) and a scrollable body.
   - DB panel: "Load into cache" primary button (spinner while loading); rows with lazy expand chevron (spinner while fetching),
     leaf dot, value, `deleted` tag, `#id` right, accent square when the node is in the cache. Double-click or drag a row to load it.
   - Gutter: drag hint card, "Loading / Last load" card (`GET /api/nodes/{id}` · status · ms · n re-parented), idle hint text.
   - Cache panel: Edit / Add child / Delete (`.btn-secondary`) + Apply (primary). Rows: collapse chevron, inline `.input` editor
     (Enter commits, Escape cancels, blur commits), tags `new` / `edited` / `to delete` / `deleted`, `parent #id` hint for orphans,
     `tmp` id label for new nodes. Drop zone overlay "Drop to load" while dragging over it.
   - Link lines: SVG bezier curves joining a DB row to its cached copy (dashed neutral; solid accent when hovered/selected).
3. **Network log** footer: collapsible; count tag, pulsing dot while a request is pending, last request summary; table of
   time / method / path / status tag / duration.
4. **Toasts**: top-right blueprint cards (kicker severity, title, detail), auto-dismiss ~3.2s.
5. **Dialogs**: Apply (summary + itemised `add` / `edit` / `delete` list + cascade note) and Reset confirmation.

Row style: the mock offers three variants (hairline / ledger / cells) as a design-exploration toggle; **hairline** is the default
(30px rows, 18px indent, vertical guide lines per depth).

Motion: fly-in chip from DB row to cache row on load, FLIP re-layout of cache rows when re-parented, flash highlight +
transient tag (`re-parented`, `cascade`, `saved #id`) for ~1.8s. Simulated latency (`latency` prop) is mock-only.
