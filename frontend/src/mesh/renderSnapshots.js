import * as THREE from 'three'

// Offscreen renderer for PDF report images. One WebGLRenderer/scene/camera
// is created lazily and reused across every snapshot (browsers cap live
// WebGL contexts), then torn down with disposeSnapshotRenderer() once the
// report is built. getContext()/WebGLRenderer construction throws under
// jsdom (no WebGL) - that failure is caught here so every render* export
// degrades to `null` instead of throwing, which is what lets the PDF build
// keep working (text-only) wherever 3D rendering isn't available.

const WIDTH = 900
const HEIGHT = 675
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
  scene.add(new THREE.AmbientLight(0xffffff, 0.65))
  const key = new THREE.DirectionalLight(0xffffff, 0.85)
  key.position.set(1, 2, 1.4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.35)
  fill.position.set(-1, -0.4, 1)
  scene.add(fill)
  camera = new THREE.PerspectiveCamera(40, WIDTH / HEIGHT, 0.1, 100000)
  camera.up.set(0, 0, 1)
}

const LIGHT_COUNT = 3

function fitCameraToBox(box) {
  if (box.isEmpty()) return
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const dist = maxDim * 1.7
  camera.position.set(center.x + dist * 0.75, center.y + dist * 0.62, center.z + dist * 0.62)
  camera.near = Math.max(0.01, dist / 1000)
  camera.far = dist * 10
  camera.lookAt(center)
  camera.updateProjectionMatrix()
}

function createMaterial(color, extra = {}) {
  return new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide, ...extra })
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

function withClearScene(fn) {
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
    fitCameraToBox(box)
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
    })
  })
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
  return withClearScene((group, box) => {
    orderedChunks.forEach((chunk, i) => {
      if (!chunk.geometry || i > stepIndex) return
      const isNew = i === stepIndex
      const mat = createMaterial(isNew ? (chunk.color ?? NEUTRAL_COLOR) : ALREADY_PLACED_COLOR)
      const mesh = new THREE.Mesh(chunk.geometry.clone(), mat)
      group.add(mesh)
      box.expandByObject(mesh)
    })
  })
}

export function disposeSnapshotRenderer() {
  if (renderer) renderer.dispose()
  renderer = undefined
  scene = undefined
  camera = undefined
}
