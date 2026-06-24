import * as THREE from 'three'

// Headroom well past any realistic split-total. Splitting a mesh adds cut-cap
// faces, so a 150k-face model can balloon past a 150k budget once split and
// then get decimated into a torn preview (the reported persian-cat bug). At 1M
// the preview stays full-resolution for every real model; only genuinely huge
// uploads ever decimate, and that path is now hole-free (see decimateByClustering).
const DEFAULT_TARGET_FACES = 1_000_000
const DEFAULT_MAX_PIXEL_RATIO = 1.5
const OPTIMIZED_PIXEL_RATIO = 1

export function getGeometryFaceCount(geometry) {
  if (!geometry?.attributes?.position) return 0
  return geometry.index
    ? Math.floor(geometry.index.count / 3)
    : Math.floor(geometry.attributes.position.count / 3)
}

// Decide each split part's preview face budget from a SHARED assembly budget.
//
// The old approach divided the budget equally (budget / partCount). Splits are
// never uniform — long curved bands carry thousands of faces while corner
// scraps carry a handful — so equal division starved the big parts below their
// own face count and `sampleTriangles` tore them into holey shells, even when
// the whole assembly fit the budget many times over. That is the "broken mesh"
// the preview showed while the exported (manifold) parts were perfectly intact.
//
// Rules:
//  - If the whole assembly fits the budget, every part keeps full resolution
//    (no decimation at all → the preview matches what prints).
//  - Otherwise spread the budget proportionally to each part's face count, so a
//    large part is reduced gently and a small part is never over-allocated.
export function allocatePreviewBudget(faceCounts, totalBudget) {
  if (!Array.isArray(faceCounts) || faceCounts.length === 0) return []
  const budget = Math.max(12, Number(totalBudget) || 0)
  const counts = faceCounts.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
  const total = counts.reduce((sum, n) => sum + n, 0)

  if (total <= budget) return counts

  return counts.map((faces) => {
    if (faces === 0) return 0
    return Math.max(12, Math.floor((budget * faces) / total))
  })
}

export function createPreviewGeometry(geometry, options = {}) {
  if (!geometry?.attributes?.position) {
    return {
      geometry: null,
      optimized: false,
      originalFaces: 0,
      previewFaces: 0,
      originalVertices: 0,
      previewVertices: 0,
      ratio: 1,
    }
  }

  const targetFaces = Math.max(12, Number(options.targetFaces || DEFAULT_TARGET_FACES))
  const originalFaces = getGeometryFaceCount(geometry)
  const originalVertices = geometry.attributes.position.count

  if (originalFaces <= targetFaces) {
    const clone = geometry.clone()
    clone.computeBoundingBox()
    clone.computeVertexNormals()
    clone.userData = {
      ...clone.userData,
      preview: {
        optimized: false,
        originalFaces,
        previewFaces: originalFaces,
        ratio: 1,
      },
    }
    return {
      geometry: clone,
      optimized: false,
      originalFaces,
      previewFaces: originalFaces,
      originalVertices,
      previewVertices: clone.attributes.position.count,
      ratio: 1,
    }
  }

  const sampled = decimateByClustering(geometry, Math.min(targetFaces, originalFaces))
  // Welding can, on a pathological mesh, collapse every triangle. Rather than
  // show an empty preview, fall back to the full-resolution clone.
  if (!sampled) {
    const clone = geometry.clone()
    clone.computeBoundingBox()
    clone.computeVertexNormals()
    clone.userData = {
      ...clone.userData,
      preview: { optimized: false, originalFaces, previewFaces: originalFaces, ratio: 1 },
    }
    return {
      geometry: clone,
      optimized: false,
      originalFaces,
      previewFaces: originalFaces,
      originalVertices,
      previewVertices: clone.attributes.position.count,
      ratio: 1,
    }
  }

  const previewFaces = getGeometryFaceCount(sampled)
  sampled.computeVertexNormals()
  geometry.computeBoundingBox()
  sampled.boundingBox = geometry.boundingBox?.clone() ?? null
  sampled.userData = {
    ...sampled.userData,
    preview: {
      optimized: true,
      originalFaces,
      previewFaces,
      ratio: previewFaces / originalFaces,
    },
  }

  return {
    geometry: sampled,
    optimized: true,
    originalFaces,
    previewFaces,
    originalVertices,
    previewVertices: sampled.attributes.position.count,
    ratio: previewFaces / originalFaces,
  }
}

export function resolvePreviewPixelRatio({ optimized = false, devicePixelRatio = 1 } = {}) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return optimized ? OPTIMIZED_PIXEL_RATIO : Math.min(dpr, DEFAULT_MAX_PIXEL_RATIO)
}

// Hole-free preview decimation by vertex clustering.
//
// The preview is never exported — it only has to *look* like the part. The old
// approach dropped every Nth triangle by index, which literally punched holes
// in the surface (the reported "torn/stippled" preview). Vertex clustering
// instead snaps nearby vertices onto a shared grid cell and welds them:
// triangles shrink and collapse but the surrounding faces re-stitch through the
// welded vertex, so the surface stays closed. A decimated part still reads as a
// solid shell rather than a sieve.
//
// Returns null when welding collapses the whole mesh (caller keeps full detail).
function decimateByClustering(geometry, targetFaces) {
  const position = geometry.attributes.position
  const index = geometry.index
  const sourceFaces = getGeometryFaceCount(geometry)

  geometry.computeBoundingBox()
  const bb = geometry.boundingBox
  const min = bb.min
  const ex = Math.max(bb.max.x - bb.min.x, 1e-6)
  const ey = Math.max(bb.max.y - bb.min.y, 1e-6)
  const ez = Math.max(bb.max.z - bb.min.z, 1e-6)

  // Resolve the grid from the target vertex count: a closed mesh has roughly two
  // faces per vertex, and only the cells the surface passes through are ever
  // occupied, so cells-per-axis follows the cube root of the per-vertex volume.
  const targetVertices = Math.max(4, Math.floor(targetFaces / 2))
  const step = Math.cbrt((ex * ey * ez) / targetVertices)
  const nx = Math.max(1, Math.round(ex / step))
  const ny = Math.max(1, Math.round(ey / step))
  const nz = Math.max(1, Math.round(ez / step))

  const cellIndex = (x, y, z) => {
    const cx = Math.min(nx - 1, Math.max(0, Math.floor(((x - min.x) / ex) * nx)))
    const cy = Math.min(ny - 1, Math.max(0, Math.floor(((y - min.y) / ey) * ny)))
    const cz = Math.min(nz - 1, Math.max(0, Math.floor(((z - min.z) / ez) * nz)))
    return (cx * ny + cy) * nz + cz
  }

  const cells = new Map() // cellId -> { sx, sy, sz, count, out }
  const reps = []
  const vertexRep = (vi) => {
    const x = position.getX(vi)
    const y = position.getY(vi)
    const z = position.getZ(vi)
    const id = cellIndex(x, y, z)
    let cell = cells.get(id)
    if (!cell) {
      cell = { sx: 0, sy: 0, sz: 0, count: 0, out: reps.length }
      cells.set(id, cell)
      reps.push(cell)
    }
    cell.sx += x
    cell.sy += y
    cell.sz += z
    cell.count += 1
    return cell.out
  }

  const tris = []
  const corner = (face, c) => (index ? index.getX(face * 3 + c) : face * 3 + c)
  for (let f = 0; f < sourceFaces; f += 1) {
    const a = vertexRep(corner(f, 0))
    const b = vertexRep(corner(f, 1))
    const c = vertexRep(corner(f, 2))
    if (a === b || b === c || a === c) continue // collapsed into a sliver/point
    tris.push(a, b, c)
  }

  if (tris.length === 0) return null

  const repX = reps.map((c) => c.sx / c.count)
  const repY = reps.map((c) => c.sy / c.count)
  const repZ = reps.map((c) => c.sz / c.count)

  const out = new Float32Array(tris.length * 3)
  for (let i = 0; i < tris.length; i += 1) {
    const r = tris[i]
    out[i * 3] = repX[r]
    out[i * 3 + 1] = repY[r]
    out[i * 3 + 2] = repZ[r]
  }

  const preview = new THREE.BufferGeometry()
  preview.setAttribute('position', new THREE.BufferAttribute(out, 3))
  preview.computeBoundingBox()
  return preview
}
