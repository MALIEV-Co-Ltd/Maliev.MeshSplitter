- [ ] **Step 4: Update vite.config.js** - add @ alias, remove proxy

`js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: { port: 5173 },
})
`

- [ ] **Step 5: Create components.json**

`json
{
  "\": "https://shadcn-vue.com/schema.json",
  "style": "new-york",
  "typescript": true,
  "tsConfigPath": "tsconfig.json",
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/style.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "composables": "@/composables",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib"
  },
  "iconLibrary": "lucide"
}
`

- [ ] **Step 6: Create lib/utils.ts**

`	s
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`

- [ ] **Step 7: Install clsx and tailwind-merge**

Run: 
pm install clsx tailwind-merge

- [ ] **Step 8: Add shadcn-vue CSS variables to style.css**

Replace style.css with the shadcn-vue new-york/zinc CSS variables (see https://ui.shadcn.com/docs/themes for the canonical list).

- [ ] **Step 9: Add shadcn-vue components via CLI**

Run:
`
npx shadcn-vue@latest add button -y
npx shadcn-vue@latest add card -y
npx shadcn-vue@latest add input -y
npx shadcn-vue@latest add label -y
npx shadcn-vue@latest add slider -y
npx shadcn-vue@latest add radio-group -y
npx shadcn-vue@latest add badge -y
`

- [ ] **Step 10: Create vitest.config.js**

`js
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.{js,ts}'] },
})
`

- [ ] **Step 11: Commit**

`
git rm frontend/tailwind.config.cjs
git add frontend/tsconfig.json frontend/components.json frontend/vite.config.js frontend/vitest.config.js frontend/src/lib/ frontend/src/style.css frontend/package.json frontend/tailwind.config.js
git commit -m "feat: add TypeScript, shadcn-vue, and processing deps"
`

---
### Task 2: Core Mesh Processing Engine

**Files:**
- Create: `frontend/src/mesh/meshProcessor.js`
- Create: `frontend/src/mesh/meshProcessor.test.js`

**Interfaces:**
- Consumes: Three.js BufferGeometry from STLLoader
- Produces: `loadStl(ArrayBuffer) -> {geometry, info}`, `validateManifold(geometry) -> {watertight, euler, volume}`, `splitMesh(mesh, volume, divisions) -> Chunk[]`, `addConnectors(chunks, config) -> Chunk[]`, `exportStl(chunks) -> Blob`, `exportPdf(chunks, volume) -> Blob`

- [ ] **Step 1: Write failing tests for meshProcessor**

Test file `frontend/src/mesh/meshProcessor.test.js`:
- `validateManifold` detects box (10x10x10) as watertight
- `validateManifold` detects PlaneGeometry as non-watertight
- `splitMesh` splits box (100x100x100) into 2x2x1 = 4 chunks
- Each chunk has valid geometry (position.count > 0)
- Each chunk is watertight after split
- Empty result for zero divisions
- `addConnectors` adds dowels between adjacent chunks (all stay watertight)
- `computeVolume` returns ~6000 for 10x20x30 box

- [ ] **Step 2: Run to verify they fail**: `npx vitest run src/mesh/meshProcessor.test.js`

- [ ] **Step 3: Implement meshProcessor.js**

Functions:
1. `validateManifold(geometry)` - edge analysis for watertight + Euler check, volume via divergence theorem
2. `computeVolume(geometry)` - signed volume via cross product sum
3. `splitMesh(mesh, buildVolume, gridDivisions)` - uses Brush + Evaluator from three-bvh-csg with INTERSECTION per cell, returns chunks with geometry/label/volume/centroid
4. `addConnectors(chunks, config)` - find adjacent pairs via bbox intersection, create male (ADDITION) and female (SUBTRACTION) cylinders using three-bvh-csg
5. `exportStl(chunks)` - STLExporter + JSZip, returns Blob
6. `exportPdf(chunks, buildVolume)` - jsPDF with cover page + parts table, returns ArrayBuffer

- [ ] **Step 4: Run to verify they pass**: `npx vitest run src/mesh/meshProcessor.test.js`

- [ ] **Step 5: Commit**: `git add frontend/src/mesh/ && git commit -m "feat: browser mesh processing engine"`

---

### Task 3: Vue Composable

**Files:**
- Create: `frontend/src/composables/useMeshProcessor.js`

- [ ] **Step 1: Create useMeshProcessor.js**

Wraps meshProcessor with Vue reactivity. State: meshInfo, meshGeometry, chunks[], loading, error, buildVolume. Methods: loadStl(file), split(bv, divisions), applyConnectors(config), downloadStl(), downloadPdf(), clearMesh(). Each chunk gets a color from a 15-color palette.

- [ ] **Step 2: Commit**: `git add frontend/src/composables/useMeshProcessor.js && git commit -m "feat: Vue composable for browser mesh processing"`

---
### Task 4: Rewrite Components with shadcn-vue

**Files:**
- Rewrite: `frontend/src/components/MeshUploader.vue`
- Rewrite: `frontend/src/components/BuildVolumeConfig.vue`
- Rewrite: `frontend/src/components/SplitConfig.vue`
- Rewrite: `frontend/src/components/ConnectorConfig.vue`
- Rewrite: `frontend/src/components/PartList.vue`
- Rewrite: `frontend/src/components/ExportPanel.vue`
- Rewrite: `frontend/src/components/ThreePreview.vue`
- Rewrite: `frontend/src/App.vue`

**shadcn-vue component mapping:**
- Panels -> Card/CardContent with pt-6
- Buttons -> Button with variant="default"/"outline"/"secondary"
- Number inputs -> Input type="number"
- Labels -> Label
- Sliders -> Slider (v-model as array)
- Connector type -> RadioGroup with card-style RadioGroupItem
- Watertight badge -> Badge variant="default"/"destructive"
- Part list -> Card grid with color dot

**App.vue** wires useMeshProcessor composable. Layout: left column (Upload, Build Vol, Split, Connectors), right column (3D Preview, Part List, Export). All API calls replaced with in-browser processing.

- [ ] **Step 2: Update ThreePreview.vue** for native BufferGeometry (delete `buildMeshes`, new version clones chunk.geometry directly)
- [ ] **Step 3: Rewrite App.vue** — offline data flow, no API calls, use useMeshProcessor
- [ ] **Step 4: Commit**: `git add frontend/src/components/ frontend/src/App.vue && git commit -m "feat: shadcn-vue components with offline processing"`

---

### Task 5: Cleanup & Build Verification

**Files:**
- Delete: `backend/` (entire directory)
- Rewrite: `start.ps1`
- Rename: `frontend/src/main.js` -> `frontend/src/main.ts`
- Modify: `frontend/index.html`

- [ ] **Step 1: Rename main.js to main.ts** and update index.html script tag from `main.js` to `main.ts`
- [ ] **Step 2: Delete backend** : `Remove-Item -Recurse -Force backend`
- [ ] **Step 3: Update start.ps1** — only starts Vite: `npm install && npx vite --open` or just `npx vite`
- [ ] **Step 4: Build verification** : `npx vite build` — must succeed with no errors
- [ ] **Step 5: Run all tests** : `npx vitest run` — all pass
- [ ] **Step 6: Final commit** : `git add -A && git commit -m "refactor: remove backend, fully offline"`

---

### Task 6: Additional Component Tests

**Files:**
- Create: `frontend/src/components/__tests__/MeshUploader.test.js`
- Create: `frontend/src/components/__tests__/BuildVolumeConfig.test.js`

- [ ] **Step 1: Write MeshUploader test** — renders upload prompt, shows mesh info when loaded
- [ ] **Step 2: Write BuildVolumeConfig test** — renders 3 inputs, preset buttons update values
- [ ] **Step 3: Run tests**: `npx vitest run` — all pass
- [ ] **Step 4: Commit**: `git add frontend/src/components/__tests__/ && git commit -m "test: component unit tests"`
