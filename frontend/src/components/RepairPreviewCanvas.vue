<template>
  <div ref="container" class="repair-preview-canvas"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createCadSurfaceMaterial } from '../mesh/cadMaterial'

const props = defineProps({
  geometry: { type: Object, default: null },
  color: { type: Number, default: 0x9fb3d1 },
})

const container = ref(null)
let renderer, scene, camera, controls, mesh, renderFrame, isUnmounting = false
// Bounding sphere of whatever the camera is currently framing — used to keep
// near/far sized to the model as the user zooms (OrbitControls has no dolly
// limits), matching ThreePreview's clipping behavior.
let framedSphere = null

function initScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4f6f8)
  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const key = new THREE.DirectionalLight(0xffffff, 0.9)
  key.position.set(1.1, 1.8, 1.35)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.3)
  fill.position.set(-1.2, -0.45, 0.8)
  scene.add(fill)
}

function initRenderer() {
  const el = container.value
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(el.clientWidth, el.clientHeight)
  el.appendChild(renderer.domElement)
}

function initCamera() {
  const el = container.value
  camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 10000)
  // Match the main part-list viewer (ThreePreview), which uses Z-up — without
  // this the repair preview rotates around the wrong axis relative to the
  // rest of the app.
  camera.up.set(0, 0, 1)
}

function initControls() {
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = false
  controls.addEventListener('change', () => {
    updateClippingPlanes()
    requestRender()
  })
}

// Recompute near/far from the camera's current distance to the framed model
// so it stays inside the frustum at any zoom level — without this, zooming
// in or out past the planes fixed at load time clips through the model.
function updateClippingPlanes() {
  if (!camera || !framedSphere) return
  const d = camera.position.distanceTo(framedSphere.center)
  const r = Math.max(framedSphere.radius, 1)
  camera.near = Math.max(d - r * 2, r * 0.01, 0.01)
  camera.far = d + r * 4
  camera.updateProjectionMatrix()
}

function clearMesh() {
  if (!mesh) return
  scene.remove(mesh)
  mesh.geometry?.dispose()
  mesh.material?.dispose()
  mesh = null
}

function buildMesh(geometry) {
  clearMesh()
  if (!geometry) {
    requestRender()
    return
  }
  const geom = geometry.clone()
  mesh = new THREE.Mesh(geom, createCadSurfaceMaterial(props.color))
  scene.add(mesh)
  fitCamera(geom)
  requestRender()
}

function fitCamera(geometry) {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (box.isEmpty()) return
  const sphere = new THREE.Sphere()
  box.getBoundingSphere(sphere)
  const center = sphere.center
  const radius = Math.max(sphere.radius, 1)
  const fov = camera.fov * (Math.PI / 180)
  const dist = (radius / Math.sin(fov / 2)) * 1.3
  // Same view direction as ThreePreview's Z-up framing.
  const direction = new THREE.Vector3(0.75, 0.62, 0.62).normalize()

  camera.position.copy(center).addScaledVector(direction, dist)
  framedSphere = new THREE.Sphere(center.clone(), radius)
  updateClippingPlanes()
  controls.target.copy(center)
  controls.update()
}

function renderScene() {
  if (!renderer || !scene || !camera) return
  renderer.render(scene, camera)
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
  if (!w || !h) return
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  requestRender()
}

let resizeObserver
onMounted(() => {
  initScene()
  initRenderer()
  initCamera()
  initControls()
  buildMesh(props.geometry)
  resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(container.value)
})

onBeforeUnmount(() => {
  isUnmounting = true
  resizeObserver?.disconnect()
  controls?.dispose()
  if (renderFrame) cancelAnimationFrame(renderFrame)
  clearMesh()
  renderer?.dispose()
})

watch(() => props.geometry, (geometry) => {
  buildMesh(geometry)
})
</script>

<style scoped>
.repair-preview-canvas {
  height: 100%;
  width: 100%;
}
.repair-preview-canvas :deep(canvas) {
  cursor: grab;
  display: block;
  height: 100%;
  width: 100%;
}
</style>
