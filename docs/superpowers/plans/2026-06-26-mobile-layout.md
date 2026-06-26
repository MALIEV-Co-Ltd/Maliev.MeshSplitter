# Mobile Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A purpose-built mobile (≤700px) layout: slim top bar, sticky 3D canvas at top, compact parts list, one-open accordion config, fixed Split/Export action bar, and upload-as-canvas-empty-state. Desktop is unchanged.

**Architecture:** A reactive `isMobile` flag (`@vueuse/core` `useMediaQuery`) drives conditional rendering in `App.vue` for the mobile-only pieces (accordion, action bar, canvas upload overlay); the rest is CSS in the existing `@media (max-width: 700px)` block. File-upload logic is extracted to a composable so the desktop panel and the mobile canvas overlay share it.

**Tech Stack:** Vue 3 `<script setup>`, `@vueuse/core`, Vitest + `@vue/test-utils`, plain CSS.

---

## File structure

- Create `frontend/src/composables/useIsMobile.js` — breakpoint flag.
- Create `frontend/src/composables/useFileUpload.js` — shared file-input/validation logic.
- Create `frontend/src/components/AccordionSection.vue` — one collapsible section.
- Create `frontend/src/components/MobileActionBar.vue` — fixed Split/Export bar.
- Create `frontend/src/components/CanvasUploadOverlay.vue` — mobile upload prompt / Replace button over the canvas.
- Modify `frontend/src/components/MeshUploader.vue` — use `useFileUpload`; hidden on mobile.
- Modify `frontend/src/components/PartList.vue` — `compact` prop.
- Modify `frontend/src/components/SplitConfig.vue` — `defineExpose({ requestSplit })`; `showSplitButton` prop.
- Modify `frontend/src/App.vue` — mobile arrangement + state wiring.
- Modify `frontend/src/style.css` — mobile breakpoint layout.

Tests colocated per existing convention (`__tests__/` for components, sibling `.test.js` for composables).

---

## Task 1: `useIsMobile` composable

**Files:**
- Create: `frontend/src/composables/useIsMobile.js`
- Test: `frontend/src/composables/useIsMobile.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useIsMobile } from './useIsMobile'

describe('useIsMobile', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((q) => ({
      matches: q.includes('700px'),
      media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }))
  })
  it('is true when the viewport matches the mobile query', () => {
    expect(useIsMobile().value).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, expect FAIL** — `npx vitest run src/composables/useIsMobile.test.js` (module not found).

- [ ] **Step 3: Implement**

```js
import { useMediaQuery } from '@vueuse/core'

export function useIsMobile() {
  return useMediaQuery('(max-width: 700px)')
}
```

- [ ] **Step 4: Run test, expect PASS.**

- [ ] **Step 5: Commit** — `feat: add useIsMobile breakpoint composable`.

---

## Task 2: `useFileUpload` composable + refactor MeshUploader

**Files:**
- Create: `frontend/src/composables/useFileUpload.js`
- Test: `frontend/src/composables/useFileUpload.test.js`
- Modify: `frontend/src/components/MeshUploader.vue`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { useFileUpload } from './useFileUpload'

function makeFile(name, size = 10) {
  return new File([new Uint8Array(size)], name, { type: 'model/stl' })
}

describe('useFileUpload', () => {
  it('emits upload for a valid .stl file', () => {
    const emitted = []
    const u = useFileUpload((evt, file) => emitted.push([evt, file]), {
      selectStl: 'pick stl', fileTooLarge: 'too big',
    })
    u.handleFile(makeFile('a.stl'))
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe('upload')
    expect(u.localError.value).toBe('')
  })
  it('rejects non-stl and sets localError', () => {
    const emitted = []
    const u = useFileUpload((evt, file) => emitted.push([evt, file]), {
      selectStl: 'pick stl', fileTooLarge: 'too big',
    })
    u.handleFile(makeFile('a.png'))
    expect(emitted).toHaveLength(0)
    expect(u.localError.value).toBe('pick stl')
  })
  it('rejects files over 200MB', () => {
    const u = useFileUpload(() => {}, { selectStl: 's', fileTooLarge: 'too big' })
    const big = { name: 'a.stl', size: 201 * 1024 * 1024 }
    u.handleFile(big)
    expect(u.localError.value).toBe('too big')
  })
})
```

- [ ] **Step 2: Run test, expect FAIL.**

- [ ] **Step 3: Implement** (mirrors current `MeshUploader` logic)

```js
import { ref } from 'vue'

export function useFileUpload(emit, labels) {
  const fileInput = ref(null)
  const dragOver = ref(false)
  const localError = ref('')

  function browse() { fileInput.value?.click() }

  function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.stl')) {
      localError.value = labels.selectStl
      return
    }
    if (file.size > 200 * 1024 * 1024) {
      localError.value = labels.fileTooLarge
      return
    }
    localError.value = ''
    emit('upload', file)
  }

  function onFileSelected(e) {
    const file = e.target?.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e) {
    dragOver.value = false
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  return { fileInput, dragOver, localError, browse, handleFile, onFileSelected, onDrop }
}
```

- [ ] **Step 4: Run test, expect PASS.**

- [ ] **Step 5: Refactor `MeshUploader.vue`** to consume the composable. In `<script setup>` replace the local `dragOver`/`fileInput`/`localError`/`handleFile`/`onFileSelected`/`onDrop` with:

```js
import { useFileUpload } from '@/composables/useFileUpload'
const emit = defineEmits(['upload'])
const { fileInput, dragOver, localError, browse, onFileSelected, onDrop } = useFileUpload(emit, props.labels)
```

Update template handlers to `@click="browse"` on the drop zone and Replace button (replacing `fileInput?.click()`). Keep the `<input ref="fileInput" ...>` and all markup otherwise identical.

- [ ] **Step 6: Run the existing MeshUploader tests** — `npx vitest run src/components/__tests__/MeshUploader.test.js` — expect PASS (behaviour unchanged).

- [ ] **Step 7: Commit** — `refactor: extract useFileUpload; reuse in MeshUploader`.

---

## Task 3: `PartList` compact prop

**Files:**
- Modify: `frontend/src/components/PartList.vue`
- Test: `frontend/src/components/__tests__/PartList.test.js`

- [ ] **Step 1: Add the failing test**

```js
it('hides volume and faces lines in compact mode', () => {
  const wrapper = mount(PartList, {
    props: {
      compact: true,
      chunks: [{ index: 0, label: 'P01', volume: 2070400, faces: 29912, dims: { x: 153, y: 154, z: 158 }, color: 0xff0000 }],
    },
  })
  expect(wrapper.find('.pl-label').text()).toBe('P01')
  expect(wrapper.findAll('.pl-meta')).toHaveLength(0)
})
```

- [ ] **Step 2: Run test, expect FAIL.**

- [ ] **Step 3: Implement.** Add prop `compact: { type: Boolean, default: false }`. Wrap both `.pl-meta` lines (in the key row and the chunk row) with `v-if="!compact"`. Example for the chunk row:

```html
<span v-if="!compact" class="pl-meta">{{ metaLine(chunk) }}</span>
<span v-if="!compact" class="pl-meta pl-vol">{{ volumeLabel(chunk) }}</span>
```

Apply the same `v-if="!compact"` to the two `.pl-meta` spans in the key row.

- [ ] **Step 4: Run PartList tests, expect PASS (new + existing).**

- [ ] **Step 5: Commit** — `feat: add compact mode to PartList`.

---

## Task 4: `AccordionSection` component

**Files:**
- Create: `frontend/src/components/AccordionSection.vue`
- Test: `frontend/src/components/__tests__/AccordionSection.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AccordionSection from '../AccordionSection.vue'

describe('AccordionSection', () => {
  it('renders the title and shows content only when open', () => {
    const wrapper = mount(AccordionSection, {
      props: { title: 'Build volume', open: false },
      slots: { default: '<p class="body">hi</p>' },
    })
    expect(wrapper.text()).toContain('Build volume')
    expect(wrapper.find('.body').exists()).toBe(false)
  })
  it('emits toggle when the header is clicked', async () => {
    const wrapper = mount(AccordionSection, { props: { title: 'Scale', open: true } })
    await wrapper.find('.acc-head').trigger('click')
    expect(wrapper.emitted('toggle')).toBeTruthy()
  })
  it('shows slot content when open', () => {
    const wrapper = mount(AccordionSection, {
      props: { title: 'Scale', open: true },
      slots: { default: '<p class="body">hi</p>' },
    })
    expect(wrapper.find('.body').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, expect FAIL.**

- [ ] **Step 3: Implement**

```html
<template>
  <div class="acc-section" :class="{ 'acc-open': open }">
    <button type="button" class="acc-head" :aria-expanded="open" @click="$emit('toggle')">
      <span class="acc-title">
        <component :is="icon" v-if="icon" :size="15" :stroke-width="1.75" />
        {{ title }}
      </span>
      <ChevronDownIcon :size="16" :stroke-width="1.75" class="acc-chevron" :class="{ 'rotate-180': open }" />
    </button>
    <div v-show="open" class="acc-body">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ChevronDown as ChevronDownIcon } from '@lucide/vue'
defineProps({
  title: { type: String, required: true },
  open: { type: Boolean, default: false },
  icon: { type: [Object, Function], default: null },
})
defineEmits(['toggle'])
</script>
```

Note: use `v-show` so inputs inside keep state when collapsed; the test for "content only when open" checks `.body` visibility — adjust the first test to assert `isVisible()` if needed. To keep the test simple, the first test uses `v-if`-style absence; switch it to `expect(wrapper.find('.body').isVisible()).toBe(false)` to match `v-show`.

- [ ] **Step 4: Update the first test** to `expect(wrapper.find('.body').isVisible()).toBe(false)` (v-show hides via display:none).

- [ ] **Step 5: Run tests, expect PASS.**

- [ ] **Step 6: Commit** — `feat: add AccordionSection component`.

---

## Task 5: `SplitConfig` — expose split + optional button

**Files:**
- Modify: `frontend/src/components/SplitConfig.vue`
- Test: `frontend/src/components/__tests__/SplitConfig.test.js`

- [ ] **Step 1: Add failing tests**

```js
it('hides the internal split button when showSplitButton is false', () => {
  const wrapper = mount(SplitConfig, { props: { v: [250,250,250], ok: true, showSplitButton: false } })
  expect(wrapper.find('.split-btn').exists()).toBe(false)
})
it('exposes requestSplit that runs the split flow', async () => {
  const wrapper = mount(SplitConfig, { props: { v: [250,250,250], ok: true } })
  wrapper.vm.requestSplit()
  // Key connector is default, so it emits split directly
  expect(wrapper.emitted('split')).toBeTruthy()
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Add prop `showSplitButton: { type: Boolean, default: true }`. Wrap the existing `<Button class="split-btn" ...>` with `v-if="showSplitButton"`. Rename the existing `onSplit` trigger to a named function and expose it:

```js
function requestSplit() { onSplit() }
defineExpose({ requestSplit })
```

(`onSplit` already contains the connector-warning logic; `requestSplit` just calls it so external callers reuse the same flow.)

- [ ] **Step 4: Run SplitConfig tests, expect PASS (new + existing 9).**

- [ ] **Step 5: Commit** — `feat: SplitConfig exposes requestSplit and optional button`.

---

## Task 6: `MobileActionBar` component

**Files:**
- Create: `frontend/src/components/MobileActionBar.vue`
- Test: `frontend/src/components/__tests__/MobileActionBar.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MobileActionBar from '../MobileActionBar.vue'

describe('MobileActionBar', () => {
  it('disables split when canSplit is false', () => {
    const wrapper = mount(MobileActionBar, { props: { canSplit: false, hasChunks: false } })
    const split = wrapper.find('[data-testid="bar-split"]')
    expect(split.attributes('disabled')).toBeDefined()
  })
  it('emits split and export', async () => {
    const wrapper = mount(MobileActionBar, { props: { canSplit: true, hasChunks: true } })
    await wrapper.find('[data-testid="bar-split"]').trigger('click')
    await wrapper.find('[data-testid="bar-export"]').trigger('click')
    expect(wrapper.emitted('split')).toBeTruthy()
    expect(wrapper.emitted('export-package')).toBeTruthy()
  })
  it('disables export when there are no chunks', () => {
    const wrapper = mount(MobileActionBar, { props: { canSplit: true, hasChunks: false } })
    expect(wrapper.find('[data-testid="bar-export"]').attributes('disabled')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```html
<template>
  <div class="mobile-action-bar">
    <Button class="mab-btn" data-testid="bar-split" :disabled="!canSplit || loading" @click="$emit('split')">
      {{ loading ? (progressLabel || labels.working) : labels.splitMesh }}
    </Button>
    <button type="button" class="mab-btn mab-btn--export" data-testid="bar-export"
            :disabled="!hasChunks || loading" @click="$emit('export-package')">
      <span>{{ labels.export }}</span>
      <small v-if="cost?.label">{{ cost.label }}</small>
    </button>
  </div>
</template>

<script setup>
import { Button } from '@/components/ui/button'
defineProps({
  canSplit: { type: Boolean, default: false },
  hasChunks: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  progressLabel: { type: String, default: '' },
  cost: { type: Object, default: () => ({}) },
  labels: { type: Object, default: () => ({ splitMesh: 'Split mesh', export: 'Export', working: 'Working…' }) },
})
defineEmits(['split', 'export-package'])
</script>
```

- [ ] **Step 4: Run tests, expect PASS.**

- [ ] **Step 5: Commit** — `feat: add MobileActionBar component`.

---

## Task 7: `CanvasUploadOverlay` component

**Files:**
- Create: `frontend/src/components/CanvasUploadOverlay.vue`
- Test: `frontend/src/components/__tests__/CanvasUploadOverlay.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasUploadOverlay from '../CanvasUploadOverlay.vue'

describe('CanvasUploadOverlay', () => {
  it('shows the upload prompt when no mesh is loaded', () => {
    const wrapper = mount(CanvasUploadOverlay, { props: { hasMesh: false } })
    expect(wrapper.find('[data-testid="canvas-dropzone"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="canvas-replace"]').exists()).toBe(false)
  })
  it('shows only the Replace button when a mesh is loaded', () => {
    const wrapper = mount(CanvasUploadOverlay, { props: { hasMesh: true } })
    expect(wrapper.find('[data-testid="canvas-dropzone"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="canvas-replace"]').exists()).toBe(true)
  })
  it('emits upload when a valid file is selected', async () => {
    const wrapper = mount(CanvasUploadOverlay, { props: { hasMesh: false } })
    const input = wrapper.find('input[type="file"]')
    const file = new File([new Uint8Array(10)], 'a.stl', { type: 'model/stl' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    expect(wrapper.emitted('upload')?.[0][0]).toBe(file)
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** (reuses `useFileUpload`)

```html
<template>
  <div class="canvas-upload">
    <input ref="fileInput" type="file" accept=".stl" class="hidden" @change="onFileSelected" />
    <button v-if="!hasMesh" type="button" class="canvas-dropzone" data-testid="canvas-dropzone"
            @click="browse" @dragover.prevent @drop.prevent="onDrop">
      <UploadIcon :size="26" :stroke-width="1.5" />
      <span class="canvas-dropzone__title">{{ labels.uploadTitle }}</span>
      <span class="canvas-dropzone__hint">{{ labels.uploadHint }}</span>
      <span v-if="localError" class="canvas-dropzone__err">{{ localError }}</span>
    </button>
    <button v-else type="button" class="canvas-replace" data-testid="canvas-replace"
            :aria-label="labels.replace" @click="browse">
      <UploadIcon :size="14" :stroke-width="1.75" /> {{ labels.replace }}
    </button>
  </div>
</template>

<script setup>
import { Upload as UploadIcon } from '@lucide/vue'
import { useFileUpload } from '@/composables/useFileUpload'
const props = defineProps({
  hasMesh: { type: Boolean, default: false },
  labels: { type: Object, default: () => ({ uploadTitle: 'Upload an STL file', uploadHint: 'Tap to browse', replace: 'Replace', selectStl: 'Please select an .stl file', fileTooLarge: 'File is too large. Maximum size is 200 MB.' }) },
})
const emit = defineEmits(['upload'])
const { fileInput, localError, browse, onFileSelected, onDrop } = useFileUpload(emit, props.labels)
</script>
```

- [ ] **Step 4: Run tests, expect PASS.**

- [ ] **Step 5: Commit** — `feat: add CanvasUploadOverlay component`.

---

## Task 8: Wire mobile arrangement into `App.vue`

**Files:**
- Modify: `frontend/src/App.vue`

No new unit test (integration verified visually in Task 10). Each step is a self-contained edit.

- [ ] **Step 1: Imports + state.** Add:

```js
import { useIsMobile } from './composables/useIsMobile'
import AccordionSection from './components/AccordionSection.vue'
import MobileActionBar from './components/MobileActionBar.vue'
import CanvasUploadOverlay from './components/CanvasUploadOverlay.vue'
import { Box as BoxIcon, Ruler2 as RulerIcon, Layers2 as LayersIcon } from '@lucide/vue'
const isMobile = useIsMobile()
const openSection = ref('volume')
function toggleSection(name) { openSection.value = openSection.value === name ? null : name }
const splitConfigRef = ref(null)
function onMobileSplit() { splitConfigRef.value?.requestSplit() }
```

- [ ] **Step 2: Header — hide chips/buttons on mobile.** Add `v-if="!isMobile"` to the `.app-status` block (the status chips) and to the "Buy credits" `<Button>` in `.header-right`. Keep the theme toggle, language toggle, and (already-visible) credits chip. Add the credits chip into `.header-right` for mobile if it currently only lives in `.app-status`: render a mobile credits chip with `v-if="isMobile"` calling `showCreditDialog` (reuse `creditChipText`).

- [ ] **Step 3: Canvas overlay.** Inside `.col-center`, after the `<Card>`/`ThreePreview`, add (mobile only):

```html
<CanvasUploadOverlay v-if="isMobile" :has-mesh="!!meshInfo" :labels="uiCopy.uploader" @upload="onUpload" />
```

- [ ] **Step 4: Desktop uploader hidden on mobile.** Wrap the `<MeshUploader .../>` in `.col-left` with `v-if="!isMobile"`.

- [ ] **Step 5: Mobile parts list.** Pass `:compact="isMobile"` to `<PartList ... />`.

- [ ] **Step 6: Accordion config on mobile.** In `.col-right`, render two branches:

```html
<template v-if="isMobile">
  <AccordionSection :title="uiCopy.buildVolume.title" :icon="BoxIcon" :open="openSection==='volume'" @toggle="toggleSection('volume')">
    <BuildVolumeConfig v-model="buildVolume" :labels="uiCopy.buildVolume" />
  </AccordionSection>
  <AccordionSection :title="uiCopy.scaleConfig.title" :icon="RulerIcon" :open="openSection==='scale'" @toggle="toggleSection('scale')">
    <ScaleConfig v-model="scaleInput" :enabled="!!meshInfo" :loading="loading" :mesh-info="meshInfo" :labels="uiCopy.scaleConfig" @apply="onScaleApply" />
  </AccordionSection>
  <AccordionSection :title="uiCopy.splitConfig.title" :icon="LayersIcon" :open="openSection==='split'" @toggle="toggleSection('split')">
    <SplitConfig ref="splitConfigRef" :v="buildVolume" :ok="canSplitMesh" :loading="splitAuthorizing || loading" :progress-label="progressLabel" :divisions="divisions" :labels="uiCopy.splitConfig" :show-split-button="false" @split="onSplit" />
  </AccordionSection>
</template>
<template v-else>
  <!-- existing desktop BuildVolumeConfig / ScaleConfig / SplitConfig / ExportPanel unchanged -->
</template>
```

Keep `ExportPanel` rendering on desktop only (`v-if="!isMobile"`); the mobile export lives in the action bar.

- [ ] **Step 7: Mobile action bar.** As the last child of `.app-shell` (after `.workspace-grid`), add:

```html
<MobileActionBar v-if="isMobile" :can-split="canSplitMesh" :has-chunks="chunks.length > 0 && canSplitMesh"
  :loading="loading || exportingPackage || splitAuthorizing" :progress-label="progressLabel"
  :cost="exportCost" :labels="uiCopy.mobileActionBar" @split="onMobileSplit" @export-package="onExportPackage" />
```

- [ ] **Step 8: Labels.** Add `mobileActionBar: { splitMesh: 'Split', export: 'Export', working: 'Working…' }` to both `en` and `th` `appTranslations`. Ensure `uiCopy.buildVolume.title`, `uiCopy.scaleConfig.title`, `uiCopy.splitConfig.title` exist (they do).

- [ ] **Step 9: Run the full unit suite** — `npx vitest run` — expect all green (no regressions; new components already covered).

- [ ] **Step 10: Commit** — `feat: mobile arrangement wiring in App`.

---

## Task 9: Mobile layout CSS

**Files:**
- Modify: `frontend/src/style.css` (the existing `@media (max-width: 700px)` block, ~line 2266)

- [ ] **Step 1: Shell + zones.** Replace the mobile `.app-shell`/`.workspace-grid`/`.col-*` rules so the shell is a fixed-height flex column that does not page-scroll, the canvas is pinned, and only the middle scrolls:

```css
.app-shell { height: 100dvh; min-height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }
.workspace-grid { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.col-center { order: 1; flex: none; height: 60vh; min-height: 0; }
.col-left  { order: 2; flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.col-right { order: 3; flex: none; }
```

Note: `.col-left` holds the parts list and scrolls; `.col-right` (accordion) sits below it inside the same scroll region — to keep both in one scroll area, wrap `.col-left` + `.col-right` so they share `overflow-y: auto`. Simplest: set `.workspace-grid` children `.col-left, .col-right { overflow: visible; }` and make a shared scroll container by giving `.workspace-grid` `overflow-y: auto` for the non-canvas part. Implement by ordering: `.col-center` (sticky, `position: sticky; top: 0`) inside a scrolling `.workspace-grid`. Use:

```css
.workspace-grid { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; }
.col-center { order: 1; position: sticky; top: 0; z-index: 5; height: 60vh; flex: none; background: var(--steel-50); }
.col-left { order: 2; }
.col-right { order: 3; padding-bottom: 8px; }
```

- [ ] **Step 2: Hide desktop-only canvas chrome on mobile.** Confirm/extend existing rules:

```css
.canvas-inspector, .canvas-label, .canvas-version { display: none; }
```

(`.canvas-hint`, `.canvas-drag-tip` already hidden.)

- [ ] **Step 3: Action bar spacing.** Reserve space so the fixed bar doesn't cover content:

```css
.mobile-action-bar {
  flex: none; display: flex; gap: 10px; padding: 8px 12px;
  border-top: 1px solid var(--steel-200); background: oklch(var(--card));
}
.mobile-action-bar .mab-btn { flex: 1; min-height: 44px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 1px; }
.mab-btn--export { background: oklch(var(--card)); border: 1px solid var(--signal-300);
  border-radius: var(--radius-sm); color: var(--signal-700); font-size: 13px; font-weight: 600; }
.mab-btn--export:disabled { opacity: 0.5; }
.mab-btn--export small { font-size: 10px; font-weight: 400; }
```

Because `.mobile-action-bar` is a flex child of `.app-shell` (not the scrolling `.workspace-grid`), it stays pinned at the bottom without `position: fixed`.

- [ ] **Step 4: Canvas upload overlay + accordion styles.**

```css
.canvas-upload { position: absolute; inset: 0; pointer-events: none; }
.canvas-dropzone { pointer-events: auto; position: absolute; inset: 12px; display: flex;
  flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  border: 1.5px dashed var(--steel-300); border-radius: var(--radius-sm);
  background: oklch(var(--card) / 0.6); color: var(--steel-500); }
.canvas-dropzone__title { font-size: 14px; font-weight: 600; color: oklch(var(--primary)); }
.canvas-dropzone__hint { font-size: 12px; }
.canvas-dropzone__err { font-size: 12px; color: oklch(var(--destructive)); }
.canvas-replace { pointer-events: auto; position: absolute; top: 10px; right: 10px;
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 11px;
  background: oklch(var(--card)); border: 1px solid var(--steel-300); border-radius: var(--radius-sm); }
.acc-section + .acc-section { border-top: 0; }
.acc-head { width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; background: oklch(var(--card)); border: 0; border-bottom: 1px solid var(--steel-200); }
.acc-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;
  font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--steel-600); }
.acc-chevron { color: var(--steel-400); transition: transform 120ms var(--ease-standard); }
```

The `.canvas-upload` overlay must sit inside a positioned `.col-center` (it is `position: relative`).

- [ ] **Step 5: Header mobile credits chip** (if added in Task 8 step 2): ensure it shows only on mobile via the `v-if`, no extra CSS needed beyond the existing `.credit-chip` styles.

- [ ] **Step 6: Commit** — `feat: mobile layout CSS`.

---

## Task 10: Manual verification (mobile viewport)

**Files:** none (verification only).

- [ ] **Step 1:** Start the dev server (`npm run dev`) and open the preview at a 390×844 viewport (iPhone-class) via devtools/preview tools.
- [ ] **Step 2: Empty state** — confirm: slim top bar (only title/theme/lang/credits), canvas fills ~60vh directly under the bar with the centered "Upload an STL file" prompt, parts list empty hint below, accordion with Build volume open, Split/Export disabled in the pinned bottom bar.
- [ ] **Step 3: Load `temp/bandtray.stl`** (inject via the file input) — confirm: model renders in the pinned canvas, no mesh-details overlay, corner Replace button present, parts list compact (swatch + label only), canvas orbits with drag without the page scrolling.
- [ ] **Step 4: Accordion** — open Scale, then Split & connectors; confirm only one is open at a time.
- [ ] **Step 5: Action bar states** — non-watertight mesh → Split + Export disabled; after a successful split of a watertight mesh → Export enabled with the credit cost label.
- [ ] **Step 6: Desktop unchanged** — resize to >700px; confirm the three-column desktop layout and all four config panels render exactly as before.
- [ ] **Step 7:** Screenshot empty + loaded mobile states for the PR.

---

## Self-review notes

- Spec coverage: top bar (T8.2), sticky canvas + hidden overlay (T9.1–9.2), compact parts (T3), accordion one-open (T4 + T8.6), fixed action bar (T6 + T9.3), upload-as-empty-state + corner Replace (T7 + T2), desktop untouched (`isMobile`/`v-if` + `@media` scoping), disabled states (T6/T8.7). All covered.
- The CSS in Task 9 Step 1 intentionally supersedes the exploratory first code block with the sticky-canvas version — implement the second block.
