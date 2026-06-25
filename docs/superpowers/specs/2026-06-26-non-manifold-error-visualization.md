# Non-Manifold Error Visualization

## Problem

When a mesh is non-manifold and cannot be repaired automatically, the error is
shown as a plain `<p class="text-destructive">` line in the SplitConfig panel.
There is no visual feedback on the 3D canvas about *where* the problem is,
making it difficult for the user to understand what is wrong with their model.

## Solution

When the repair pipeline (Three.js hole-fill to Manifold round-trip) fails, the
boundary edges and hole regions are computed from the geometry and:

1. Red glowing line loops are drawn on the 3D canvas along each hole boundary
2. Semi-transparent red filled polygons cover the missing-face areas
3. A styled dialog shows the error with hole/edge statistics and a "View on
   model" button that frames the camera to the problem area

## Data Flow

splitMeshManifold (meshProcessor.js)
  L- repairMeshGeometryRobust() fails -> still non-manifold
       L- computeProblemEdges(geometry) -> structured boundary data
            L- thrown on Error object (error.boundaryData)
                 L- useMeshProcessor.split() catch:
                      L- sets problemEdges ref + error.value
                           L- App.vue passes to:
                                +- NonManifoldErrorDialog.vue (displays)
                                L- ThreePreview.vue (renders highlights)

## computeProblemEdges(geometry) - meshProcessor.js

- Calls findBoundaryLoops(geometry) to get ordered vertex-index loops
- For each loop:
  - Extracts 3D Float32Array positions for line rendering
  - Computes best-fit plane, projects vertices to 2D
  - Calls THREE.ShapeUtils.triangulateShape(contour) for fill triangles
  - Maps triangle indices back to 3D positions; returns Uint16Array indices
  - Computes bounding-box center for camera framing
- Returns Array of {positions: Float32Array, fillIndices: Uint16Array, center: [x,y,z]}
- Called on the original (unrepaired) geometry so the boundary edges /
  missing faces are visible exactly where they exist

## problemEdges ref - useMeshProcessor.js

- Set in split() catch block alongside error.value
- Cleared on loadStl() and clearMesh()
- Exposed to consumers alongside error, chunks, etc.

## NonManifoldErrorDialog.vue

- Modal dialog element, consistent with RepairConfirmDialog styling
- Sections:
  - AlertTriangleIcon + title "Cannot split mesh"
  - Explanation text (localized)
  - Stats row: hole count, boundary edge count
  - Two buttons:
    - "View on model" (primary) - emits view-problem -> App.vue calls
      frameToProblem() on ThreePreview ref
    - "Dismiss" (outline) - emits dismiss -> App.vue clears problemEdges;
      highlights remain until cleared

## ThreePreview.vue - problemEdges prop

- Watches problemEdges for changes
- On set: creates a THREE.Group under the main scene group:
  - Per hole: THREE.LineLoop with LineBasicMaterial
    (color: 0xff2222, transparent: true, opacity: 0.9)
  - Per hole: THREE.Mesh with MeshBasicMaterial
    (color: 0xff0000, transparent: true, opacity: 0.25,
    side: DoubleSide, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -1)
- On null/empty: disposes and removes the group
- New method frameToProblem():
  - Computes bounding sphere of all problem geometry
  - Calls internal fitCameraToSelection(bbox) (existing pattern)
- frameToProblem invoked via template ref (defineExpose)

## Error Object

The Error thrown by splitMeshManifold carries a boundaryData property so
the catch block in useMeshProcessor.split() can extract it:

throw Object.assign(
  new Error('Mesh is non-manifold and could not be repaired...'),
  { boundaryData: computeProblemEdges(splitGeometry) }
)

## Edge Cases

- No boundary loops found (findBoundaryLoops returns []): Falls back
  to the original error text in SplitConfig. computeProblemEdges returns
  [] and no dialog/canvas overlay is shown.
- User switches locale: No impact - the error message uses UI copy labels.
- New mesh loaded after error: loadStl clears problemEdges, which
  tears down the ThreePreview overlay group.
- Split succeeds on second attempt: split() sets error.value = null
  and problemEdges.value = null.

## Files Changed

- frontend/src/mesh/meshProcessor.js: computeProblemEdges(),
  splitMeshManifold error attachment
- frontend/src/composables/useMeshProcessor.js: problemEdges ref
- frontend/src/components/ThreePreview.vue: problemEdges prop +
  rendering + frameToProblem
- frontend/src/components/NonManifoldErrorDialog.vue: new component
- frontend/src/App.vue: wire dialog + canvas
- frontend/src/style.css: dialog styles