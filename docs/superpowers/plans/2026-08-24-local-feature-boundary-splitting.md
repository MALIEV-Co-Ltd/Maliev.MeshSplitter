# Local Feature- and Color-Boundary Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-local 3MF/OBJ color-aware import, selectable sharp/color boundary splitting, and automatically sized square-taper alignment plugs.

**Architecture:** Normalize every supported input into one geometry-plus-triangle-region contract. Run deterministic edge analysis in a worker, keep rendering separate from geometry decisions, construct selected topology splits locally, and pass the resulting chunks through the existing Manifold WASM connector and export gates.

**Tech Stack:** Vue 3, Three.js loaders, JSZip, Web Workers, Manifold 3D WASM, Vitest, Playwright, Vite.

**Spec:** `docs/superpowers/specs/2026-08-24-feature-boundary-splitting-design.md`

## Global Constraints

- All parsing, analysis, splitting, validation, and export run locally in the browser.
- Do not add ML, remote inference, or mesh-upload services.
- Use fixed PLA density `1.24 g/cm^3` only to select a non-structural alignment size band.
- Feature and color candidates require explicit user selection and confirmation.
- Standard STL remains supported; add 3MF and OBJ with optional companion MTL.
- Color-boundary mode uses mesh-native region/color data, not bitmap textures.
- Existing unrelated dirty work must not be staged or reformatted.
- Every behavior change follows red-green-refactor and every commit follows fresh focused validation.

## File Structure

- Create `frontend/src/mesh/meshImport.js`: format dispatch and normalized mesh contract.
- Create `frontend/src/mesh/meshImport.test.js`: STL, 3MF, OBJ/MTL import and color-contract tests.
- Create `frontend/src/mesh/boundaryAnalysis.js`: pure welded adjacency, loop detection, partitioning, ranking, and color clustering.
- Create `frontend/src/mesh/boundaryAnalysis.test.js`: deterministic synthetic geometry coverage.
- Create `frontend/src/mesh/boundaryAnalysis.worker.js`: worker message adapter.
- Create `frontend/src/mesh/boundaryAnalysisClient.js`: cancellation/revision-aware worker client.
- Create `frontend/src/mesh/boundaryAnalysisClient.test.js`: stale-result and error tests.
- Create `frontend/src/mesh/boundarySplit.js`: topology-following cap construction and planar fallback.
- Create `frontend/src/mesh/boundarySplit.test.js`: manifold result and transactional failure tests.
- Create `frontend/src/mesh/alignmentSizing.js`: PLA estimate and bounded plug sizing.
- Create `frontend/src/mesh/alignmentSizing.test.js`: mass bands and geometric safety tests.
- Modify `frontend/src/mesh/meshProcessor.js`: square-taper plug/pocket Boolean geometry and manifest data.
- Modify `frontend/src/mesh/connectorDimensions.test.js`: taper clearance and plug export regression tests.
- Modify `frontend/src/composables/useMeshProcessor.js`: normalized import, analysis, preview selection, and boundary split state.
- Modify `frontend/src/composables/useMeshProcessor.test.js`: orchestration tests.
- Modify `frontend/src/components/MeshUploader.vue`: multi-file accepted formats.
- Modify `frontend/src/components/SplitConfig.vue`: split modes, candidates, confirmation, automatic sizing checkbox.
- Modify `frontend/src/components/ConnectorConfig.vue`: square-taper type and resolved automatic dimensions.
- Modify `frontend/src/components/ThreePreview.vue`: selectable boundary overlays and prospective chunks.
- Modify corresponding component tests and `frontend/src/App.vue`: state wiring and English/Thai copy.
- Modify `frontend/src/lib/exportIdentity.js` and tests: boundary and resolved connector signatures.
- Modify PDF/export tests in `frontend/src/mesh`: alignment-only copy and plug metadata.
- Create `frontend/e2e/feature-boundary-splitting.spec.js`: accessible end-to-end flow.
- Create `docs/validation/2026-08-24-feature-boundary-models.md`: external model provenance and results.

---

### Task 1: Normalized STL, 3MF, and OBJ/MTL Import

**Files:**
- Create: `frontend/src/mesh/meshImport.js`
- Create: `frontend/src/mesh/meshImport.test.js`
- Modify: `frontend/src/composables/useMeshProcessor.js`
- Modify: `frontend/src/composables/useMeshProcessor.test.js`
- Modify: `frontend/src/components/MeshUploader.vue`
- Modify: `frontend/src/components/__tests__/MeshUploader.test.js`

**Interfaces:**
- Produces: `importMeshFiles(files: File[]): Promise<NormalizedMesh>`.
- `NormalizedMesh` fields: `{ geometry, triangleRegions, regionColors, format, hasColor, warnings, sourceFiles }`.
- Region `0` is valid; `triangleRegions.length` must equal triangle count.

- [ ] **Step 1: Write failing importer tests**

Create minimal in-memory ASCII STL, OBJ/MTL, and zipped 3MF fixtures. Assert geometry, region count, resolved colors, transforms, missing-MTL warning, and rejection of unsupported files:

```js
const imported = await importMeshFiles([objFile, mtlFile])
expect(imported.format).toBe('obj')
expect([...imported.triangleRegions]).toEqual([0, 1])
expect(imported.regionColors.get(1)).toBe(0x00ff00)
expect(imported.hasColor).toBe(true)
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix frontend test -- meshImport.test.js`

Expected: FAIL because `meshImport.js` does not exist.

- [ ] **Step 3: Implement normalized import**

Use Three.js `STLLoader`, `ThreeMFLoader`, `OBJLoader`, and `MTLLoader`. Flatten object transforms into one non-interleaved `BufferGeometry`, preserve triangle material/object assignments, and return a zero-filled region array for uncolored STL. Reject more than one primary model file and accept an optional case-insensitive `.mtl` companion only for OBJ.

- [ ] **Step 4: Wire upload without changing repair semantics**

Replace `loadStl(file)` internals with `loadMesh(files)` while retaining `loadStl(file)` as a compatibility wrapper. Store normalized region metadata beside authoritative geometry. If robust repair replaces geometry, clear region metadata and add the color-boundary-disabled warning.

- [ ] **Step 5: Update uploader and tests**

Set `accept=".stl,.3mf,.obj,.mtl"`, enable `multiple`, emit the selected file array, and show selected companion filenames. Assert keyboard-accessible file replacement and invalid selection copy.

- [ ] **Step 6: Verify GREEN and build**

Run:

```powershell
npm --prefix frontend test -- meshImport.test.js useMeshProcessor.test.js MeshUploader.test.js
npm --prefix frontend run build
```

Expected: all selected tests pass and Vite exits `0` with no warnings.

- [ ] **Step 7: Commit**

Stage only Task 1 files and commit `feat: import colored 3MF and OBJ meshes locally`.

### Task 2: Deterministic Feature and Color Boundary Analysis

**Files:**
- Create: `frontend/src/mesh/boundaryAnalysis.js`
- Create: `frontend/src/mesh/boundaryAnalysis.test.js`
- Create: `frontend/src/mesh/boundaryAnalysis.worker.js`
- Create: `frontend/src/mesh/boundaryAnalysisClient.js`
- Create: `frontend/src/mesh/boundaryAnalysisClient.test.js`

**Interfaces:**
- Produces: `analyzeBoundaries(normalizedMesh, { mode, sharpAngleDeg, maxCandidates }): BoundaryCandidate[]`.
- Candidate: `{ id, mode, score, loops, sideFaces, plane, planarityError, method, metrics }`.
- Produces: `runBoundaryAnalysis(normalizedMesh, options, { signal, revision })` worker client.

- [ ] **Step 1: Write failing pure-analysis tests**

Build indexed synthetic meshes for a stepped cylinder, an open sharp chain, a branched sharp network, two colored regions, near-identical noisy colors, and a color island with an inner loop. Assert only simple closed partitioning loops survive and scores are stable across repeated runs.

```js
const candidates = analyzeBoundaries(mesh, { mode: 'feature', sharpAngleDeg: 40, maxCandidates: 8 })
expect(candidates).toHaveLength(1)
expect(candidates[0].sideFaces.map((side) => side.length).sort((a, b) => a - b)).toEqual([16, 32])
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix frontend test -- boundaryAnalysis.test.js`

Expected: FAIL because the analysis API is missing.

- [ ] **Step 3: Implement welded adjacency and loop ranking**

Use a geometry-scale tolerance, stable vertex/edge keys, face-normal dihedral angles, non-branching loop walking, adjacency-barrier flood fill, projected-loop self-intersection checks, and deterministic tie-breaking by stable edge signature. Rank with bounded normalized terms for sharpness, closure, constriction, planarity, and side balance. Do not assign body-part names.

- [ ] **Step 4: Implement color-region boundaries**

Convert colors to Lab, cluster with a fixed perceptual threshold, mark edges whose two faces resolve to different clusters/regions, retain complete loop sets for islands, and reject non-partitioning boundaries.

- [ ] **Step 5: Add worker and stale-result tests**

Transfer position/index/region buffers to `boundaryAnalysis.worker.js`. In the client, terminate or ignore work when `AbortSignal` fires or revision changes:

```js
if (message.revision !== activeRevision) return
resolve(message.candidates)
```

- [ ] **Step 6: Verify GREEN and performance**

Run: `npm --prefix frontend test -- boundaryAnalysis.test.js boundaryAnalysisClient.test.js performance.test.js`

Expected: tests pass; existing three-second split budget remains green.

- [ ] **Step 7: Commit**

Commit Task 2 files as `feat: detect local mesh split boundaries`.

### Task 3: Topology-Following Boundary Split and Manifold Gate

**Files:**
- Create: `frontend/src/mesh/boundarySplit.js`
- Create: `frontend/src/mesh/boundarySplit.test.js`
- Modify: `frontend/src/mesh/meshProcessor.js`
- Modify: `frontend/src/mesh/meshProcessor.test.js`

**Interfaces:**
- Consumes: `BoundaryCandidate` from Task 2.
- Produces: `splitMeshAtBoundary(mesh, candidate): Promise<Chunk[]>`.
- `Chunk` remains compatible with existing `{ geometry, volume, centroid, index, label, manifoldStatus }` consumers and adds `{ splitBoundaryId, splitMethod }`.

- [ ] **Step 1: Write failing direct-cap tests**

Create a two-region closed tube whose selected ring is an existing edge loop. Assert two non-empty watertight chunks, conserved volume within tolerance, stable labels, and unchanged source geometry.

- [ ] **Step 2: Write failing rejection/fallback tests**

Assert non-planar untriangulatable loops fail transactionally, color candidates never use planar fallback, and an eligible planar feature candidate reports `splitMethod: 'planar-fallback'`.

- [ ] **Step 3: Verify RED**

Run: `npm --prefix frontend test -- boundarySplit.test.js`

Expected: FAIL because boundary splitting is missing.

- [ ] **Step 4: Implement topology partition and caps**

Copy each candidate side's triangles, order each boundary loop, project it into its best-fit frame, triangulate with `THREE.ShapeUtils.triangulateShape`, add opposite-winding caps to the two shells, weld output, and pass each shell through Manifold WASM. Dispose temporary solids in `finally`.

- [ ] **Step 5: Implement constrained planar fallback**

For feature mode only, enforce the candidate planarity limit and unrelated-intersection guard, then reuse the existing Manifold half-space/grid-cut primitives around the fitted plane. Include method and warning in returned chunks.

- [ ] **Step 6: Verify GREEN and regression suite**

Run:

```powershell
npm --prefix frontend test -- boundarySplit.test.js meshProcessor.test.js previewIntegrity.test.js
npm --prefix frontend run build
```

Expected: all pass with no build warnings.

- [ ] **Step 7: Commit**

Commit Task 3 files as `feat: split meshes along selected closed boundaries`.

### Task 4: PLA-Based Automatic Sizing and Square-Taper Plug

**Files:**
- Create: `frontend/src/mesh/alignmentSizing.js`
- Create: `frontend/src/mesh/alignmentSizing.test.js`
- Modify: `frontend/src/mesh/meshProcessor.js`
- Modify: `frontend/src/mesh/connectorDimensions.test.js`

**Interfaces:**
- Produces: `estimatePlaMassGrams(volumeMm3, density = 1.24)`.
- Produces: `sizeAlignmentPlug({ partVolumesMm3, faceAreaMm2, localThicknessMm, clearance, requestedCount }): ResolvedAlignmentConfig`.
- Extends connector type resolution with canonical `square-taper`.

- [ ] **Step 1: Write failing sizing tests**

Assert `1000 mm3` estimates `1.24 g`; small/medium/large parts select monotonic but capped bands; thin walls reduce depth/cross-section; small faces reduce count; impossible faces return `{ viable: false, reason: 'no-safe-fit' }`.

- [ ] **Step 2: Write failing taper geometry tests**

Assert plug tips are smaller than the shoulder, both pockets are symmetric, socket dimensions include clearance, volume is positive, and all three exported solids remain manifold.

- [ ] **Step 3: Verify RED**

Run: `npm --prefix frontend test -- alignmentSizing.test.js connectorDimensions.test.js`

Expected: FAIL for missing sizing API and connector type.

- [ ] **Step 4: Implement conservative size bands**

Use PLA mass only as the initial band. Clamp with face span, boundary margin, and local thickness. Return resolved dimensions and machine-readable reasons. Never expose a structural capacity or load rating.

- [ ] **Step 5: Implement square-taper Boolean shapes**

Construct a centered double-ended tapered square plug with a small shoulder and two clearance-expanded tapered sockets. Integrate it into manifest calculation, whole-footprint sampling, connector movement validation, connector application, labels, and cleanup.

- [ ] **Step 6: Verify GREEN**

Run: `npm --prefix frontend test -- alignmentSizing.test.js connectorDimensions.test.js meshProcessor.test.js`

Expected: all pass.

- [ ] **Step 7: Commit**

Commit Task 4 files as `feat: add automatically sized taper alignment plugs`.

### Task 5: Assisted Selection UI, Preview, and Orchestration

**Files:**
- Modify: `frontend/src/composables/useMeshProcessor.js`
- Modify: `frontend/src/composables/useMeshProcessor.test.js`
- Modify: `frontend/src/components/SplitConfig.vue`
- Modify: `frontend/src/components/__tests__/SplitConfig.test.js`
- Modify: `frontend/src/components/ConnectorConfig.vue`
- Modify: `frontend/src/components/__tests__/ConnectorConfig.test.js`
- Modify: `frontend/src/components/ThreePreview.vue`
- Create: `frontend/src/components/__tests__/ThreePreview.boundaries.test.js`
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Composable adds `splitMode`, `boundaryCandidates`, `selectedBoundaryId`, `boundaryAnalysisState`, `selectBoundary(id)`, `analyzeBoundaries(options)`, and `splitSelectedBoundary(connectorConfig)`.
- `ThreePreview` accepts `boundaryCandidates`, `selectedBoundaryId`, and emits `select-boundary`.

- [ ] **Step 1: Write failing UI/orchestration tests**

Assert three modes, color mode disabled without reliable regions, ranked candidate buttons, keyboard selection, selected overlay, preview-before-confirm, auto-size checkbox default, manual control restoration, analysis cancellation on new mesh, and transactional chunk replacement.

- [ ] **Step 2: Verify RED**

Run: `npm --prefix frontend test -- SplitConfig.test.js ConnectorConfig.test.js ThreePreview.boundaries.test.js useMeshProcessor.test.js`

Expected: FAIL for missing controls and state.

- [ ] **Step 3: Implement composable orchestration**

Analyze a cloned normalized mesh in the worker, create prospective chunks only for the selected revision, apply auto/manual connector config after confirmation, and update authoritative chunks only after all Manifold/export validation succeeds.

- [ ] **Step 4: Implement accessible controls and preview**

Use native radio/checkbox/button semantics. Render loop overlays as raycastable `THREE.LineLoop` objects with enlarged invisible hit targets, visible selected/focus styling, stable candidate labels such as `Boundary 1`, and cleanup on geometry revision.

- [ ] **Step 5: Add English and Thai copy**

Include local-processing privacy text, boundary failure explanations, planar fallback disclosure, PLA estimate, and `Alignment only — not load-bearing` in both locales.

- [ ] **Step 6: Verify GREEN and responsive component suite**

Run:

```powershell
npm --prefix frontend test -- SplitConfig.test.js ConnectorConfig.test.js ThreePreview.boundaries.test.js useMeshProcessor.test.js
npm --prefix frontend test
npm --prefix frontend run build
```

Expected: complete frontend suite and build pass.

- [ ] **Step 7: Commit**

Commit Task 5 files as `feat: add assisted boundary split workflow`.

### Task 6: Export Identity, Assembly Report, and Browser Coverage

**Files:**
- Modify: `frontend/src/lib/exportIdentity.js`
- Modify: `frontend/src/lib/exportIdentity.test.js`
- Modify: `frontend/src/mesh/meshProcessor.js`
- Modify: `frontend/src/mesh/pdfExport.test.js`
- Modify: `frontend/src/mesh/pdfLayout.test.js`
- Create: `frontend/e2e/feature-boundary-splitting.spec.js`

**Interfaces:**
- Export signature adds selected boundary revision/signature, split method, and resolved alignment dimensions.
- PDF connector entries add `purpose: 'alignment-only'` and resolved PLA estimate.

- [ ] **Step 1: Write failing export and PDF tests**

Assert different selected boundaries and resolved taper sizes create different identities, identical inputs remain stable, plug STL is labeled, and PDF text contains `Alignment only — not load-bearing` plus the resolved dimensions.

- [ ] **Step 2: Verify RED**

Run: `npm --prefix frontend test -- exportIdentity.test.js pdfExport.test.js pdfLayout.test.js`

Expected: FAIL because boundary/taper metadata is absent.

- [ ] **Step 3: Implement export/report metadata**

Use stable rounded numeric signatures, exclude transient preview state, include boundary method warnings in the assembly report, and retain current export-credit authorization boundaries.

- [ ] **Step 4: Add Playwright flow**

Use a committed generated synthetic fixture to upload, select Feature Boundary, choose a candidate, confirm a square-taper plug, and inspect part/plug preview without spending a credit. Assert color mode activation with a generated local 3MF fixture.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm --prefix frontend test -- exportIdentity.test.js pdfExport.test.js pdfLayout.test.js
npm --prefix frontend run test:e2e -- feature-boundary-splitting.spec.js
```

Expected: focused unit and browser flows pass.

- [ ] **Step 6: Commit**

Commit Task 6 files as `feat: document boundary splits in exports`.

### Task 7: Representative Models, Full Validation, Push, Deployment, and Dev Server

**Files:**
- Create: `docs/validation/2026-08-24-feature-boundary-models.md`
- Modify only if required by release checks: package versions through the existing CI release workflow, not manually.

**Interfaces:**
- Consumes all prior tasks.
- Produces recorded provenance/checksum/results and a verified production release.

- [ ] **Step 1: Acquire licensed validation models**

Download at least one organic articulated model, one colored 3MF, and one OBJ/MTL from MakerWorld or another reputable source. Record URL, author, license, download date, SHA-256, byte size, and triangle count. Keep binaries outside Git unless redistribution is explicitly permitted.

- [ ] **Step 2: Run model validation**

For each model, record candidate count, selected boundary, direct/fallback method, part count, volume delta, manifold result, resolved taper size, runtime, and limitation. Add a thin-wall negative fixture that must resize or reject the plug.

- [ ] **Step 3: Run fresh full verification**

Run in this order:

```powershell
npm --prefix frontend run build
npm --prefix frontend test
npm --prefix backend test
npm --prefix frontend run test:e2e
docker build -t maliev-mesh-splitter:local .
```

Expected: build exit `0` without warnings; all frontend/backend/e2e tests pass; container build exits `0`.

- [ ] **Step 4: Commit validation evidence**

Commit only the evidence file as `docs: record feature split model validation`.

- [ ] **Step 5: Push and monitor deployment**

Confirm the intended commits and preserved unrelated changes, then run `git push origin main`. Monitor `.github/workflows/ci.yml` through test, version bump, container publish, Cloud Run deploy, health check, tag, and release. Do not claim deployment from push alone.

- [ ] **Step 6: Verify production**

Check the Cloud Run `/health` endpoint and `https://shop.maliev.com/tools/mesh-splitter`. Confirm the deployed version exposes STL/3MF/OBJ import, all three split modes, candidate selection, automatic alignment sizing, and square-taper copy without consuming an export credit.

- [ ] **Step 7: Start the development server for user testing**

Run `npm --prefix frontend run dev -- --host 0.0.0.0` in a persistent process. Read its terminal output, confirm the listening URL, and report that URL while leaving the process alive.
