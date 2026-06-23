import * as THREE from 'three'
import { calculatePerspectiveFitDistance } from './cameraFit'
import { createCadSurfaceMaterial } from './cadMaterial'

// Tiny offscreen renderer that turns a single part into a transparent PNG
// thumbnail for the parts list. One context is created lazily and reused; under
// jsdom / no-WebGL it degrades to null so callers fall back to a color swatch.
const SIZE = 168
const FOV = 36

let renderer
let scene
let camera

function ensure() {
  if (renderer) return renderer
  if (renderer === false) return null
  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')
  if (typeof document === 'undefined' || isJsdom) {
    renderer = false
    return null
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(SIZE, SIZE, false)
    renderer.setPixelRatio(1)
    scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const key = new THREE.DirectionalLight(0xffffff, 1.0)
    key.position.set(1.1, 1.8, 1.35)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.25)
    fill.position.set(-1.2, -0.5, 0.8)
    scene.add(fill)
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100000)
    camera.up.set(0, 0, 1)
    return renderer
  } catch {
    renderer = false
    return null
  }
}

export function renderPartThumbnail(geometry, color) {
  const r = ensure()
  if (!r || !geometry) return null
  const mesh = new THREE.Mesh(geometry.clone(), createCadSurfaceMaterial(color ?? 0x9fb8d6))
  scene.add(mesh)
  try {
    const box = new THREE.Box3().setFromObject(mesh)
    if (box.isEmpty()) return null
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    const dist = calculatePerspectiveFitDistance(box, camera.fov, 1, 1.5)
    const direction = new THREE.Vector3(0.8, 0.62, 0.6).normalize()
    camera.position.copy(sphere.center).addScaledVector(direction, dist)
    camera.near = Math.max(0.01, dist / 1000)
    camera.far = dist + sphere.radius * 8
    camera.lookAt(sphere.center)
    camera.updateProjectionMatrix()
    r.render(scene, camera)
    return r.domElement.toDataURL('image/png')
  } catch {
    return null
  } finally {
    scene.remove(mesh)
    mesh.geometry.dispose()
    mesh.material.dispose()
  }
}

export function disposeThumbnailRenderer() {
  if (renderer && renderer !== false) renderer.dispose()
  renderer = undefined
  scene = undefined
  camera = undefined
}
