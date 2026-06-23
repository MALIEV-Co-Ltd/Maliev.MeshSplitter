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
