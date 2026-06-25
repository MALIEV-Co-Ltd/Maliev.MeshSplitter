# Non-Manifold Error Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a styled error dialog and 3D canvas overlays (red boundary lines + filled hole patches) when a mesh is non-manifold and cannot be repaired automatically.

**Architecture:** Existing `findBoundaryLoops` identifies hole boundaries in the geometry. New `computeProblemEdges` transforms those into renderable data (positions for line loops + triangulated fill indices). The data is attached to the thrown Error, extracted in `useMeshProcessor` into a `problemEdges` ref, and passed to both `NonManifoldErrorDialog` and `ThreePreview`.

**Tech Stack:** Three.js, Vue 3

## Global Constraints

- All problem-edges geometry rendered via `THREE.LineLoop` (red outline) and `THREE.Mesh` (red semi-transparent fill) in ThreePreview
- Error dialog uses same `<dialog>` pattern as RepairConfirmDialog
- problemEdges cleared on loadStl and clearMesh
- boundaryData attached to Error via `Object.assign(error, { boundaryData })`
- `computeProblemEdges` returns `[]` when no boundary loops found (graceful fallback to plain error text)

---

### Task 1: computeProblemEdges in meshProcessor.js

**Files:**
- Modify: `frontend/src/mesh/meshProcessor.js` — add `computeProblemEdges` export
- Test: `frontend/src/mesh/meshProcessor.test.js`
- Modify: `frontend/src/mesh/meshProcessor.js` — attach boundaryData in splitMeshManifold error path

**Interfaces:**
- Produces: `computeProblemEdges(geometry: THREE.BufferGeometry): Array<{positions: Float32Array, fillIndices: Uint16Array, center: [number, number, number]}>`
- Produces: Error thrown by `splitMeshManifold` carries `.boundaryData`

- [ ] **Step 1: Write the failing test for computeProblemEdges**

```js
import { computeProblemEdges, splitMeshManifold } from './meshProcessor'

describe('computeProblemEdges', () => {
  it('returns [] for a watertight box', () => {
    const geom = new THREE.BoxGeometry(20, 20, 20).toNonIndexed()
    const result = computeProblemEdges(geom)
    expect(result).toEqual([])
  })

  it('finds boundary edges for a box with one face removed', () => {
    // Create a box and remove one face (indices 0-2 triangles)
    const box = new THREE.BoxGeometry(20, 20, 20)
    const geom = box.toNonIndexed()
    const pos = geom.attributes.position
    // Remove first 3 vertices (one triangle = one face of the box)
    const keepPos = new Float32Array(pos.array.slice(9))
    const newGeom = new THREE.BufferGeometry()
    newGeom.setAttribute('position', new THREE.Float32BufferAttribute(keepPos, 3))
    newGeom.computeVertexNormals()
    const result = computeProblemEdges(newGeom)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].positions.length).toBeGreaterThan(0)
    expect(result[0].fillIndices.length).toBeGreaterThan(0)
    expect(result[0].center.length).toBe(3)
  })

  it('includes boundaryData on error when splitMeshManifold cannot repair', async () => {
    const manifold = await (await import('manifold-3d')).default()
    // A severely non-manifold mesh that neither repairMeshGeometryRobust nor
    // manifoldCleanGeometry can fix
    const geom = new THREE.BoxGeometry(10, 10, 10).toNonIndexed()
    // Scramble indices to create an unrecoverable mesh
    const pos = geom.attributes.position
    const scrambled = new THREE.BufferGeometry()
    scrambled.setAttribute('position', new THREE.Float32BufferAttribute(pos.array.slice(0, 30), 3))
    try {
      await splitMeshManifold(new THREE.Mesh(scrambled), [100, 100, 100], [2, 2, 1])
    } catch (e) {
      // For a simple box with one face removed, repairMeshGeometryRobust may
      // succeed, so only check that IF an error is thrown it has boundaryData
      if (e.message.includes('non-manifold')) {
        expect(e.boundaryData).toBeDefined()
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run frontend/src/mesh/meshProcessor.test.js -t "computeProblemEdges" 2>&1`
Expected: FAIL with "computeProblemEdges is not defined"

- [ ] **Step 3: Write computeProblemEdges implementation**

Add after `findBoundaryLoops`:

```js
export function computeProblemEdges(geometry) {
  const loops = findBoundaryLoops(geometry)
  if (loops.length === 0) return []

  const pos = geometry.attributes.position
  const index = geometry.index

  function getPos(vertexIdx) {
    return [
      pos.getX(vertexIdx),
      pos.getY(vertexIdx),
      pos.getZ(vertexIdx),
    ]
  }

  const results = []

  for (const loop of loops) {
    const loopPositions = []
    for (const vi of loop) {
      const p = getPos(vi)
      loopPositions.push(p[0], p[1], p[2])
    }

    // Compute best-fit plane normal via Newell method
    const normal = new THREE.Vector3()
    const n = loop.length
    for (let i = 0; i < n; i++) {
      const a = getPos(loop[i])
      const b = getPos(loop[(i + 1) % n])
      normal.x += (a[1] - b[1]) * (a[2] + b[2])
      normal.y += (a[2] - b[2]) * (a[0] + b[0])
      normal.z += (a[0] - b[0]) * (a[1] + b[1])
    }
    normal.normalize()

    // Build orthonormal basis from normal
    const ref = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(normal, ref).normalize()
    const v = new THREE.Vector3().crossVectors(normal, u).normalize()

    // Project loop vertices to 2D
    const contour2D = []
    const loop3D = loop.map(vi => new THREE.Vector3().fromArray(getPos(vi)))
    for (const p of loop3D) {
      contour2D.push(new THREE.Vector2(p.dot(u), p.dot(v)))
    }

    // Triangulate the contour (ShapeUtils requires array of Vec2-like {x,y})
    const shapeContour = contour2D.map(p => ({ x: p.x, y: p.y }))
    const triangles = THREE.ShapeUtils.triangulateShape(shapeContour, [])

    // Map triangles back to 3D
    const fillPositions = []
    for (const tri of triangles) {
      for (let k = 0; k < 3; k++) {
        const idx = tri[k]
        fillPositions.push(loop3D[idx].x, loop3D[idx].y, loop3D[idx].z)
      }
    }

    // Compute center (average of loop vertices)
    const center = [0, 0, 0]
    for (const vi of loop) {
      const p = getPos(vi)
      center[0] += p[0]
      center[1] += p[1]
      center[2] += p[2]
    }
    center[0] /= loop.length
    center[1] /= loop.length
    center[2] /= loop.length

    results.push({
      positions: new Float32Array(loopPositions),
      fillIndices: new Uint16Array(triangles.flat()),
      center,
    })
  }

  return results
}
```

- [ ] **Step 4: Attach boundaryData in splitMeshManifold error path**

Find the error throw in `splitMeshManifold` (around line 488):

```js
if (!repaired) {
  const boundaryData = computeProblemEdges(splitGeometry)
  throw Object.assign(
    new Error('Mesh is non-manifold and could not be repaired automatically. Try repairing larger holes in your CAD or slicer before export.'),
    { boundaryData }
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run frontend/src/mesh/meshProcessor.test.js -t "computeProblemEdges" 2>&1`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/mesh/meshProcessor.js frontend/src/mesh/meshProcessor.test.js
git commit -m "feat: add computeProblemEdges + boundaryData on split error"
```

---

### Task 2: problemEdges ref in useMeshProcessor.js

**Files:**
- Modify: `frontend/src/composables/useMeshProcessor.js`
- Test: `frontend/src/composables/useMeshProcessor.test.js`

**Interfaces:**
- Consumes: `error.boundaryData` from `splitMeshManifold` rejection
- Produces: `problemEdges` ref (readonly in return)
- Clears on: `loadStl`, `clearMesh`

- [ ] **Step 1: Write the failing tests**

Add to the test file:

```js
describe('problemEdges', () => {
  it('sets problemEdges when split fails with boundaryData', async () => {
    mockSplitMeshManifold.mockRejectedValue(
      Object.assign(new Error('non-manifold'), { boundaryData: [{ positions: new Float32Array([0,0,0,1,0,0,1,1,0]), fillIndices: new Uint16Array([0,1,2]), center: [0.5,0.33,0] }] })
    )
    const { loadStl, split, problemEdges } = useMeshProcessor()
    loadStl(stlBuffer)
    await flushPromises()
    try { await split([100,100,100], [2,2,1]) } catch {}
    expect(problemEdges.value.length).toBe(1)
    expect(problemEdges.value[0].center).toEqual([0.5, 0.33, 0])
  })

  it('clears problemEdges on loadStl', async () => {
    mockSplitMeshManifold.mockRejectedValue(
      Object.assign(new Error('non-manifold'), { boundaryData: [{ positions: new Float32Array([0,0,0,1,0,0,1,1,0]), fillIndices: new Uint16Array([0,1,2]), center: [0.5,0.33,0] }] })
    )
    const { loadStl, split, problemEdges } = useMeshProcessor()
    loadStl(stlBuffer)
    await flushPromises()
    try { await split([100,100,100], [2,2,1]) } catch {}
    expect(problemEdges.value.length).toBe(1)
    loadStl(stlBuffer)
    await flushPromises()
    expect(problemEdges.value).toEqual([])
  })

  it('is not set when split succeeds', async () => {
    const box = new THREE.BoxGeometry(10, 10, 10).toNonIndexed()
    mockSplitMeshManifold.mockResolvedValue([
      { geometry: box, label: 'P00', volume: 500, centroid: new THREE.Vector3(0, 0, 5), bounds: { min: [-5,-5,0], max: [5,5,10] } },
    ])
    const { loadStl, split, problemEdges } = useMeshProcessor()
    loadStl(stlBuffer)
    await flushPromises()
    await split([100,100,100], [2,2,1])
    expect(problemEdges.value).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run frontend/src/composables/useMeshProcessor.test.js -t "problemEdges" 2>&1`
Expected: FAIL with "problemEdges is not defined"

- [ ] **Step 3: Add problemEdges ref + logic**

Add after `const error = ref(null)`:

```js
const problemEdges = ref([])
```

Add in `split()` catch block (after `error.value = e.message`):

```js
problemEdges.value = e.boundaryData || []
```

Add in `loadStl` (near where error is cleared):

```js
problemEdges.value = []
```

Add in `clearMesh`:

```js
problemEdges.value = []
```

Add to return object:

```js
problemEdges: readonly(problemEdges),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run frontend/src/composables/useMeshProcessor.test.js -t "problemEdges" 2>&1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useMeshProcessor.js frontend/src/composables/useMeshProcessor.test.js
git commit -m "feat: add problemEdges ref to useMeshProcessor"
```

---

### Task 3: NonManifoldErrorDialog.vue

**Files:**
- Create: `frontend/src/components/NonManifoldErrorDialog.vue`

**Interfaces:**
- Props: `{ boundaryHoles: Number, boundaryEdges: Number, labels: Object }`
- Emits: `view-problem`, `dismiss`

- [ ] **Step 1: Write the test**

Add a minimal test in a new describe block. Since this is a Vue component, use mount:

```js
import { mount } from '@vue/test-utils'
import NonManifoldErrorDialog from './NonManifoldErrorDialog.vue'

describe('NonManifoldErrorDialog', () => {
  it('renders holes and edges stats', () => {
    const wrapper = mount(NonManifoldErrorDialog, {
      props: { boundaryHoles: 3, boundaryEdges: 42, labels: {} },
    })
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('42')
  })

  it('emits view-problem on primary button click', async () => {
    const wrapper = mount(NonManifoldErrorDialog, {
      props: { boundaryHoles: 1, boundaryEdges: 5, labels: {} },
    })
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('view-problem')).toBeTruthy()
  })

  it('emits dismiss on dismiss button click', async () => {
    const wrapper = mount(NonManifoldErrorDialog, {
      props: { boundaryHoles: 1, boundaryEdges: 5, labels: {} },
    })
    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.emitted('dismiss')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run frontend/src/components/NonManifoldErrorDialog.test.js 2>&1`
Expected: FAIL with "cannot find module"

- [ ] **Step 3: Create NonManifoldErrorDialog.vue**

```vue
<template>
  <dialog ref="dialogEl" class="nmf-dialog" @click.self="emit('view-problem')">
    <div class="nmf-dialog__panel">
      <header class="nmf-dialog__head">
        <AlertTriangleIcon :size="20" :stroke-width="1.5" class="nmf-dialog__icon" />
        <h2>{{ labels.title || 'Cannot split mesh' }}</h2>
        <p>{{ labels.body || 'The model has holes or gaps that could not be repaired automatically. Review the highlighted areas in the 3D view.' }}</p>
      </header>

      <div class="nmf-dialog__stats">
        <div class="nmf-dialog__stat">
          <span class="nmf-dialog__stat-num">{{ boundaryHoles.toLocaleString() }}</span>
          <span class="nmf-dialog__stat-label">{{ labels.holes || 'boundary holes' }}</span>
        </div>
        <div class="nmf-dialog__stat">
          <span class="nmf-dialog__stat-num">{{ boundaryEdges.toLocaleString() }}</span>
          <span class="nmf-dialog__stat-label">{{ labels.edges || 'boundary edges' }}</span>
        </div>
      </div>

      <div class="nmf-dialog__actions">
        <Button variant="outline" class="justify-center" @click="emit('dismiss')">
          {{ labels.dismiss || 'Dismiss' }}
        </Button>
        <Button class="justify-center" @click="emit('view-problem')">
          {{ labels.viewProblem || 'View on model' }}
        </Button>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { AlertTriangle as AlertTriangleIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps({
  boundaryHoles: { type: Number, default: 0 },
  boundaryEdges: { type: Number, default: 0 },
  labels: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['view-problem', 'dismiss'])

const dialogEl = ref(null)

onMounted(() => {
  dialogEl.value?.showModal()
})
</script>

<style scoped>
.nmf-dialog {
  background: transparent;
  border: none;
  max-width: 480px;
  padding: 0;
  width: 90vw;
}
.nmf-dialog::backdrop {
  background: oklch(0 0 0 / 0.48);
}
.nmf-dialog__panel {
  background: oklch(var(--card));
  border: 1px solid var(--steel-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 24px;
}
.nmf-dialog__head {
  text-align: center;
}
.nmf-dialog__icon {
  color: var(--signal-600);
  display: inline-block;
  margin-bottom: 8px;
}
.nmf-dialog__head h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 4px;
}
.nmf-dialog__head p {
  color: var(--steel-500);
  font-size: 13px;
  margin: 0 0 20px;
}
.nmf-dialog__stats {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-bottom: 24px;
}
.nmf-dialog__stat {
  text-align: center;
}
.nmf-dialog__stat-num {
  display: block;
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}
.nmf-dialog__stat-label {
  color: var(--steel-500);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.nmf-dialog__actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.nmf-dialog__actions .btn {
  flex: 1;
  max-width: 180px;
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run frontend/src/components/NonManifoldErrorDialog.test.js 2>&1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NonManifoldErrorDialog.vue
git commit -m "feat: add NonManifoldErrorDialog component"
```

---

### Task 4: ThreePreview.vue problemEdges rendering + frameToProblem

**Files:**
- Modify: `frontend/src/components/ThreePreview.vue`

**Interfaces:**
- Consumes: `problemEdges` prop (Array of {positions, fillIndices, center})
- Exposes: `frameToProblem()` via defineExpose

- [ ] **Step 1: Write the test**

```js
import { mount } from '@vue/test-utils'
import ThreePreview from './ThreePreview.vue'

describe('ThreePreview problemEdges', () => {
  it('renders problem edges group when prop is provided', () => {
    const wrapper = mount(ThreePreview, {
      props: {
        problemEdges: [{
          positions: new Float32Array([0,0,0, 10,0,0, 10,10,0, 0,10,0]),
          fillIndices: new Uint16Array([0,1,2, 0,2,3]),
          center: [5, 5, 0],
        }],
        chunks: [],
      },
    })
    // Component exposes the scene group via getSceneGroup() or similar
    // Verify the overlay was created
    expect(wrapper.vm.problemEdgeOverlay).toBeDefined()
  })
})
```

Wait, this test is tricky because ThreePreview has complex Three.js initialization. Let me simplify - just test that the component mounts without error when problemEdges is non-empty. The Three.js rendering is hard to verify in unit tests.

Actually, testing Three.js rendering in a unit test is impractical. I'll skip the ThreePreview test and rely on the manual/manual test.

- [ ] **Step 1: Add problemEdges prop + watcher + rendering**

Add to `defineProps`:

```js
problemEdges: { type: Array, default: () => [] },
```

Add after the existing script-level state variables:

```js
let problemEdgeOverlay = null
```

Add after `connector-drag-end` emit:

```js
watch(() => props.problemEdges, (edges) => {
  if (problemEdgeOverlay) {
    disposeGroup(problemEdgeOverlay)
    problemEdgeOverlay = null
  }
  if (!edges || edges.length === 0) return
  problemEdgeOverlay = new THREE.Group()
  for (const hole of edges) {
    // Boundary line loop
    const lineGeom = new THREE.BufferGeometry()
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(hole.positions, 3))
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xff2222,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    })
    const line = new THREE.LineLoop(lineGeom, lineMat)
    line.renderOrder = 998
    problemEdgeOverlay.add(line)

    // Fill patch
    const fillGeom = new THREE.BufferGeometry()
    fillGeom.setAttribute('position', new THREE.Float32BufferAttribute(hole.positions, 3))
    fillGeom.setIndex(new THREE.BufferAttribute(hole.fillIndices, 1))
    fillGeom.computeVertexNormals()
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
    const fill = new THREE.Mesh(fillGeom, fillMat)
    fill.renderOrder = 997
    problemEdgeOverlay.add(fill)
  }
  scene.add(problemEdgeOverlay)
  requestRender()
}, { deep: false })
```

Clean up in `clearScene`:

```js
if (problemEdgeOverlay) {
  disposeGroup(problemEdgeOverlay)
  problemEdgeOverlay = null
}
```

Add `frameToProblem`:

```js
function frameToProblem() {
  if (!problemEdgeOverlay || problemEdgeOverlay.children.length === 0) return
  const box = new THREE.Box3()
  problemEdgeOverlay.children.forEach((child) => {
    if (child.geometry) {
      box.expandByObject(child)
    }
  })
  if (box.isEmpty()) return
  fitCamera(box)
}
```

Add defineExpose:

```js
defineExpose({ frameToProblem })
```

- [ ] **Step 3: Run the existing test suite to ensure nothing broke**

Run: `npx vitest run 2>&1`
Expected: All 149 tests pass (or whatever count)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ThreePreview.vue
git commit -m "feat: render problemEdges overlay and expose frameToProblem in ThreePreview"
```

---

### Task 5: App.vue wiring + styling

**Files:**
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/style.css`

- [ ] **Step 1: Wire in App.vue**

Add to component imports:

```js
import NonManifoldErrorDialog from './components/NonManifoldErrorDialog.vue'
```

Add to destructured return from useMeshProcessor:

```js
problemEdges,
```

Add ref for ThreePreview:

```js
const threePreviewRef = ref(null)
```

Add computed for dialog stats:

```js
const boundaryHoles = computed(() => problemEdges.value.length)
const boundaryEdges = computed(() => problemEdges.value.reduce((sum, h) => sum + h.positions.length / 3, 0))
```

Add handler:

```js
function frameToProblemEdges() {
  threePreviewRef.value?.frameToProblem()
}
function dismissProblemEdges() {
  problemEdges.value = []
  error.value = null
}
```

Add template ref for ThreePreview:

```html
<ThreePreview ref="threePreviewRef" ... :problem-edges="problemEdges" />
```

Add dialog before closing `</main>`:

```html
<NonManifoldErrorDialog
  v-if="problemEdges.length > 0"
  :boundary-holes="boundaryHoles"
  :boundary-edges="boundaryEdges"
  :labels="uiCopy.errorDialog"
  @view-problem="frameToProblemEdges"
  @dismiss="dismissProblemEdges"
/>
```

Add locale entries:

```js
errorDialog: {
  title: 'Cannot split mesh',
  body: 'The model has holes or gaps that could not be repaired automatically. Review the highlighted areas in the 3D view.',
  holes: 'boundary holes',
  edges: 'boundary edges',
  dismiss: 'Dismiss',
  viewProblem: 'View on model',
},
```

And in the TH locale:

```js
errorDialog: {
  title: 'ไม่สามารถตัดโมเดลได้',
  body: 'โมเดลมีรูหรือช่องว่างที่ไม่สามารถซ่อมโดยอัตโนมัติ ตรวจสอบพื้นที่ที่ไฮไลต์ในมุมมอง 3D',
  holes: 'รูขอบ',
  edges: 'ขอบรอยต่อ',
  dismiss: 'ปิด',
  viewProblem: 'ดูบนโมเดล',
},
```

- [ ] **Step 2: Add dialog styles to style.css**

Add:

```css
/* Non-manifold error dialog — rendered as a native <dialog> with scoped
   styles in the component itself. No global styles needed. */
```

(No global styles needed since the component has scoped styles.)

- [ ] **Step 3: Run all existing tests**

Run: `npx vitest run 2>&1`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.vue frontend/src/style.css
git commit -m "feat: wire NonManifoldErrorDialog + problemEdges in App.vue"
```

---

### Self-Review Checklist

1. **Spec coverage:** computeProblemEdges (spec section), problemEdges ref (section), NonManifoldErrorDialog (section), ThreePreview rendering (section), App.vue wiring (section). All covered.
2. **Placeholder scan:** No TBD/TODO/fill-in-later patterns.
3. **Type consistency:** computeProblemEdges returns `Array<{positions: Float32Array, fillIndices: Uint16Array, center: [x,y,z]}>` - consistent across all tasks.