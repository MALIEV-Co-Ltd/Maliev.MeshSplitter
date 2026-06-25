import * as THREE from 'three'
import { calculatePerspectiveFitDistance } from './cameraFit'
import { createCadSurfaceMaterial } from './cadMaterial'

// Offscreen renderer for PDF report images. One WebGLRenderer/scene/camera
// is created lazily and reused across every snapshot (browsers cap live
// WebGL contexts), then torn down with disposeSnapshotRenderer() once the
// report is built. getContext()/WebGLRenderer construction throws under
// jsdom (no WebGL) - that failure is caught here so every render* export
// degrades to `null` instead of throwing, which is what lets the PDF build
// keep working (text-only) wherever 3D rendering isn't available.

// Square render: split parts are roughly cubic and the PDF image frames are
// near-square, so a 4:3 canvas wasted big horizontal margins (and then got
// letterboxed again into the frame) — making the model look tiny. A square
// canvas + a tighter fit margin fills those frames properly.
const WIDTH = 800
const HEIGHT = 800
const CAMERA_FOV_DEGREES = 40
const CAMERA_FIT_MARGIN = 1.12
const NEUTRAL_COLOR = 0x9fb8d6
const ALREADY_PLACED_COLOR = 0xb9c2cc

let renderer
let scene
let camera

function ensureRenderer() {
  if (renderer) return renderer
  if (renderer === false) return null
  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')
  if (typeof document === 'undefined' || isJsdom) {
    renderer = false
    return null
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(WIDTH, HEIGHT, false)
    renderer.setPixelRatio(1)
    return renderer
  } catch {
    renderer = false
    return null
  }
}

function ensureScene() {
  if (scene) return
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xffffff)
  scene.add(new THREE.AmbientLight(0xffffff, 0.34))
  const key = new THREE.DirectionalLight(0xffffff, 1.05)
  key.position.set(1.1, 1.8, 1.35)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.18)
  fill.position.set(-1.2, -0.45, 0.8)
  scene.add(fill)
  camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, WIDTH / HEIGHT, 0.1, 100000)
  camera.up.set(0, 0, 1)
}

const LIGHT_COUNT = 3

export function calculateSnapshotCameraDistance(box, fovDegrees = CAMERA_FOV_DEGREES, aspect = WIDTH / HEIGHT) {
  return calculatePerspectiveFitDistance(box, fovDegrees, aspect, CAMERA_FIT_MARGIN)
}

function fitCameraToBox(box) {
  if (box.isEmpty()) return
  const sphere = new THREE.Sphere()
  box.getBoundingSphere(sphere)
  const center = sphere.center
  const radius = Math.max(sphere.radius, 1)
  const dist = calculateSnapshotCameraDistance(box, camera.fov, camera.aspect)
  const viewDirection = new THREE.Vector3(0.75, 0.62, 0.62).normalize()

  camera.position.copy(center).addScaledVector(viewDirection, dist)
  camera.near = Math.max(0.01, dist / 1000)
  camera.far = dist + radius * 8
  camera.lookAt(center)
  camera.updateProjectionMatrix()
}

// Frame one highlighted part inside the assembly so it always reads clearly:
// look from the side the part sticks out toward (assembly centre -> part) so the
// rest of the body can never hide it, tilt down for a 3/4 angle, aim at the part,
// and zoom to a fraction of the PART's size — adapting to both the part and the
// overall model rather than always framing the (growing) whole assembly. Pure and
// exported so the occlusion-avoidance + zoom geometry is unit-testable without a
// WebGL context.
export function computePartCameraView(assemblyBox, partCenter, partRadius, fovDegrees = CAMERA_FOV_DEGREES, aspect = WIDTH / HEIGHT) {
  const assemblySphere = new THREE.Sphere()
  assemblyBox.getBoundingSphere(assemblySphere)
  const assemblyCenter = assemblySphere.center
  const assemblyRadius = Math.max(assemblySphere.radius, 1)
  const radius = Math.max(partRadius, 0.5)

  // Outward direction: from the body's centre toward the part. The part then sits
  // between the camera and the body, so the body can't occlude it.
  const viewDir = new THREE.Vector3().subVectors(partCenter, assemblyCenter)
  if (viewDir.lengthSq() < 1e-6) viewDir.set(0.75, 0.62, 0.62) // part ~at centre -> default 3/4
  viewDir.normalize()
  if (viewDir.z < 0.4) viewDir.z = 0.4 // always look slightly down (camera up is +Z)
  if (Math.abs(viewDir.x) < 0.15 && Math.abs(viewDir.y) < 0.15) {
    // Part directly above/below the centre would give a flat top-down view.
    viewDir.x = 0.5
    viewDir.y = 0.35
  }
  viewDir.normalize()

  // Zoom to ~1.7x the part so it's clearly visible with a little context, but
  // never looser than the whole assembly (no point zooming out past the model).
  // The fit works off the box's bounding SPHERE, so size the cube to give a
  // bounding sphere of exactly focusRadius (side = 2*r/sqrt(3)); using side=2*r
  // makes the sphere sqrt(3)x too big and zooms way out.
  const focusRadius = Math.min(radius * 1.7, assemblyRadius * 1.15)
  const focusSide = (focusRadius * 2) / Math.sqrt(3)
  const focusBox = new THREE.Box3().setFromCenterAndSize(
    partCenter,
    new THREE.Vector3(focusSide, focusSide, focusSide),
  )
  const distance = calculatePerspectiveFitDistance(focusBox, fovDegrees, aspect, CAMERA_FIT_MARGIN)
  return {
    position: partCenter.clone().addScaledVector(viewDir, distance),
    target: partCenter.clone(),
    near: Math.max(0.01, distance / 1000),
    far: distance + assemblyRadius * 6,
    distance,
  }
}

function aimCameraAtPart(assemblyBox, partCenter, partRadius) {
  const view = computePartCameraView(assemblyBox, partCenter, partRadius, camera.fov, camera.aspect)
  camera.position.copy(view.position)
  camera.near = view.near
  camera.far = view.far
  camera.lookAt(view.target)
  camera.updateProjectionMatrix()
}

// Bounding sphere of a single mesh, for aiming the camera at a highlighted part.
function meshSphere(mesh) {
  const sphere = new THREE.Sphere()
  new THREE.Box3().setFromObject(mesh).getBoundingSphere(sphere)
  return sphere
}

function createMaterial(color, extra = {}) {
  return createCadSurfaceMaterial(color, extra)
}

function disposeGroup(group) {
  group.traverse((obj) => {
    obj.geometry?.dispose()
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
    else obj.material?.dispose()
  })
}

function computeGeometryCenter(geometry) {
  geometry.computeBoundingBox()
  return geometry.boundingBox.getCenter(new THREE.Vector3())
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

function makeLabelSprite(label, position, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(38, 38, 38, 0.92)'
  roundRect(ctx, 12, 14, 232, 64, 12)
  ctx.fill()
  ctx.strokeStyle = `#${new THREE.Color(color ?? NEUTRAL_COLOR).getHexString()}`
  ctx.lineWidth = 6
  roundRect(ctx, 12, 14, 232, 64, 12)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 28px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(label), 128, 47, 210)

  const texture = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }))
  sprite.position.copy(position)
  sprite.scale.set(48, 18, 1)
  return sprite
}

function withClearScene(fn, fitFn) {
  const r = ensureRenderer()
  if (!r) return null
  ensureScene()
  while (scene.children.length > LIGHT_COUNT) {
    scene.remove(scene.children[LIGHT_COUNT])
  }
  const group = new THREE.Group()
  scene.add(group)
  const box = new THREE.Box3()
  try {
    fn(group, box)
    if (group.children.length === 0 || box.isEmpty()) return null
    ;(fitFn || fitCameraToBox)(box)
    r.render(scene, camera)
    // JPEG: jsPDF stores addImage('PNG', ...) uncompressed, which blew a
    // 4-part report up to ~23MB. These are photographic 3D renders, not
    // line art, so JPEG's compression is also the better fit visually.
    return r.domElement.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  } finally {
    disposeGroup(group)
    scene.remove(group)
  }
}

/** The pre-split, original mesh - "what this is supposed to look like". */
export function renderWholeMesh(geometry) {
  if (!geometry) return null
  return withClearScene((group, box) => {
    const mesh = new THREE.Mesh(geometry.clone(), createMaterial(NEUTRAL_COLOR))
    group.add(mesh)
    box.expandByObject(mesh)
  })
}

/** All parts together, each in its assigned color; labels optional. */
export function renderAssembly(chunks, { labels = false } = {}) {
  return withClearScene((group, box) => {
    chunks.forEach((chunk) => {
      if (!chunk.geometry) return
      const mesh = new THREE.Mesh(chunk.geometry.clone(), createMaterial(chunk.color ?? NEUTRAL_COLOR))
      group.add(mesh)
      box.expandByObject(mesh)
      if (labels) {
        group.add(makeLabelSprite(chunk.label, chunk.centroid ?? computeGeometryCenter(chunk.geometry), chunk.color))
      }
    })
  })
}

/** One part highlighted opaque inside the full assembly; the rest fades out. */
export function renderPartInContext(chunks, selectedIndex) {
  let selectedCenter = null
  let selectedRadius = 0
  return withClearScene((group, box) => {
    chunks.forEach((chunk) => {
      if (!chunk.geometry) return
      const isSelected = chunk.index === selectedIndex
      const mat = isSelected
        ? createMaterial(chunk.color ?? NEUTRAL_COLOR)
        : createMaterial(chunk.color ?? NEUTRAL_COLOR, { transparent: true, opacity: 0.12, depthWrite: false })
      const mesh = new THREE.Mesh(chunk.geometry.clone(), mat)
      mesh.renderOrder = isSelected ? 0 : 1
      group.add(mesh)
      box.expandByObject(mesh)
      if (isSelected) {
        const sphere = meshSphere(mesh)
        selectedCenter = sphere.center.clone()
        selectedRadius = sphere.radius
      }
    })
  }, (box) => (selectedCenter ? aimCameraAtPart(box, selectedCenter, selectedRadius) : fitCameraToBox(box)))
}

/** A single part, alone, fit tightly in frame. */
export function renderPartIsolated(chunk) {
  if (!chunk?.geometry) return null
  return withClearScene((group, box) => {
    const mesh = new THREE.Mesh(chunk.geometry.clone(), createMaterial(chunk.color ?? NEUTRAL_COLOR))
    group.add(mesh)
    box.expandByObject(mesh)
  })
}

/**
 * Assembly-sequence step: parts before `stepIndex` (already placed) render
 * neutral grey, the part at `stepIndex` (being added this step) renders in
 * its real color, and anything after hasn't been placed yet.
 */
export function renderAssemblyStep(orderedChunks, stepIndex) {
  let newCenter = null
  let newRadius = 0
  return withClearScene((group, box) => {
    orderedChunks.forEach((chunk, i) => {
      if (!chunk.geometry || i > stepIndex) return
      const isNew = i === stepIndex
      const mat = createMaterial(isNew ? (chunk.color ?? NEUTRAL_COLOR) : ALREADY_PLACED_COLOR)
      const mesh = new THREE.Mesh(chunk.geometry.clone(), mat)
      group.add(mesh)
      box.expandByObject(mesh)
      if (isNew) {
        const sphere = meshSphere(mesh)
        newCenter = sphere.center.clone()
        newRadius = sphere.radius
      }
    })
  }, (box) => (newCenter ? aimCameraAtPart(box, newCenter, newRadius) : fitCameraToBox(box)))
}

export function disposeSnapshotRenderer() {
  if (renderer) renderer.dispose()
  renderer = undefined
  scene = undefined
  camera = undefined
}
