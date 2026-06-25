<template>
  <div ref="container" class="preview-canvas"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { calculatePerspectiveFitDistance } from '../mesh/cameraFit'
import { createCadSurfaceMaterial } from '../mesh/cadMaterial'
import { resolvePreviewPixelRatio } from '../mesh/previewGeometry'
import { calculateSafeZone } from '../mesh/splitPlanning'

const props = defineProps({
  chunks: { type: Array, default: () => [] },
  meshInfo: { type: Object, default: null },
  meshGeometry: { type: Object, default: null },
  buildVolume: { type: Array, default: () => [250, 250, 250] },
  divisions: { type: Array, default: () => [2, 2, 1] },
  upAxis: { type: String, default: 'Z' },
  selectedChunkIndex: { type: Number, default: null },
  previewInfo: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
  connectorPositions: { type: Array, default: () => [] },
  reapplyingConnectors: { type: Boolean, default: false },
})

const emit = defineEmits(['connector-drag-end'])

const container = ref(null)
// Non-selected parts fade well back so the isolated part clearly stands out.
const selectedOpacity = 0.06

let renderer, scene, camera, controls, meshGroup, connectorMarkers, gridOverlay, buildVolumeOverlay, grid, renderFrame, lastGridExtent = 0, isUnmounting = false
let ambientLight, keyLight, fillLight

// Connector drag state
let dragConnector = null
let dragPlane = new THREE.Plane()
let dragOffset = new THREE.Vector3()
let isDragging = false
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let markerAnimId = null
const CONNECTOR_MARKER_COLORS = {
  dowel: 0x00e5ff,
  mortise: 0xff6b35,
  key: 0xffd700,
}
const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x34495e]

function sceneBackground() {
  return props.isDark ? 0x161b26 : 0xffffff
}
function gridColors() {
  return props.isDark ? { main: 0x3a4760, sub: 0x262e3d } : { main: 0x8fb4e8, sub: 0xe5e9ee }
}
// The dark-slate line that reads fine on a white canvas all but disappears
// against the dark-mode background, so the cut-plane preview needs its own
// lighter color when the canvas is dark.
function splitPlaneColor() {
  return props.isDark ? { color: 0x9fb3d1, opacity: 0.6 } : { color: 0x2f3338, opacity: 0.55 }
}
// A white background already bounces plenty of fill light onto the model, so
// the light-mode rig leans on a stronger key light for shape contrast. A dark
// background gives none of that bounce, so dark mode compensates with more
// ambient/fill or the model reads as a flat silhouette.
function lightingPreset() {
  return props.isDark
    ? { ambient: 0.5, key: 1.1, fill: 0.32 }
    : { ambient: 0.34, key: 1.05, fill: 0.18 }
}

function initScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(sceneBackground())
  const { ambient, key, fill } = lightingPreset()
  ambientLight = new THREE.AmbientLight(0xffffff, ambient)
  scene.add(ambientLight)
  keyLight = new THREE.DirectionalLight(0xffffff, key)
  keyLight.position.set(1.1, 1.8, 1.35)
  scene.add(keyLight)
  fillLight = new THREE.DirectionalLight(0xffffff, fill)
  fillLight.position.set(-1.2, -0.45, 0.8)
  scene.add(fillLight)
}

// The floor grid is rebuilt to always extend well past whatever is on screen —
// a fixed 500mm grid disappears entirely inside a larger model.
function setGrid(maxExtent) {
  if (grid) {
    scene.remove(grid)
    grid.geometry?.dispose()
    grid.material?.dispose()
    grid = null
  }
  lastGridExtent = Number(maxExtent) || 0
  const span = Math.max(50, lastGridExtent)
  const size = Math.ceil((span * 1.6) / 50) * 50
  const divisions = Math.max(8, Math.round(size / 50))
  const colors = gridColors()
  grid = new THREE.GridHelper(size, divisions, colors.main, colors.sub)
  if (props.upAxis === 'Z') grid.rotation.x = -Math.PI / 2
  grid.renderOrder = -1
  scene.add(grid)
}

function maxBoxExtent(box) {
  const size = new THREE.Vector3()
  box.getSize(size)
  return Math.max(size.x, size.y, size.z)
}

function initRenderer() {
  const el = container.value
  // logarithmicDepthBuffer: adjacent split chunks share an exact cut-plane
  // face, which standard linear depth precision can't reliably resolve —
  // shows up as off-color slivers flickering at the seam between parts.
  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
  applyPixelRatio()
  renderer.setSize(el.clientWidth, el.clientHeight)
  el.appendChild(renderer.domElement)
}

function applyPixelRatio() {
  if (!renderer) return
  renderer.setPixelRatio(resolvePreviewPixelRatio({
    optimized: Boolean(props.previewInfo?.optimized),
    devicePixelRatio: window.devicePixelRatio,
  }))
}

function initCamera() {
  const el = container.value
  camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 10000)
  if (props.upAxis === 'Z') camera.up.set(0, 0, 1)
}

function initControls() {
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = false
  controls.addEventListener('change', requestRender)
}

function disposeGroup(group) {
  if (!group) return
  group.children.forEach((c) => {
    if (c.isMesh || c.isLineSegments) {
      c.geometry?.dispose()
      c.material?.dispose()
    } else if (c.isSprite) {
      c.material?.map?.dispose()
      c.material?.dispose()
    }
  })
  scene?.remove(group)
  requestRender()
}

function clearScene() {
  disposeGroup(meshGroup)
  meshGroup = null
  if (gridOverlay) {
    scene.remove(gridOverlay)
    gridOverlay = null
  }
  if (buildVolumeOverlay) {
    disposeGroup(buildVolumeOverlay)
    buildVolumeOverlay = null
  }
  requestRender()
}

function buildMeshes(chunks) {
  clearScene()
  if (!chunks || chunks.length === 0) return
  meshGroup = new THREE.Group()
  const box = new THREE.Box3()
  const labels = []
  chunks.forEach((chunk, i) => {
    if (!chunk.geometry) return
    const geom = chunk.geometry.clone()
    const color = chunk.color || COLORS[i % COLORS.length]
    const mesh = new THREE.Mesh(geom, createCadSurfaceMaterial(color))
    mesh.userData.chunkIndex = chunk.index
    meshGroup.add(mesh)
    box.expandByObject(mesh)
    labels.push({ text: chunk.label || `P${i + 1}`, position: chunk.centroid || computeGeometryCenter(geom), color, chunkIndex: chunk.index, isKey: Boolean(chunk.isKey) })
  })
  if (meshGroup.children.length === 0) return
  // Labels sized off the model so they stay readable on large assemblies. Key
  // pieces get no floating label — they're tiny and the part list already names
  // them, so a "Key" tag just clutters the model.
  const labelScale = labelScaleForBox(box)
  labels.forEach((l) => {
    if (l.isKey) return
    const sprite = createLabelSprite(l.text, l.position, l.color, labelScale)
    sprite.userData.isLabel = true
    sprite.userData.chunkIndex = l.chunkIndex
    meshGroup.add(sprite)
  })
  scene.add(meshGroup)
  setGrid(maxBoxExtent(box))
  applyChunkVisibility(props.selectedChunkIndex)
  applyLabelVisibility(props.selectedChunkIndex)
  requestRender()
}

function labelScaleForBox(box) {
  const size = new THREE.Vector3()
  box.getSize(size)
  const w = THREE.MathUtils.clamp(size.length() * 0.12, 30, 600)
  return { w, h: w * 0.375 }
}

function applyChunkVisibility(selectedChunkIndex) {
  if (!meshGroup) return
  const hasSelection = selectedChunkIndex !== null
  const selectedChunk = hasSelection ? props.chunks.find(c => c.index === selectedChunkIndex) : null
  const isKeySelected = selectedChunk?.isKey === true

  meshGroup.children.forEach((child) => {
    if (!child.isMesh) return
    const isSelected = !hasSelection ||
      (isKeySelected
        ? props.chunks.find(c => c.index === child.userData.chunkIndex)?.isKey === true
        : selectedChunkIndex === child.userData.chunkIndex)
    // Selected (or "no selection" = everything) renders as a normal opaque
    // solid; only the non-selected parts fade out, so the active part is
    // never blended/occluded by overlapping transparent geometry.
    child.material.transparent = hasSelection && !isSelected
    child.material.opacity = isSelected ? 1 : selectedOpacity
    child.material.depthWrite = isSelected
    child.material.needsUpdate = true
    child.renderOrder = isSelected ? 0 : 1
  })
  requestRender()
}

// Per-part labels bury the model once there's more than a couple of parts,
// and the part list panel already names every part, so the 3D label only
// needs to appear for whichever part the customer has isolated.
function applyLabelVisibility(selectedChunkIndex) {
  if (!meshGroup) return
  const hasSelection = selectedChunkIndex !== null
  const selectedChunk = hasSelection ? props.chunks.find(c => c.index === selectedChunkIndex) : null
  const isKeySelected = selectedChunk?.isKey === true

  meshGroup.children.forEach((sprite) => {
    if (!sprite.userData?.isLabel) return
    sprite.visible = hasSelection &&
      (isKeySelected
        ? props.chunks.find(c => c.index === sprite.userData.chunkIndex)?.isKey === true
        : sprite.userData.chunkIndex === selectedChunkIndex)
  })
  requestRender()
}

function computeGeometryCenter(geometry) {
  geometry.computeBoundingBox()
  return geometry.boundingBox.getCenter(new THREE.Vector3())
}

function createLabelSprite(label, position, color, scale = { w: 48, h: 18 }) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(38, 38, 38, 0.92)'
  roundRect(ctx, 24, 28, 464, 136, 22)
  ctx.fill()
  ctx.strokeStyle = `#${new THREE.Color(color).getHexString()}`
  ctx.lineWidth = 12
  roundRect(ctx, 24, 28, 464, 136, 22)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 64px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 256, 100, 430)

  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.position.copy(position)
  sprite.position.z += scale.h * 0.7
  sprite.scale.set(scale.w, scale.h, 1)
  sprite.renderOrder = 10
  return sprite
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function showOriginal(geometry, divisions) {
  clearScene()
  if (!geometry) return
  meshGroup = new THREE.Group()
  const geom = geometry.clone()
  const mat = createCadSurfaceMaterial(0x4a90d9)
  const mesh = new THREE.Mesh(geom, mat)
  meshGroup.add(mesh)
  const box = new THREE.Box3().expandByObject(mesh)
  scene.add(meshGroup)
  drawGridOverlay(geometry, divisions)
  // The build-volume + support-safe-zone box only makes sense when the whole
  // model fits a single build volume (1x1x1). Once it has to be split, a lone
  // box floating inside a larger model reads as broken — the cut planes above
  // are the split preview, and the safe margin is already baked into how many
  // cuts there are.
  const singleCell = !divisions || divisions.every((d) => Number(d) <= 1)
  if (singleCell) {
    drawBuildVolume(props.buildVolume)
    if (buildVolumeOverlay) {
      buildVolumeOverlay.updateMatrixWorld(true)
      box.expandByObject(buildVolumeOverlay)
    }
  }
  setGrid(maxBoxExtent(box))
  fitCamera(box)
  requestRender()
}

// Build-volume envelope plus the support-clearance safe zone. The mesh is
// centered on X/Y with its base on z=0, so the box is drawn the same way: the
// outer wireframe is the printer build volume, the inner wireframe is the
// printable safe zone, and the translucent grey band between them marks the
// X/Y clearance reserved for support material, brims, and skirts.
function drawBuildVolume(buildVolume) {
  if (buildVolumeOverlay) {
    disposeGroup(buildVolumeOverlay)
    buildVolumeOverlay = null
  }
  if (!buildVolume) return

  const { outer, inner, margin } = calculateSafeZone(buildVolume)
  const [bx, by, bz] = outer.map(Number)
  const [ix, iy] = inner.map(Number)
  if (![bx, by, bz].every((n) => Number.isFinite(n) && n > 0)) return

  buildVolumeOverlay = new THREE.Group()
  addWireBox(buildVolumeOverlay, bx, by, bz, 0x64748b, 0.85)

  if (margin > 0 && ix > 0 && iy > 0) {
    addWireBox(buildVolumeOverlay, ix, iy, bz, 0x3b82f6, 0.65)
    const bandMaterial = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const slabs = [
      { w: margin, d: by, x: (bx - margin) / 2, y: 0 },
      { w: margin, d: by, x: -(bx - margin) / 2, y: 0 },
      { w: ix, d: margin, x: 0, y: (by - margin) / 2 },
      { w: ix, d: margin, x: 0, y: -(by - margin) / 2 },
    ]
    slabs.forEach(({ w, d, x, y }) => {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, d, bz), bandMaterial)
      slab.position.set(x, y, bz / 2)
      slab.renderOrder = 2
      buildVolumeOverlay.add(slab)
    })
  }

  scene.add(buildVolumeOverlay)
}

function addWireBox(group, width, depth, height, color, opacity) {
  const box = new THREE.BoxGeometry(width, depth, height)
  const edges = new THREE.EdgesGeometry(box)
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
  line.position.set(0, 0, height / 2)
  group.add(line)
  box.dispose()
}

function drawGridOverlay(geometry, divisions) {
  if (gridOverlay) {
    scene.remove(gridOverlay)
    gridOverlay = null
  }
  if (!geometry || !divisions) return
  const [dx, dy, dz] = divisions
  if (dx < 2 && dy < 2 && dz < 2) return

  geometry.computeBoundingBox()
  const bb = geometry.boundingBox
  const center = new THREE.Vector3().copy(bb.min).add(bb.max).multiplyScalar(0.5)
  const size = new THREE.Vector3().copy(bb.max).sub(bb.min)

  gridOverlay = new THREE.Group()
  const { color, opacity } = splitPlaneColor()
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity })

  function drawPlane(axis, pos) {
    const w = axis === 0 ? 0.01 : size.x
    const h = axis === 1 ? 0.01 : size.y
    const d = axis === 2 ? 0.01 : size.z
    const geo = new THREE.BoxGeometry(w || 0.01, h || 0.01, d || 0.01)
    const edges = new THREE.EdgesGeometry(geo)
    const line = new THREE.LineSegments(edges, mat)
    const p = new THREE.Vector3(
      axis === 0 ? pos : center.x,
      axis === 1 ? pos : center.y,
      axis === 2 ? pos : center.z,
    )
    line.position.copy(p)
    gridOverlay.add(line)
    geo.dispose()
  }

  const start = new THREE.Vector3().copy(bb.min)
  for (let ix = 1; ix < dx; ix++) {
    drawPlane(0, start.x + size.x * ix / dx)
  }
  for (let iy = 1; iy < dy; iy++) {
    drawPlane(1, start.y + size.y * iy / dy)
  }
  for (let iz = 1; iz < dz; iz++) {
    drawPlane(2, start.z + size.z * iz / dz)
  }

  if (gridOverlay.children.length > 0) {
    scene.add(gridOverlay)
  }
}

function fitCamera(box) {
  if (box.isEmpty()) return
  const sphere = new THREE.Sphere()
  box.getBoundingSphere(sphere)
  const center = sphere.center
  const radius = Math.max(sphere.radius, 1)
  const dist = calculatePerspectiveFitDistance(box, camera.fov, camera.aspect, 1.45)
  const direction = props.upAxis === 'Z'
    ? new THREE.Vector3(0.75, 0.62, 0.62)
    : new THREE.Vector3(0.7, 0.5, 1)

  camera.position.copy(center).addScaledVector(direction.normalize(), dist)
  camera.near = Math.max(0.01, dist / 1000)
  camera.far = dist + radius * 8
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
  requestRender()
}

function renderScene() {
  if (renderer && scene && camera) renderer.render(scene, camera)
}

function requestRender() {
  if (isUnmounting) return
  if (renderFrame) return
  renderFrame = requestAnimationFrame(() => {
    renderFrame = null
    renderScene()
  })
}

function buildConnectorMarkers(positions) {
  if (connectorMarkers) {
    stopConnectorAnimation()
    scene.remove(connectorMarkers)
    connectorMarkers.children.forEach((c) => {
      c.geometry?.dispose()
      c.material?.dispose()
    })
    connectorMarkers = null
  }
  if (!positions || positions.length === 0) return
  connectorMarkers = new THREE.Group()
  for (const entry of positions) {
    const pos = new THREE.Vector3(entry.position.x, entry.position.y, entry.position.z)
    const normal = new THREE.Vector3()
    normal.setComponent(entry.axis, entry.plane > 0 ? 1 : -1)
    const markerPos = pos.clone().add(normal.clone().multiplyScalar(1.5))
    const color = CONNECTOR_MARKER_COLORS[entry.type] || 0x00e5ff
    const baseRadius = Math.max(entry.radius * 0.5, 2)
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    )
    marker.position.copy(markerPos)
    marker.scale.setScalar(baseRadius)
    marker.userData.connectorId = entry.id
    marker.userData.isConnectorMarker = true
    marker.userData.baseRadius = baseRadius
    connectorMarkers.add(marker)
  }
  scene.add(connectorMarkers)
  startConnectorAnimation()
}

function startConnectorAnimation() {
  if (markerAnimId) return
  function tick() {
    if (!connectorMarkers || !scene) {
      markerAnimId = null
      return
    }
    const phase = Date.now() * 0.003
    connectorMarkers.children.forEach((marker) => {
      if (!marker.userData.isConnectorMarker) return
      const pulse = 1 + Math.sin(phase) * 0.15
      const s = marker.userData.baseRadius * pulse
      marker.scale.setScalar(s)
    })
    renderScene()
    markerAnimId = requestAnimationFrame(tick)
  }
  markerAnimId = requestAnimationFrame(tick)
}

function stopConnectorAnimation() {
  if (markerAnimId) {
    cancelAnimationFrame(markerAnimId)
    markerAnimId = null
  }
}

function getPointerNDC(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function findConnectorMarker(intersects) {
  for (const hit of intersects) {
    if (hit.object.userData?.isConnectorMarker) {
      return hit.object.userData.connectorId
    }
  }
  return null
}

function onPointerDown(event) {
  if (props.reapplyingConnectors) return
  getPointerNDC(event)
  raycaster.setFromCamera(pointer, camera)
  const targets = connectorMarkers ? [connectorMarkers] : []
  if (!targets.length) return
  const intersects = raycaster.intersectObjects(targets, true)
  const connectorId = findConnectorMarker(intersects)
  if (!connectorId) return
  const entry = props.connectorPositions.find(e => e.id === connectorId)
  if (!entry) return
  const pos = new THREE.Vector3(entry.position.x, entry.position.y, entry.position.z)
  const normal = new THREE.Vector3()
  normal.setComponent(entry.axis, 1)
  dragPlane.setFromNormalAndCoplanarPoint(normal, pos)
  const planeIntersect = new THREE.Vector3()
  raycaster.ray.intersectPlane(dragPlane, planeIntersect)
  if (!planeIntersect) return
  dragOffset.copy(pos).sub(planeIntersect)
  dragConnector = entry
  isDragging = true
  controls.enabled = false
  renderer.domElement.style.cursor = 'grabbing'
  event.preventDefault()
}

function onPointerMove(event) {
  if (!isDragging || !dragConnector) return
  getPointerNDC(event)
  raycaster.setFromCamera(pointer, camera)
  const planeIntersect = new THREE.Vector3()
  raycaster.ray.intersectPlane(dragPlane, planeIntersect)
  if (!planeIntersect) return
  const rawPos = planeIntersect.add(dragOffset)
  const clampedPos = clampToFaceBounds(rawPos, dragConnector)
  const marker = connectorMarkers?.children.find(
    (c) => c.userData.connectorId === dragConnector.id,
  )
  if (marker) {
    const normal = new THREE.Vector3()
    normal.setComponent(dragConnector.axis, dragConnector.plane > 0 ? 1 : -1)
    marker.position.copy(clampedPos).add(normal.clone().multiplyScalar(1.5))
    requestRender()
  }
}

function onPointerUp(event) {
  if (!isDragging || !dragConnector) return
  isDragging = false
  controls.enabled = true
  renderer.domElement.style.cursor = ''
  const entry = dragConnector
  dragConnector = null
  const pos = new THREE.Vector3()
  const marker = connectorMarkers?.children.find(
    (c) => c.userData.connectorId === entry.id,
  )
  if (marker) {
    const normal = new THREE.Vector3()
    normal.setComponent(entry.axis, entry.plane > 0 ? 1 : -1)
    pos.copy(marker.position).sub(normal.clone().multiplyScalar(1.5))
  } else {
    pos.set(entry.position.x, entry.position.y, entry.position.z)
  }
  emit('connector-drag-end', entry.id, { x: pos.x, y: pos.y, z: pos.z })
}

function clampToFaceBounds(position, entry) {
  const clamped = position.clone()
  const { faceBounds, otherAxes } = entry
  if (faceBounds) {
    clamped.setComponent(
      otherAxes[0],
      THREE.MathUtils.clamp(position.getComponent(otherAxes[0]), faceBounds.minA, faceBounds.maxA),
    )
    clamped.setComponent(
      otherAxes[1],
      THREE.MathUtils.clamp(position.getComponent(otherAxes[1]), faceBounds.minB, faceBounds.maxB),
    )
  }
  clamped.setComponent(entry.axis, entry.plane)
  return clamped
}

function onResize() {
  if (!container.value || !renderer || !camera) return
  const w = container.value.clientWidth
  const h = container.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  applyPixelRatio()
  renderer.setSize(w, h)
  requestRender()
}

onMounted(() => {
  initScene()
  initRenderer()
  initCamera()
  initControls()
  requestRender()
  window.addEventListener('resize', onResize)
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})

onBeforeUnmount(() => {
  isUnmounting = true
  stopConnectorAnimation()
  window.removeEventListener('resize', onResize)
  renderer.domElement.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  controls?.dispose()
  if (renderFrame) cancelAnimationFrame(renderFrame)
  clearScene()
  renderer?.dispose()
})

watch(() => props.chunks, (val) => {
  if (val?.length > 0) {
    buildMeshes(val)
    buildConnectorMarkers(props.connectorPositions)
  } else if (props.meshGeometry) {
    showOriginal(props.meshGeometry, props.divisions)
    buildConnectorMarkers([])
  } else {
    clearScene()
  }
})

watch(() => props.connectorPositions, (val) => {
  buildConnectorMarkers(val)
}, { deep: true })

watch(() => props.meshGeometry, (val) => {
  if (val && (!props.chunks || props.chunks.length === 0)) {
    showOriginal(val, props.divisions)
  }
})

watch(() => props.divisions, (val) => {
  if (props.meshGeometry && (!props.chunks || props.chunks.length === 0)) {
    showOriginal(props.meshGeometry, val)
  }
}, { deep: true })

watch(() => props.buildVolume, () => {
  if (props.meshGeometry && (!props.chunks || props.chunks.length === 0)) {
    showOriginal(props.meshGeometry, props.divisions)
  }
}, { deep: true })

watch(() => props.selectedChunkIndex, (selectedChunkIndex) => {
  applyChunkVisibility(selectedChunkIndex)
  applyLabelVisibility(selectedChunkIndex)
})

watch(() => props.previewInfo?.optimized, () => {
  applyPixelRatio()
  requestRender()
})

watch(() => props.isDark, () => {
  if (scene) scene.background = new THREE.Color(sceneBackground())
  if (ambientLight) {
    const { ambient, key, fill } = lightingPreset()
    ambientLight.intensity = ambient
    keyLight.intensity = key
    fillLight.intensity = fill
  }
  if (grid) setGrid(lastGridExtent)
  if (gridOverlay && props.meshGeometry && (!props.chunks || props.chunks.length === 0)) {
    drawGridOverlay(props.meshGeometry, props.divisions)
  }
  requestRender()
})
</script>
