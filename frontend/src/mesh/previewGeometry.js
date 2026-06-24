import * as THREE from 'three'

const DEFAULT_TARGET_FACES = 150_000
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

  const previewFaces = Math.min(targetFaces, originalFaces)
  const sampled = sampleTriangles(geometry, previewFaces)
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

function sampleTriangles(geometry, targetFaces) {
  const position = geometry.attributes.position
  const index = geometry.index
  const sourceFaces = getGeometryFaceCount(geometry)
  const positions = new Float32Array(targetFaces * 9)
  const normals = geometry.attributes.normal ? new Float32Array(targetFaces * 9) : null

  for (let outFace = 0; outFace < targetFaces; outFace += 1) {
    const sourceFace = Math.floor((outFace * sourceFaces) / targetFaces)
    for (let corner = 0; corner < 3; corner += 1) {
      const sourceVertex = index
        ? index.getX(sourceFace * 3 + corner)
        : sourceFace * 3 + corner
      const out = outFace * 9 + corner * 3
      positions[out] = position.getX(sourceVertex)
      positions[out + 1] = position.getY(sourceVertex)
      positions[out + 2] = position.getZ(sourceVertex)

      if (normals && geometry.attributes.normal) {
        normals[out] = geometry.attributes.normal.getX(sourceVertex)
        normals[out + 1] = geometry.attributes.normal.getY(sourceVertex)
        normals[out + 2] = geometry.attributes.normal.getZ(sourceVertex)
      }
    }
  }

  const preview = new THREE.BufferGeometry()
  preview.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  if (normals) preview.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  preview.computeBoundingBox()
  return preview
}
