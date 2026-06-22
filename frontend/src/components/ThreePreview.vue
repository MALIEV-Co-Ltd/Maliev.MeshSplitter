<template>
  <div ref="container" class="preview-canvas"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const props = defineProps({
  chunks: { type: Array, default: () => [] },
  meshInfo: { type: Object, default: null },
  meshGeometry: { type: Object, default: null },
  buildVolume: { type: Array, default: () => [250, 250, 250] },
  divisions: { type: Array, default: () => [2, 2, 1] },
  upAxis: { type: String, default: 'Z' },
  selectedChunkIndex: { type: Number, default: null },
})

const container = ref(null)
const selectedOpacity = 0.22

let renderer, scene, camera, controls, meshGroup, gridOverlay
const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x34495e]

function initScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xe8e8e8)
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const dir = new THREE.DirectionalLight(0xffffff, 0.8)
  dir.position.set(1, 2, 1)
  scene.add(dir)
  const grid = new THREE.GridHelper(500, 20)
  if (props.upAxis === 'Z') grid.rotation.x = -Math.PI / 2
  scene.add(grid)
}

function initRenderer() {
  const el = container.value
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(el.clientWidth, el.clientHeight)
  el.appendChild(renderer.domElement)
}

function initCamera() {
  const el = container.value
  camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 10000)
  if (props.upAxis === 'Z') camera.up.set(0, 0, 1)
}

function initControls() {
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.1
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
}

function clearScene() {
  disposeGroup(meshGroup)
  meshGroup = null
  if (gridOverlay) {
    scene.remove(gridOverlay)
    gridOverlay = null
  }
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
    const mat = new THREE.MeshPhongMaterial({
      color,
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    })
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
}

function applyChunkVisibility(selectedChunkIndex) {
  if (!meshGroup) return
  meshGroup.children.forEach((child) => {
    if (!child.isMesh) return
    const isSelected = selectedChunkIndex === null || selectedChunkIndex === child.userData.chunkIndex
    child.material.opacity = isSelected ? 0.9 : selectedOpacity
    child.material.transparent = true
    child.material.needsUpdate = true
    child.renderOrder = isSelected ? 1 : 0
  })
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
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'
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
  const mat = new THREE.MeshPhongMaterial({
    color: 0x4a90d9, side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geom, mat)
  meshGroup.add(mesh)
  const box = new THREE.Box3().expandByObject(mesh)
  scene.add(meshGroup)
  drawGridOverlay(geometry, divisions)
  fitCamera(box)
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
  const mat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 })

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
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const dist = maxDim * 1.5

  if (props.upAxis === 'Z') {
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7)
  } else {
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist)
  }
  controls.target.copy(center)
  controls.update()
}

function animate() {
  requestAnimationFrame(animate)
  controls?.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
}

function onResize() {
  if (!container.value || !renderer || !camera) return
  const w = container.value.clientWidth
  const h = container.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

onMounted(() => {
  initScene()
  initRenderer()
  initCamera()
  initControls()
  animate()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  controls?.dispose()
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
}, { deep: true })

watch(() => props.meshGeometry, (val) => {
  if (val && (!props.chunks || props.chunks.length === 0)) {
    showOriginal(val, props.divisions)
  }
}, { deep: true })

watch(() => props.divisions, (val) => {
  if (props.meshGeometry && (!props.chunks || props.chunks.length === 0)) {
    showOriginal(props.meshGeometry, val)
  }
}, { deep: true })

watch(() => props.selectedChunkIndex, (selectedChunkIndex) => {
  applyChunkVisibility(selectedChunkIndex)
})
</script>
