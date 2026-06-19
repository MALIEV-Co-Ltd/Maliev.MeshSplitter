<template>
  <div ref="container" class="w-full h-[500px]"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const props = defineProps({
  chunks: { type: Array, default: () => [] },
  meshInfo: { type: Object, default: null },
})

const container = ref(null)

let renderer, scene, camera, controls, meshGroup
const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x34495e]

function initScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x888888)
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const dir = new THREE.DirectionalLight(0xffffff, 0.8)
  dir.position.set(1, 2, 1)
  scene.add(dir)
  scene.add(new THREE.GridHelper(500, 20))
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
}

function initControls() {
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.1
}

function disposeGroup(group) {
  if (!group) return
  group.children.forEach((c) => {
    if (c.isMesh) {
      c.geometry?.dispose()
      c.material?.dispose()
    }
  })
  scene?.remove(group)
}

function buildMeshes(chunks) {
  disposeGroup(meshGroup)
  meshGroup = null
  if (!chunks || chunks.length === 0) return

  meshGroup = new THREE.Group()
  const box = new THREE.Box3()

  chunks.forEach((chunk, i) => {
    const geom = chunk.geometry.clone()
    const mat = new THREE.MeshPhongMaterial({
      color: chunk.color || COLORS[i % COLORS.length],
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geom, mat)
    meshGroup.add(mesh)
    box.expandByObject(mesh)
  })

  scene.add(meshGroup)
  fitCamera(box)
}

function fitCamera(box) {
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const dist = maxDim * 1.5

  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist)
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
  disposeGroup(meshGroup)
  renderer?.dispose()
})

watch(() => props.chunks, (val) => buildMeshes(val), { deep: true })
</script>
