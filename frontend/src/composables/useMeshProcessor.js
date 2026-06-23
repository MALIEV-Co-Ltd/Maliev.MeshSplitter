import { markRaw, readonly, ref, shallowRef } from 'vue'
import * as THREE from 'three'
import {
  addConnectorsManifold,
  applyScale,
  exportPackage,
  repairMeshGeometry,
  splitMeshManifold,
  validateManifold,
} from '../mesh/meshProcessor'
import { createPreviewGeometry } from '../mesh/previewGeometry'

const COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0x34495e, 0xe91e63, 0x00bcd4,
  0x8bc34a, 0xff5722, 0x607d8b, 0x795548, 0x9c27b0,
]

export function useMeshProcessor(options = {}) {
  const previewTargetFaces = Math.max(12, Number(options.previewTargetFaces || 150_000))
  const meshInfo = ref(null)
  const sourceGeometry = shallowRef(null)
  const meshGeometry = shallowRef(null)
  const previewMeshGeometry = shallowRef(null)
  const previewInfo = shallowRef(null)
  const splitChunks = shallowRef([])
  const chunks = shallowRef([])
  const previewChunks = shallowRef([])
  const loading = ref(false)
  const error = ref(null)
  const scaleFactor = ref(1)
  const buildVolume = ref([250, 250, 250])

  function setMeshState(geometry, filename, options = {}) {
    const info = validateManifold(geometry)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox

    meshInfo.value = {
      filename,
      verts: info.vertCount,
      faces: info.faceCount,
      is_watertight: info.watertight,
      was_repaired: Boolean(options.wasRepaired),
      volume: info.volume,
      bounds: {
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z },
      },
    }
    meshGeometry.value = markRaw(geometry)
    setPreviewMeshGeometry(geometry)
    splitChunks.value = []
    chunks.value = []
    disposePreviewChunks()
    previewChunks.value = []
    return meshInfo.value
  }

  async function loadStl(file) {
    loading.value = true
    error.value = null
    try {
      const buffer = await file.arrayBuffer()
      const { STLLoader } = await import('three/addons/loaders/STLLoader.js')
      const loader = new STLLoader()
      const geometry = normalizeForPreview(loader.parse(buffer))
      geometry.computeBoundingBox()
      geometry.computeVertexNormals()
      let workingGeometry = geometry
      let wasRepaired = false
      const initialInfo = validateManifold(workingGeometry)
      if (!initialInfo.watertight) {
        const repaired = repairMeshGeometry(workingGeometry)
        if (validateManifold(repaired).watertight) {
          workingGeometry = repaired
          wasRepaired = true
        }
      }

      sourceGeometry.value = markRaw(workingGeometry)
      scaleFactor.value = 1

      return setMeshState(workingGeometry.clone(), file.name, { wasRepaired })
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  function normalizeForPreview(geometry) {
    const normalized = geometry.clone()
    normalized.computeBoundingBox()
    const box = normalized.boundingBox
    const center = new THREE.Vector3()
    box.getCenter(center)
    const min = box.min

    const offset = new THREE.Vector3(-center.x, -center.y, -min.z)
    normalized.translate(offset.x, offset.y, offset.z)

    normalized.computeBoundingBox()
    return normalized
  }

  function setScaleFactor(value) {
    if (!sourceGeometry.value || !meshInfo.value) return
    loading.value = true
    error.value = null
    try {
      const scaled = applyScale(sourceGeometry.value, value)
      scaleFactor.value = Number(value)
      setMeshState(scaled, meshInfo.value.filename)
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function split(bv, divisions) {
    loading.value = true
    error.value = null
    try {
      const mesh = new THREE.Mesh(meshGeometry.value)
      const rawChunks = await splitMeshManifold(mesh, bv, divisions)
      splitChunks.value = rawChunks.map((chunk, i) => ({
        ...chunk,
        geometry: markRaw(chunk.geometry),
        color: COLORS[i % COLORS.length],
      }))
      chunks.value = splitChunks.value.map((chunk, i) => ({
        ...chunk,
        geometry: markRaw(chunk.geometry),
        color: COLORS[i % COLORS.length],
      }))
      setPreviewChunks(chunks.value)
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function applyConnectors(config) {
    loading.value = true
    error.value = null
    try {
      const base = splitChunks.value.length > 0 ? splitChunks.value : chunks.value
      const updated = await addConnectorsManifold(base, config)
      chunks.value = updated.map((chunk, i) => ({
        ...chunk,
        geometry: markRaw(chunk.geometry),
        color: COLORS[i % COLORS.length],
      }))
      setPreviewChunks(chunks.value)
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function buildExportPackage(options = {}) {
    loading.value = true
    error.value = null
    try {
      const blob = await exportPackage(chunks.value, buildVolume.value, {
        appUrl: import.meta.env.VITE_MESH_SPLITTER_PUBLIC_URL || 'https://shop.maliev.com/tools/mesh-splitter',
        sourceGeometry: meshGeometry.value,
        sourceFilename: meshInfo.value?.filename,
        exportAuthorization: options.authorization,
      })
      const filename = meshInfo.value?.filename
        ? meshInfo.value.filename.replace(/\.stl$/i, '')
        : 'mesh-split'
      return { blob, filename: `${filename}-mesh-splitter-package.zip` }
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function downloadExportPackage() {
    const { blob, filename } = await buildExportPackage()
    saveBlob(blob, filename)
  }

  function clearMesh() {
    meshInfo.value = null
    sourceGeometry.value = null
    meshGeometry.value = null
    disposeGeometry(previewMeshGeometry.value)
    previewMeshGeometry.value = null
    setPreviewChunks([])
    previewInfo.value = null
    splitChunks.value = []
    chunks.value = []
    loading.value = false
    error.value = null
    scaleFactor.value = 1
  }

  return {
    meshInfo: readonly(meshInfo),
    meshGeometry: readonly(meshGeometry),
    previewMeshGeometry: readonly(previewMeshGeometry),
    previewInfo: readonly(previewInfo),
    chunks: readonly(chunks),
    previewChunks: readonly(previewChunks),
    loading: readonly(loading),
    error: readonly(error),
    scaleFactor: readonly(scaleFactor),
    buildVolume,
    loadStl,
    setScaleFactor,
    split,
    applyConnectors,
    buildExportPackage,
    saveBlob,
    downloadExportPackage,
    downloadStl: downloadExportPackage,
    downloadPdf: downloadExportPackage,
    clearMesh,
  }

  function setPreviewMeshGeometry(geometry) {
    disposeGeometry(previewMeshGeometry.value)
    const preview = createPreviewGeometry(geometry, { targetFaces: previewTargetFaces })
    previewMeshGeometry.value = preview.geometry ? markRaw(preview.geometry) : null
    previewInfo.value = summarizePreview([preview])
  }

  function setPreviewChunks(sourceChunks) {
    disposePreviewChunks()
    if (!sourceChunks?.length) {
      previewChunks.value = []
      if (meshGeometry.value) setPreviewMeshGeometry(meshGeometry.value)
      return
    }

    const perChunkTarget = Math.max(12, Math.floor(previewTargetFaces / sourceChunks.length))
    const previews = sourceChunks.map((chunk, i) => {
      const preview = createPreviewGeometry(chunk.geometry, { targetFaces: perChunkTarget })
      return {
        preview,
        chunk: {
          ...chunk,
          geometry: preview.geometry ? markRaw(preview.geometry) : null,
          color: chunk.color || COLORS[i % COLORS.length],
        },
      }
    })
    previewChunks.value = previews.map(({ chunk }) => chunk)
    previewInfo.value = summarizePreview(previews.map(({ preview }) => preview))
  }

  function summarizePreview(previews) {
    const totals = previews.reduce((acc, preview) => {
      acc.originalFaces += preview.originalFaces || 0
      acc.previewFaces += preview.previewFaces || 0
      acc.originalVertices += preview.originalVertices || 0
      acc.previewVertices += preview.previewVertices || 0
      acc.optimized = acc.optimized || Boolean(preview.optimized)
      return acc
    }, {
      optimized: false,
      originalFaces: 0,
      previewFaces: 0,
      originalVertices: 0,
      previewVertices: 0,
    })
    return {
      ...totals,
      ratio: totals.originalFaces > 0 ? totals.previewFaces / totals.originalFaces : 1,
    }
  }

  function disposePreviewChunks() {
    previewChunks.value.forEach((chunk) => disposeGeometry(chunk.geometry))
  }

  function disposeGeometry(geometry) {
    geometry?.dispose?.()
  }
}
