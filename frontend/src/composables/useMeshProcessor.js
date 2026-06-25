import { markRaw, readonly, ref, shallowRef } from 'vue'
import * as THREE from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import {
  applyConnectorsFromManifest,
  applyScale,
  computeConnectorPositions,
  exportPackage,
  prepareExportChunks,
  repairMeshGeometryRobust,
  splitMeshManifold,
  validateConnectorPosition,
  validateManifold,
} from '../mesh/meshProcessor'
import { allocatePreviewBudget, createPreviewGeometry, getGeometryFaceCount } from '../mesh/previewGeometry'
import { renderPartThumbnail, disposeThumbnailRenderer } from '../mesh/thumbnailRenderer'

const COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0x34495e, 0xe91e63, 0x00bcd4,
  0x8bc34a, 0xff5722, 0x607d8b, 0x795548, 0x9c27b0,
]

export function useMeshProcessor(options = {}) {
  const previewTargetFaces = Math.max(12, Number(options.previewTargetFaces || 1_000_000))
  const meshInfo = ref(null)
  const sourceGeometry = shallowRef(null)
  const meshGeometry = shallowRef(null)
  const previewMeshGeometry = shallowRef(null)
  const previewInfo = shallowRef(null)
  const splitChunks = shallowRef([])
  const cleanSplitChunks = shallowRef([])
  const chunks = shallowRef([])
  const previewChunks = shallowRef([])
  const connectorPositions = ref([])
  const reapplyingConnectors = ref(false)
  let lastConnectorConfig = null
  const loading = ref(false)
  const progressLabel = ref('')
  const progressLabels = ref({
    loading: 'Loading file…',
    checking: 'Checking mesh…',
    repairing: 'Repairing mesh…',
    splitting: 'Splitting mesh…',
    processing: 'Processing chunks…',
    analyzing: 'Analyzing connectors…',
    adding: 'Adding connectors…',
    updating: 'Updating connectors…',
  })
  const error = ref(null)
  const problemEdges = ref([])
  const repairPreview = ref(null)
  let pendingOriginalGeometry = null

  function setProgressLabels(labels) {
    Object.assign(progressLabels.value, { ...progressLabels.value, ...labels })
  }
  const scaleFactor = ref(1)
  // Default to the Bambu Lab X1C printable envelope (256x256x250, the
  // Bambu-Studio default Z). BuildVolumeConfig auto-selects the matching preset.
  const buildVolume = ref([256, 256, 250])

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
    generateMeshThumbnail()
    return meshInfo.value
  }

  // A small rendered preview of the whole (pre-split) mesh, shown next to the
  // filename in the Mesh File panel. Rendered off the decimated preview geometry
  // and deferred so it never blocks the upload returning. Dropped if the mesh is
  // replaced before it finishes.
  function generateMeshThumbnail() {
    if (typeof window === 'undefined') return
    const targetInfo = meshInfo.value
    const geometry = previewMeshGeometry.value || meshGeometry.value
    if (!geometry) return
    setTimeout(() => {
      if (meshInfo.value !== targetInfo) return
      const thumbnail = renderPartThumbnail(geometry, 0x9fb8d6)
      if (thumbnail && meshInfo.value === targetInfo) {
        meshInfo.value = { ...meshInfo.value, thumbnail }
      }
    }, 0)
  }
  async function loadStl(file) {
    loading.value = true
    progressLabel.value = progressLabels.value.loading
    repairPreview.value = null
    pendingOriginalGeometry = null
    error.value = null
    problemEdges.value = []
    try {
      const buffer = await file.arrayBuffer()
      progressLabel.value = progressLabels.value.checking
      const loader = new STLLoader()
      const geometry = normalizeForPreview(loader.parse(buffer))
      geometry.computeBoundingBox()
      geometry.computeVertexNormals()
      let workingGeometry = geometry
      let wasRepaired = false
      const initialInfo = validateManifold(workingGeometry)
      if (!initialInfo.watertight) {
        progressLabel.value = progressLabels.value.repairing
        const repaired = await repairMeshGeometryRobust(workingGeometry)
        progressLabel.value = progressLabels.value.checking
        if (repaired) {
          const repairedInfo = validateManifold(repaired)
          pendingOriginalGeometry = geometry
          repairPreview.value = {
            beforeUrl: renderPartThumbnail(geometry),
            afterUrl: renderPartThumbnail(repaired),
            beforeStats: { faces: initialInfo.faceCount, verts: initialInfo.vertCount },
            afterStats: { faces: repairedInfo.faceCount, verts: repairedInfo.vertCount },
            filename: file.name,
          }
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

  function acceptRepair() {
    pendingOriginalGeometry = null
    repairPreview.value = null
  }

  function rejectRepair() {
    if (pendingOriginalGeometry) {
      const prevInfo = meshInfo.value
      sourceGeometry.value = markRaw(pendingOriginalGeometry)
      scaleFactor.value = 1
      setMeshState(pendingOriginalGeometry.clone(), prevInfo?.filename || 'mesh', { wasRepaired: false })
      pendingOriginalGeometry = null
    }
    repairPreview.value = null
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
    progressLabel.value = progressLabels.value.splitting
    error.value = null
    try {
      const mesh = new THREE.Mesh(meshGeometry.value)
      const rawChunks = await splitMeshManifold(mesh, bv, divisions)
      progressLabel.value = progressLabels.value.processing
      splitChunks.value = rawChunks.map((chunk, i) => ({
        ...chunk,
        geometry: markRaw(chunk.geometry),
        color: COLORS[i % COLORS.length],
      }))
      cleanSplitChunks.value = splitChunks.value
      connectorPositions.value = []
      lastConnectorConfig = null
      chunks.value = decorateChunks(splitChunks.value)
      setPreviewChunks(chunks.value)
      generateThumbnails()
    } catch (e) {
      error.value = e.message
      problemEdges.value = e.boundaryData || []
      throw e
    } finally {
      loading.value = false
    }
  }

  async function applyConnectors(config) {
    loading.value = true
    progressLabel.value = progressLabels.value.analyzing
    error.value = null
    try {
      const base = splitChunks.value.length > 0 ? splitChunks.value : chunks.value
      const manifest = await computeConnectorPositions(base, config)
      progressLabel.value = progressLabels.value.adding
      const updated = await applyConnectorsFromManifest(base, manifest)
      connectorPositions.value = manifest
      lastConnectorConfig = config
      chunks.value = decorateChunks(updated)
      setPreviewChunks(chunks.value)
      generateThumbnails()
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateConnectorPosition(id, newPosition) {
    const manifest = connectorPositions.value
    const entry = manifest.find(e => e.id === id)
    if (!entry) return
    const valid = validateConnectorPosition(
      cleanSplitChunks.value.length > 0 ? cleanSplitChunks.value : chunks.value,
      entry,
      newPosition,
    )
    if (!valid.valid) return
    entry.position = { x: newPosition.x, y: newPosition.y, z: newPosition.z }
    entry.safeDepth = valid.safeDepth
    reapplyingConnectors.value = true
    progressLabel.value = progressLabels.value.updating
    try {
      const base = cleanSplitChunks.value.length > 0 ? cleanSplitChunks.value : splitChunks.value
      const updated = await applyConnectorsFromManifest(base, manifest)
      chunks.value = decorateChunks(updated)
      setPreviewChunks(chunks.value)
      generateThumbnails()
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      reapplyingConnectors.value = false
    }
  }

  // Repair + validate the parts up front, before any credit is charged, so a
  // customer is never billed for an export that cannot be produced. Returns the
  // exportable parts and any that had to be isolated. Throws only when nothing
  // is exportable (caller must charge nothing in that case).
  async function prepareExport() {
    loading.value = true
    error.value = null
    try {
      return await prepareExportChunks(chunks.value)
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
        locale: options.locale,
        exportAuthorization: options.authorization,
        preparedExportable: options.preparedExportable,
        preparedFailed: options.preparedFailed,
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
    cleanSplitChunks.value = []
    chunks.value = []
    connectorPositions.value = []
    problemEdges.value = []
    reapplyingConnectors.value = false
    lastConnectorConfig = null
    loading.value = false
    error.value = null
    progressLabel.value = ''
    scaleFactor.value = 1
    disposeThumbnailRenderer()
  }

  return {
    meshInfo: readonly(meshInfo),
    meshGeometry: readonly(meshGeometry),
    previewMeshGeometry: readonly(previewMeshGeometry),
    previewInfo: readonly(previewInfo),
    chunks: readonly(chunks),
    previewChunks: readonly(previewChunks),
    connectorPositions: readonly(connectorPositions),
    problemEdges: readonly(problemEdges),
    reapplyingConnectors: readonly(reapplyingConnectors),
    loading: readonly(loading),
    progressLabel: readonly(progressLabel),
    setProgressLabels,
    repairPreview: readonly(repairPreview),
    acceptRepair,
    rejectRepair,
    error: readonly(error),
    scaleFactor: readonly(scaleFactor),
    buildVolume,
    loadStl,
    setScaleFactor,
    split,
    applyConnectors,
    updateConnectorPosition,
    prepareExport,
    buildExportPackage,
    saveBlob,
    downloadExportPackage,
    downloadStl: downloadExportPackage,
    downloadPdf: downloadExportPackage,
    clearMesh,
  }

  // Attach the per-part facts the parts list shows (faces + bounding box), so
  // the UI never recomputes geometry stats on every render.
  function decorateChunks(list) {
    return list.map((chunk, i) => {
      const geometry = markRaw(chunk.geometry)
      return {
        ...chunk,
        geometry,
        color: COLORS[i % COLORS.length],
        faces: getGeometryFaceCount(geometry),
        dims: chunkDims(geometry),
      }
    })
  }

  function chunkDims(geometry) {
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const size = new THREE.Vector3()
    geometry.boundingBox.getSize(size)
    return { x: size.x, y: size.y, z: size.z }
  }

  // Thumbnails render after the list is already on screen (deferred), and the
  // guard drops a stale pass if the chunks were replaced (e.g. connectors
  // applied) before it ran.
  function generateThumbnails() {
    if (typeof window === 'undefined') return
    const target = chunks.value
    setTimeout(() => {
      if (chunks.value !== target) return
      chunks.value = target.map((chunk) => ({
        ...chunk,
        thumbnail: renderPartThumbnail(chunk.geometry, chunk.color),
      }))
    }, 0)
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

    // Share one budget across the whole assembly, weighted by each part's face
    // count, instead of an equal split. Equal division starved large parts and
    // tore them into holey shells in the preview even when the full assembly fit
    // the budget (the reported "broken mesh"); proportional allocation keeps
    // every part watertight whenever the assembly fits, and reduces fairly when
    // it does not.
    const previewTargets = allocatePreviewBudget(
      sourceChunks.map((chunk) => getGeometryFaceCount(chunk.geometry)),
      previewTargetFaces,
    )
    const previews = sourceChunks.map((chunk, i) => {
      const preview = createPreviewGeometry(chunk.geometry, { targetFaces: previewTargets[i] })
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
