# Mobile layout redesign

## Problem

On mobile (≤700px) the app stacks its three desktop columns top-to-bottom:
uploader → parts → 3D canvas → config panels. The 3D canvas ends up far down
the page, the mesh-details overlay covers it, and the page and the canvas fight
for the same drag gestures. Users scroll constantly and struggle to orbit the
model.

## Goals

A purpose-built mobile layout where the canvas is always visible, controls are
reachable with the thumb, and the page no longer competes with canvas gestures.
Desktop (>700px) is unchanged.

## Layout

A full-height (`100dvh`), non-page-scrolling app shell with four stacked zones:

1. **Top bar** (`app-header`): only `Mesh Splitter` (logo + title), theme
   toggle, language toggle, and the credits chip (shows free quota, opens the
   buy-credits dialog on tap). Hidden on mobile: the "Awaiting mesh" status
   chip, the "N parts" chip, the performance chip, and the "Buy credits"
   button (redundant with the credits chip).

2. **Sticky canvas**: the `col-center` preview, pinned directly under the top
   bar and always on screen. Height ≈ 66% of the viewport below the bar. The
   mesh-details overlay (`canvas-inspector`), the `canvas-label`, and text hints
   are hidden on mobile. Overlaid controls kept: a small `Replace` button
   (top-right) and the existing `Labels` toggle (bottom-right).

3. **Scrollable middle** (the only scroll region): compact parts list, then the
   config accordion.
   - **Compact PartList**: color swatch/thumbnail + label only. Volume and
     faces lines are hidden via a `compact` prop. The "Key ×N" row and selection
     behaviour are unchanged.
   - **Config accordion**: Build volume, Scale, Split & connectors — each a
     collapsible section; only one open at a time. The connector *config* lives
     inside the "Split & connectors" section; the Split *action button* moves to
     the action bar (zone 4).

4. **Fixed action bar**: pinned to the bottom of the viewport. `Split mesh`
   (left) and `Export · 1 credit` (right), each ~50% width. Both respect the
   existing disabled logic: Split/Export disabled when the mesh is non-watertight
   (`canSplitMesh`); Export additionally disabled until parts exist.

### Empty state (no mesh loaded)

The sticky canvas area doubles as the drop zone: a centered "Upload an STL file"
prompt fills it; tapping it opens the file picker. The parts list shows its
existing empty hint. Split and Export are disabled. Once a mesh loads, the
canvas shows the model and the upload prompt is replaced by the corner `Replace`
button.

## Architecture

Changes are scoped to the mobile breakpoint and an `isMobile` flag; desktop
markup/behaviour is untouched.

- **`useIsMobile` composable** (`frontend/src/composables/useIsMobile.js`): wraps
  `useMediaQuery('(max-width: 700px)')` from `@vueuse/core` (already a
  dependency). Single source of truth for the breakpoint, used by `App.vue` and
  passed to children as needed.

- **`App.vue`**:
  - Header: wrap the hidden-on-mobile chips/button so they render only when
    `!isMobile` (or hide via CSS — see below).
  - Mobile structure: when `isMobile`, render the canvas first, then the
    scrollable middle (parts + accordion), then the action bar. Reuse the same
    child components; only their arrangement/props differ. Prefer CSS
    reordering of the existing DOM where clean; use `isMobile` conditionals only
    where CSS cannot express the change (accordion state, action bar, which
    buttons render).
  - Hold the accordion "open section" state (`openSection` ref: `'volume' |
    'scale' | 'split' | null`) and pass open/visible state down, so only one
    section expands at a time.
  - Mobile action bar (small inline block or a `MobileActionBar.vue`): Split and
    Export buttons. Export calls the existing `onExportPackage`. Split calls a
    method exposed by `SplitConfig` (`defineExpose({ requestSplit })`) so the
    "no connector selected" warning flow stays in one place.

- **`MeshUploader.vue`**: gains a mobile presentation where the drop zone is the
  canvas empty-state. Simplest implementation: when `isMobile` and no mesh, the
  upload prompt is rendered as an overlay inside the canvas area; the file
  `<input>` and `handleFile`/`onDrop` logic are reused. When a mesh is loaded,
  only the corner `Replace` button shows (triggers the same hidden `<input>`).
  The desktop `MeshUploader` panel is hidden on mobile.

- **`PartList.vue`**: add a `compact` boolean prop. When set, the `pl-meta`
  (dims) and `pl-vol` (volume + faces) lines are not rendered; row shows swatch +
  label + index only.

- **Config accordion**: a lightweight wrapper (`AccordionSection.vue` or inline
  in `App.vue`) renders each of `BuildVolumeConfig`, `ScaleConfig`, `SplitConfig`
  inside a collapsible header. Only used on mobile; on desktop the three panels
  render as today. `SplitConfig` keeps its connector config but, on mobile, hides
  its own Split button (the action bar owns it).

- **`style.css`**: extend the existing `@media (max-width: 700px)` block:
  shell becomes `100dvh` flex column, `overflow: hidden`; canvas zone is `flex:
  none` at ~66vh; middle zone is the `flex: 1` scroll region; action bar is
  pinned (sticky/fixed within the shell). Hide `canvas-inspector`,
  `canvas-label`, desktop uploader panel, and the header chips/buttons noted
  above.

## Components and interfaces

- `useIsMobile()` → `Ref<boolean>`. Depends on `@vueuse/core`.
- `PartList` gains `compact?: boolean` (default `false`). No behaviour change on
  desktop.
- `SplitConfig` exposes `requestSplit()` (runs its existing connector-warning +
  emit flow) and accepts a flag to hide its internal Split button on mobile.
- Mobile action bar consumes `canSplitMesh`, `hasChunks`, `exportCost`, loading
  state; emits split/export to `App` handlers.

## Error handling / edge cases

- The non-manifold error panel (from the prior PR) already floats over the
  canvas; on mobile it sits over the sticky canvas zone — verify it doesn't
  overlap the action bar (it's top-anchored, so it shouldn't).
- Split disabled states must be reflected in the action bar, not just hidden
  desktop buttons.
- Orientation change / resize: `useMediaQuery` is reactive, so switching across
  700px re-arranges live.
- Accordion default: "Build volume" (the first/top section) is open by default,
  matching the natural flow (pick printer → scale → split). Opening another
  section closes it.

## Testing

- Unit: `PartList` compact mode hides volume/faces; accordion opens one section
  at a time; `useIsMobile` returns reactive boolean (mock `matchMedia`).
- Manual (mobile viewport via preview/devtools at ≤700px): canvas stays pinned
  and orbits without page scroll; upload-as-empty-state works; Replace works;
  parts list is compact; accordion is one-open; action bar pinned with correct
  disabled states; desktop layout unchanged at >700px.

## Out of scope

- Desktop layout changes.
- Restoring mesh-details info on mobile (intentionally hidden).
- Gestures beyond what OrbitControls already provides.

## Files changed

- `frontend/src/composables/useIsMobile.js` (new)
- `frontend/src/components/PartList.vue` (compact prop)
- `frontend/src/components/SplitConfig.vue` (expose requestSplit, hide button on mobile)
- `frontend/src/components/MeshUploader.vue` (canvas empty-state upload on mobile)
- `frontend/src/components/AccordionSection.vue` (new, or inline accordion in App.vue)
- `frontend/src/components/MobileActionBar.vue` (new, or inline in App.vue)
- `frontend/src/App.vue` (mobile arrangement, accordion state, action bar wiring)
- `frontend/src/style.css` (mobile breakpoint layout)
- Corresponding unit tests
