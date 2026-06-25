# Connector Drag — Interactive Connector Positioning

## Problem

Connectors are auto-placed on cut faces with no user control. Users cannot adjust connector positions after they're computed, even when the automatic placement puts a connector in a suboptimal location (near thin walls, overlapping details, etc.).

## Solution

Decouple connector positions from the mesh geometry. Store connectors as a manifest (metadata), render them as interactive 3D markers in the Three.js preview, and allow users to click-and-drag markers to new positions on the same cut face. On drop, re-validate wall thickness and re-apply connectors via Boolean ops.

## Architecture

### Data Model — Connector Manifest

```
connectorPosition = {
  id: string,           // unique connector ID
  chunkA: number,       // index of part A
  chunkB: number,       // index of part B
  axis: number,         // split axis (0=x, 1=y, 2=z)
  plane: number,        // cut plane position along axis
  otherAxes: [number, number], // in-plane axes
  position: {x,y,z},   // center point on cut face (world coords)
  type: string,         // 'dowel', 'mortise-and-tenon', 'key'
  size: number,         // primary cross-section dimension
  size2: number,        // secondary cross-section dimension
  thickness: number,    // for mortise/key
  depth: number,        // insertion depth
  clearance: number,    // gap
  radius: number,       // footprint half-extent
  isKey: boolean,       // whether this is a key connector
  keyPeg: object|null,  // key footprint {pegX, pegY}
  valid: boolean,       // wall thickness check result
  wallThicknessA: number,
  wallThicknessB: number,
  safeDepth: number,
  faceBounds: {minU, maxU, minV, maxV}, // clamping bounds
}
```

### meshProcessor.js — Refactoring

Extract `addConnectorsManifold` into three functions:

1. `computeConnectorPositions(chunks, config)` — runs face detection, fitting, candidate generation, wall thickness validation, farthest-point sampling. Returns a manifest array (no Boolean ops).

2. `applyConnectorsFromManifest(chunks, manifest)` — takes original geometry chunks + manifest, creates Manifold solids, applies all connectors via Boolean ops, returns fully processed chunks.

3. `addConnectorsManifold(chunks, config)` — backward-compatible wrapper calling both in sequence.

Also add:
4. `validateConnectorPosition(chunks, entry, newPos)` — wall thickness check at a specific position (used after drag before re-apply).

### useMeshProcessor.js — State

- `connectorPositions: ref([])` — reactive manifest
- `cleanSolids: ref(null)` — cached post-split Manifold solids (no connectors)
- `reapplyingConnectors: ref(false)` — spinner during re-Boolean
- `updateConnectorPosition(id, newPosition)` — validates, updates manifest, triggers re-apply
- `split()` — also caches clean solids
- `applyConnectors()` — also stores manifest from computeConnectorPositions

### ThreePreview.vue — Markers & Drag

- Render a small colored sphere at each manifest position
- Pointer handlers: pick, drag, release
- During drag: disable orbit controls, constrain movement to face plane (raycaster + drag plane)
- During drag: update marker visual only (GPU, no re-apply)
- On release: emit `connector-drag-end` event with connectorId and new position
- Visual states: gray (default), highlight (hover), yellow (dragging), red (invalid)

### Data Flow

```
Split → computeConnectorPositions → manifest stored → applyConnectorsFromManifest → chunks
User drags marker → pointermove (visual only) → pointerup → emit event
→ validateConnectorPosition → if valid: update manifest → re-apply all from manifest → preview update
```

### Edge Cases

- Drag outside face AABB: clamped to bounds
- Wall thickness fail on drop: marker turns red, connector stays at last valid position
- Connector overlap after drag: visual warning when another connector is within radius*2 distance
- Orbit controls disabled during drag, re-enabled on release
- Key connectors: manifest works the same; slot (subtract) on both parts + key piece repositioned

## Files Changed

| File | Changes |
|------|---------|
| meshProcessor.js | ~+150 lines: extract computeConnectorPositions, add applyConnectorsFromManifest, add validateConnectorPosition |
| useMeshProcessor.js | ~+80 lines: connectorPositions ref, cleanSolids cache, updateConnectorPosition |
| ThreePreview.vue | ~+200 lines: connector markers, pointer handlers, drag plane, visual states |
| App.vue | ~+20 lines: wire up connector-drag-end event, pass props |
