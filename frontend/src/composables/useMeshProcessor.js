import { ref, readonly } from 'vue'
import * as THREE from 'three'
import {
  addConnectorsManifold,
  applyScale,
  exportPackage,
  repairMeshGeometry,
  splitMeshManifold,
  validateManifold,
} from '../mesh/meshProcessor'

const COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0x34495e, 0xe91e63, 0x00bcd4,
  0x8bc34a, 0xff5722, 0x607d8b, 0x795548, 0x9c27b0,
]

export function useMeshProcessor() {
  const meshInfo = ref(null)
  const sourceGeometry = ref(null)
  const meshGeometry = ref(null)
  const splitChunks = ref([])
  const chunks = ref([])
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
    meshGeometry.value = geometry
    splitChunks.value = []
    chunks.value = []
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

      sourceGeometry.value = workingGeometry
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
        color: COLORS[i % COLORS.length],
      }))
      chunks.value = splitChunks.value.map((chunk, i) => ({
        ...chunk,
        color: COLORS[i % COLORS.length],
      }))
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
        color: COLORS[i % COLORS.length],
      }))
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function buildExportPackage() {
    loading.value = true
    error.value = null
    try {
      const blob = await exportPackage(chunks.value, buildVolume.value, {
        appUrl: import.meta.env.VITE_MESH_SPLITTER_PUBLIC_URL || 'https://shop.maliev.com/tools/mesh-splitter',
        sourceGeometry: meshGeometry.value,
        sourceFilename: meshInfo.value?.filename,
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
    splitChunks.value = []
    chunks.value = []
    loading.value = false
    error.value = null
    scaleFactor.value = 1
  }

  return {
    meshInfo: readonly(meshInfo),
    meshGeometry: readonly(meshGeometry),
    chunks: readonly(chunks),
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
}
