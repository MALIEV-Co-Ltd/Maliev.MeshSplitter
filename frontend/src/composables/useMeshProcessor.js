import { ref, readonly } from 'vue'
import * as THREE from 'three'
import {
  addConnectorsManifold,
  applyScale,
  exportPackage,
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
  const chunks = ref([])
  const loading = ref(false)
  const error = ref(null)
  const scaleFactor = ref(1)
  const buildVolume = ref([250, 250, 250])

  function setMeshState(geometry, filename) {
    const info = validateManifold(geometry)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox

    meshInfo.value = {
      filename,
      verts: info.vertCount,
      faces: info.faceCount,
      is_watertight: info.watertight,
      volume: info.volume,
      bounds: {
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z },
      },
    }
    meshGeometry.value = geometry
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
      const geometry = loader.parse(buffer)
      geometry.computeBoundingBox()
      geometry.computeVertexNormals()
      sourceGeometry.value = geometry
      scaleFactor.value = 1

      return setMeshState(geometry.clone(), file.name)
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
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
      chunks.value = rawChunks.map((chunk, i) => ({
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
      const updated = await addConnectorsManifold(chunks.value, config)
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

  async function downloadExportPackage() {
    loading.value = true
    error.value = null
    try {
      const blob = await exportPackage(chunks.value, buildVolume.value)
      const url = URL.createObjectURL(blob)
      const filename = meshInfo.value?.filename
        ? meshInfo.value.filename.replace(/\.stl$/i, '')
        : 'mesh-split'
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}-mesh-splitter-package.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  function clearMesh() {
    meshInfo.value = null
    sourceGeometry.value = null
    meshGeometry.value = null
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
    downloadExportPackage,
    downloadStl: downloadExportPackage,
    downloadPdf: downloadExportPackage,
    clearMesh,
  }
}
