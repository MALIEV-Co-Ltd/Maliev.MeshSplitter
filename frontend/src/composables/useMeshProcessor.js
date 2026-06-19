import { ref, readonly } from 'vue'
import * as THREE from 'three'
import { validateManifold, splitMesh, addConnectors, exportStl, exportPdf } from '../mesh/meshProcessor'

const COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0x34495e, 0xe91e63, 0x00bcd4,
  0x8bc34a, 0xff5722, 0x607d8b, 0x795548, 0x9c27b0,
]

export function useMeshProcessor() {
  const meshInfo = ref(null)
  const meshGeometry = ref(null)
  const chunks = ref([])
  const loading = ref(false)
  const error = ref(null)
  const buildVolume = ref([250, 250, 250])

  async function loadStl(file) {
    loading.value = true
    error.value = null
    try {
      const buffer = await file.arrayBuffer()
      const { STLLoader } = await import('three/addons/loaders/STLLoader.js')
      const loader = new STLLoader()
      const geometry = loader.parse(buffer)

      const info = validateManifold(geometry)
      geometry.computeBoundingBox()
      const box = geometry.boundingBox

      meshInfo.value = {
        filename: file.name,
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
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  function split(bv, divisions) {
    loading.value = true
    error.value = null
    try {
      const mesh = new THREE.Mesh(meshGeometry.value)
      const rawChunks = splitMesh(mesh, bv, divisions)
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

  function applyConnectors(config) {
    loading.value = true
    error.value = null
    try {
      const updated = addConnectors(chunks.value, config)
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

  async function downloadStl() {
    loading.value = true
    error.value = null
    try {
      const blob = await exportStl(chunks.value)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mesh-split-parts.zip'
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

  async function downloadPdf() {
    loading.value = true
    error.value = null
    try {
      const data = await exportPdf(chunks.value, buildVolume.value)
      const blob = new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mesh-split-assembly.pdf'
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
    meshGeometry.value = null
    chunks.value = []
    loading.value = false
    error.value = null
  }

  return {
    meshInfo: readonly(meshInfo),
    meshGeometry: readonly(meshGeometry),
    chunks: readonly(chunks),
    loading: readonly(loading),
    error: readonly(error),
    buildVolume,
    loadStl,
    split,
    applyConnectors,
    downloadStl,
    downloadPdf,
    clearMesh,
  }
}
