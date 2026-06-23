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

const props = defineProps({
  chunks: { type: Array, default: () => [] },
  meshInfo: { type: Object, default: null },
  meshGeometry: { type: Object, default: null },
  buildVolume: { type: Array, default: () => [250, 250, 250] },
  divisions: { type: Array, default: () => [2, 2, 1] },
  upAxis: { type: String, default: 'Z' },
  selectedChunkIndex: { type: Number, default: null },
  previewInfo: { type: Object, default: null },
})

const container = ref(null)
const selectedOpacity = 0.22

let renderer, scene, camera, controls, meshGroup, gridOverlay, renderFrame, isUnmounting = false
const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x34495e]

function initScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xffffff)
  scene.add(new THREE.AmbientLight(0xffffff, 0.34))
  const key = new THREE.DirectionalLight(0xffffff, 1.05)
  key.position.set(1.1, 1.8, 1.35)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.18)
  fill.position.set(-1.2, -0.45, 0.8)
  scene.add(fill)
  const grid = new THREE.GridHelper(500, 20, 0x8fb4e8, 0xe5e9ee)
  if (props.upAxis === 'Z') grid.rotation.x = -Math.PI / 2
  scene.add(grid)
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
  requestRender()
}

function buildMeshes(chunks) {
  clearScene()
  if (!chunks || chunks.length === 0) return
  meshGroup = new THREE.Group()
  const box = new THREE.Box3()
  chunks.forEach((chunk, i) => {
    if (!chunk.geometry) return
    const geom = chunk.geometry.clone()
    const color = chunk.color || COLORS[i % COLORS.length]
    const mat = createCadSurfaceMaterial(color)
    const mesh = new THREE.Mesh(geom, mat)
    mesh.userData.chunkIndex = chunk.index
    meshGroup.add(mesh)
    meshGroup.add(createLabelSprite(chunk.label || `P${i + 1}`, chunk.centroid || computeGeometryCenter(geom), color))
    box.expandByObject(mesh)
  })
  if (meshGroup.children.length === 0) return
  scene.add(meshGroup)
  applyChunkVisibility(props.selectedChunkIndex)
  fitCamera(box)
  requestRender()
}

function applyChunkVisibility(selectedChunkIndex) {
  if (!meshGroup) return
  const hasSelection = selectedChunkIndex !== null
  meshGroup.children.forEach((child) => {
    if (!child.isMesh) return
    const isSelected = !hasSelection || selectedChunkIndex === child.userData.chunkIndex
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

function computeGeometryCenter(geometry) {
  geometry.computeBoundingBox()
  return geometry.boundingBox.getCenter(new THREE.Vector3())
}

function createLabelSprite(label, position, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(38, 38, 38, 0.92)'
  roundRect(ctx, 12, 14, 232, 64, 12)
  ctx.fill()
  ctx.strokeStyle = `#${new THREE.Color(color).getHexString()}`
  ctx.lineWidth = 6
  roundRect(ctx, 12, 14, 232, 64, 12)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 28px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 128, 47, 210)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.position.copy(position)
  sprite.position.z += 12
  sprite.scale.set(48, 18, 1)
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
  fitCamera(box)
  requestRender()
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
  const mat = new THREE.LineBasicMaterial({ color: 0x2f3338, transparent: true, opacity: 0.55 })

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
})

onBeforeUnmount(() => {
  isUnmounting = true
  window.removeEventListener('resize', onResize)
  controls?.dispose()
  if (renderFrame) cancelAnimationFrame(renderFrame)
  clearScene()
  renderer?.dispose()
})

watch(() => props.chunks, (val) => {
  if (val?.length > 0) {
    buildMeshes(val)
  } else if (props.meshGeometry) {
    showOriginal(props.meshGeometry, props.divisions)
  } else {
    clearScene()
  }
})

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

watch(() => props.selectedChunkIndex, (selectedChunkIndex) => {
  applyChunkVisibility(selectedChunkIndex)
})

watch(() => props.previewInfo?.optimized, () => {
  applyPixelRatio()
  requestRender()
})
</script>
