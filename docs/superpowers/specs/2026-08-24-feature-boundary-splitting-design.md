# Local Feature- and Color-Boundary Splitting Design

**Date:** 2026-08-24

**Status:** Approved for implementation planning

**Application:** MALIEV Mesh Splitter

## Purpose

Extend Mesh Splitter from build-volume grid cutting into a local, browser-only
3D-print preparation tool that can:

1. suggest useful split boundaries around closed sharp-edge loops such as a
   figure's neck, arm, leg, or accessory seam;
2. split along closed color or material boundaries in colored 3D files; and
3. create automatically sized, non-structural square-taper alignment plugs and
   matching pockets for accurate reassembly.

All file parsing, analysis, preview, Boolean operations, validation, and export
must run locally in the browser. No mesh data is uploaded, and no ML model or
remote inference service is used. Existing Manifold WASM remains the
authoritative solid-geometry kernel.

## Scope

### Included

- STL, 3MF, and OBJ/MTL input.
- Preservation of source object, material, and color assignments needed for
  boundary detection and preview.
- Build Volume, Feature Boundary, and Color Boundary split modes.
- Detection, ranking, preview, and explicit user selection of candidate closed
  sharp-edge loops.
- Detection and preview of closed color/material boundary loops.
- Topology-following split and cap generation, with a constrained planar
  fallback for suitable feature loops.
- Separate double-ended square-taper alignment plugs with matching pockets.
- Optional automatic plug sizing based on PLA mass estimate, mating geometry,
  and local wall thickness.
- Manifold validation, export metadata, assembly PDF updates, accessibility,
  localization, and regression/performance coverage.
- Validation against representative third-party organic and colored models
  whose licenses permit testing.

### Excluded

- ML or semantic body-part recognition.
- Server-side file conversion or geometry processing.
- Claims that the plug is load-bearing or suitable as a structural joint.
- Automatic execution of a detected feature split without user selection and
  confirmation.
- Arbitrary painted texture boundaries from UV bitmap textures. This release
  uses mesh-native face, vertex, object, and material color assignments.
- Redistribution of third-party test models unless their license explicitly
  permits it.

## User Experience

The split configuration exposes three modes:

- **Build Volume** retains the current grid/division workflow.
- **Feature Boundary** analyzes the mesh and displays ranked candidate loops.
- **Color Boundary** displays closed borders between distinct color/material
  regions.

Candidate boundaries are rendered as selectable overlays in the Three.js
preview. Selecting a candidate produces a non-destructive prospective-parts
preview and shows confidence, split method, estimated part sizes, and any
warning. The user must explicitly confirm the selected boundary before the app
replaces the current chunks.

The connector panel adds **Size alignment key automatically**, enabled by
default for feature and color splits. When enabled, calculated dimensions are
shown read-only with a short explanation. Disabling it restores manual width,
thickness, depth, clearance, and count controls.

Feature and color splits default to **Square taper alignment plug**. The result
contains matching tapered pockets in both parts and a separate, labeled plug
STL. UI and PDF copy state that the plug is for alignment during assembly and
is not load-bearing.

If analysis finds no safe closed loop, the UI explains why and leaves the mesh
unchanged. Open chains, ambiguous branch networks, tiny decorative loops, and
invalid prospective solids cannot be confirmed.

## File Import and Normalized Mesh Contract

The importer dispatches by extension and file signature:

- STL continues through the existing loader and normally has no source color.
- 3MF reads the ZIP package locally, resolves model resources/components and
  transforms, and maps supported base-material and color-group assignments.
- OBJ reads geometry and object/group/material assignments; an accompanying MTL
  selected in the same upload supplies diffuse colors. OBJ remains usable
  without MTL, but color-boundary mode is then unavailable unless separate
  material assignments still define regions.

Importers produce a normalized structure containing:

- renderable indexed geometry;
- welded analysis geometry with a stable mapping back to source triangles;
- triangle-level region identifiers;
- resolved display colors where present;
- source object/material metadata; and
- import warnings for unsupported or missing resources.

Color data must survive scaling, repair, preview, split planning, and export
metadata. Geometry repair that destroys reliable triangle-to-region mapping
disables color-boundary mode for that repaired mesh and reports the reason; it
must not invent a color boundary.

## Feature-Boundary Analysis

Analysis runs in a Web Worker so large meshes do not block UI interaction. The
worker performs these deterministic steps:

1. Weld vertices with a scale-aware tolerance while retaining source-triangle
   references.
2. Build undirected edge-to-face adjacency.
3. Compute the dihedral angle for each two-face edge.
4. Mark sharp edges using a configurable internal threshold with a conservative
   default.
5. Join sharp edges into non-branching chains.
6. Keep only simple closed loops and reject self-intersections, branch points,
   negligible circumference, or insufficiently separated regions.
7. Evaluate the two triangle regions produced by treating the loop as an
   adjacency barrier.
8. Rank candidates using closure quality, mean/minimum sharpness, constriction,
   planarity, region balance, and separation validity.

The ranking is geometric, not semantic. The UI may describe a candidate as a
feature boundary but must not claim it recognized a head, arm, or other body
part.

The initial candidate budget is bounded and results are returned in rank order.
Threshold changes rerun analysis rather than mutating the mesh.

## Color-Boundary Analysis

Triangle regions are derived from source object/material assignments and
quantized mesh-native colors. Colors close enough to be visually equivalent are
clustered in a perceptual color space to suppress exporter noise. The analyzer
marks adjacency edges whose neighboring triangles belong to different regions,
then joins and validates them with the same closed-loop rules used by feature
analysis.

Only closed boundaries that partition the connected surface into two valid
regions are offered. When several boundary loops enclose one logical region,
the plan retains the complete loop set so holes or islands are not silently
discarded.

## Split Construction

### Topology-following split

For a valid selected loop, source triangles are partitioned by traversal that
does not cross the loop. Each resulting open shell receives a cap generated
from the ordered loop. Cap triangulation occurs in a best-fit local frame and
is accepted only when loop deviation, triangle orientation, and intersection
checks remain within scale-aware tolerances.

Each capped shell is converted through Manifold WASM. The operation succeeds
only if it yields exactly two intended non-empty solids and both pass
authoritative manifold/watertight validation.

### Constrained planar fallback

If a feature loop cleanly partitions the surface but cannot be capped directly,
the planner may offer a fallback only when the loop is sufficiently planar and
the fitted plane does not intersect unrelated distant geometry. The preview
labels this as a planar cut. Color boundaries never silently fall back to a
plane because that would cease to follow the source boundary.

Any failed or ambiguous construction leaves the source mesh and current chunks
unchanged and provides an actionable error.

## Automatic Alignment-Plug Sizing

Automatic sizing uses solid volume and a fixed PLA density of
`1.24 g/cm^3` to estimate the mass of the part handled during assembly. The
mass estimate selects a modest alignment-size band; it is not used as a
structural load calculation.

Final dimensions are constrained by:

- local wall thickness sampled over the complete pocket footprint;
- available mating-face area and distance from cap boundaries;
- the smaller participating part's dimensions;
- requested print clearance; and
- conservative minimum and maximum printable dimensions.

The algorithm chooses the smallest size band suitable for stable hand
alignment, then clamps pocket depth and plug cross-section to local geometry.
If no safe pocket fits, it reduces plug count or rejects connector placement
rather than weakening or puncturing the part. The calculated values and reason
codes are preserved in the split manifest for preview, PDF, and reproducible
export identity.

The checkbox controls only dimension selection. The existing manual path stays
available and continues through the same footprint and wall-thickness safety
validation.

## Square-Taper Plug Geometry

The alignment component is a separate double-ended plug centered on the split
interface. Each half tapers slightly from a central shoulder toward its tip.
Matching square tapered pockets are subtracted from both split parts with the
configured clearance applied normal to pocket faces. A small center shoulder
prevents the plug from disappearing entirely into one side and establishes a
repeatable assembly datum.

Connector placement uses the existing cut-face sampling and whole-footprint
wall checks, extended to the tapered square footprint. Multiple plugs are
distributed along the usable cap region and receive stable identifiers in the
manifest. The exported plug is oriented flat for printing where feasible.

No torque, bending, tensile, or service-load rating is calculated or displayed.

## Component Boundaries

- Import modules parse STL, 3MF, and OBJ/MTL into the normalized mesh contract.
- A boundary-analysis worker builds adjacency and returns immutable candidate
  descriptors and overlay positions.
- A split-planning module validates selection, chooses direct-cap or planar
  construction, and records method/reason data.
- `meshProcessor` remains responsible for Manifold WASM Boolean work,
  authoritative validation, connector application, and export preparation.
- Split configuration components own mode, candidate, threshold, and automatic
  sizing controls.
- `ThreePreview` renders candidate overlays and prospective parts without
  becoming responsible for geometry decisions.
- Export identity includes input-region signature, selected boundary,
  construction method, and resolved connector dimensions.

These boundaries keep deterministic analysis testable without a browser or
renderer and keep all authoritative solid operations in the current WASM path.

## Error Handling and Safety

- Unsupported archives, missing OBJ dependencies, malformed color data, and
  excessive resource sizes produce explicit import errors or warnings.
- Worker cancellation prevents stale results from replacing analysis for a
  newly loaded or scaled mesh.
- Candidate identifiers incorporate geometry revision so selection cannot be
  applied after the mesh changes.
- Analysis and preview never consume an export credit.
- A confirmed split is transactional: chunks update only after split, connector
  generation, and validation succeed.
- Existing repair behavior remains available, but color boundaries are disabled
  when repair invalidates trustworthy color-region mapping.
- All generated parts and plugs must pass the existing export gate.

## Testing and Validation

Implementation follows red-green-refactor. Automated coverage includes:

- 3MF and OBJ/MTL parsing, transforms, material/color preservation, missing
  dependencies, and malformed inputs;
- sharp-edge adjacency, loop assembly, branch/open/self-intersection rejection,
  deterministic ranking, and candidate budgets;
- perceptual color clustering and closed multi-loop region boundaries;
- direct-cap split success, constrained fallback eligibility, transactional
  failure, and authoritative manifold validation;
- PLA mass calculation, size-band boundaries, wall/footprint clamps, connector
  count reduction, and no-safe-fit rejection;
- square-taper plug dimensions, clearance, pocket symmetry, labels, and export;
- UI mode selection, candidate keyboard/mouse selection, preview confirmation,
  disabled states, warnings, English/Thai copy, and mobile/desktop behavior;
- export identity and assembly PDF content; and
- performance budgets for representative mesh sizes.

Representative end-to-end fixtures include:

- an organic or articulated figure with neck/limb-like sharp closed loops;
- a model containing misleading open and decorative sharp edges;
- a multicolor 3MF model;
- an OBJ/MTL model with multiple material regions; and
- a thin-wall model that must resize or reject the plug.

For externally sourced models, validation records the source URL, author,
license, download date, checksum, file size, triangle count, detected candidate
count, chosen boundary, split result, manifold result, connector result,
runtime, and any limitation. Third-party binaries remain outside Git unless
redistribution is clearly permitted; deterministic derived fixtures may be
committed when licensing allows.

Before release, run the frontend build first, focused and full frontend tests,
backend tests, Playwright browser coverage, production container build, and
representative-model validation. After pushing `main`, verify CI, Cloud Run
health, the deployed version, and the production feature flow without spending
an export credit.

## Delivery and Commit Boundaries

Implementation should produce coherent validated commits for:

1. normalized 3MF and OBJ/MTL import with color preservation;
2. deterministic boundary analysis and candidate overlays;
3. topology-following split construction and validation;
4. automatic sizing and square-taper plug geometry;
5. UI, export/PDF, localization, and browser coverage; and
6. licensed external-model validation evidence and release metadata.

Only task-owned hunks may be staged. Existing unrelated work in the dirty
working tree and the current local commit ahead of `origin/main` must be
preserved. Push and deployment occur only after all applicable validation is
fresh and successful.
