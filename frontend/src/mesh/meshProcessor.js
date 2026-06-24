import * as THREE from 'three'
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url'
import malievLogoWhiteSvg from '../assets/logos/maliev-wordmark-white.svg?raw'

let manifoldModulePromise

function computeVolumeImpl(geometry) {
  const pos = geometry.attributes.position
  const index = geometry.index
  let volume = 0

  function processTriangle(i0, i1, i2) {
    const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0)
    const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1)
    const cx = pos.getX(i2), cy = pos.getY(i2), cz = pos.getZ(i2)
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)
  }

  if (index) {
    const indices = index.array
    for (let i = 0; i < indices.length; i += 3) {
      processTriangle(indices[i], indices[i + 1], indices[i + 2])
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      processTriangle(i, i + 1, i + 2)
    }
  }

  return Math.abs(volume / 6)
}

function manifoldWasmPath(path) {
  if (!path.endsWith('.wasm')) return path
  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')
  if (isJsdom || (typeof process !== 'undefined' && process.versions?.node && typeof window === 'undefined')) {
    const filePath = new URL('../../node_modules/manifold-3d/manifold.wasm', import.meta.url).pathname
    return decodeURIComponent(filePath).replace(/^\/([A-Za-z]:)/, '$1')
  }
  return manifoldWasmUrl
}

function isNodeRuntime() {
  return typeof process !== 'undefined' && process.versions?.node
}

async function loadManifoldWasmBinary() {
  if (isNodeRuntime()) {
    const [{ readFile }, path] = await Promise.all([
      import('node:fs/promises'),
      import('node:path'),
    ])
    return readFile(path.join(process.cwd(), 'node_modules', 'manifold-3d', 'manifold.wasm'))
  }

  const response = await fetch(manifoldWasmUrl)
  if (!response.ok) {
    throw new Error(`Unable to load the geometry engine (${response.status})`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

export function validateManifold(geometry) {
  const pos = geometry.attributes.position
  const index = geometry.index
  const vertCount = pos.count
  const faceCount = index ? index.count / 3 : pos.count / 3

  function posKey(idx) {
    return `${pos.getX(idx).toFixed(3)},${pos.getY(idx).toFixed(3)},${pos.getZ(idx).toFixed(3)}`
  }

  const edgeMap = new Map()
  const addEdge = (i1, i2) => {
    const k1 = posKey(i1)
    const k2 = posKey(i2)
    const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
    edgeMap.set(key, (edgeMap.get(key) || 0) + 1)
  }

  if (index) {
    const indices = index.array
    for (let i = 0; i < indices.length; i += 3) {
      addEdge(indices[i], indices[i + 1])
      addEdge(indices[i + 1], indices[i + 2])
      addEdge(indices[i + 2], indices[i])
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      addEdge(i, i + 1)
      addEdge(i + 1, i + 2)
      addEdge(i + 2, i)
    }
  }

  const watertight = Array.from(edgeMap.values()).every(c => c === 2)
  const edgeCount = edgeMap.size
  const uniqueVerts = new Set()
  for (let i = 0; i < pos.count; i++) {
    uniqueVerts.add(posKey(i))
  }
  const euler = uniqueVerts.size - edgeCount + faceCount

  let volume
  try {
    volume = computeVolumeImpl(geometry)
  } catch {
    volume = computeVolumeImpl(geometry)
  }

  return { watertight, volume, euler, faceCount, vertCount }
}

export function computeVolume(geometry) {
  return computeVolumeImpl(geometry)
}

export function repairMeshGeometry(geometry, tolerance = 1e-4) {
  const cleaned = weldGeometry(geometry, tolerance)
  const boundaryLoops = findBoundaryLoops(cleaned, tolerance)
  if (boundaryLoops.length === 0) {
    cleaned.computeBoundingBox()
    cleaned.computeVertexNormals()
    return cleaned
  }

  const positions = Array.from(cleaned.attributes.position.array)
  const indices = cleaned.index
    ? Array.from(cleaned.index.array)
    : Array.from({ length: cleaned.attributes.position.count }, (_, i) => i)
  cleaned.computeBoundingBox()
  const meshCenter = new THREE.Vector3()
  cleaned.boundingBox.getCenter(meshCenter)

  boundaryLoops.forEach((loop) => {
    if (loop.length < 3 || loop.length > 96) return
    const centerIndex = positions.length / 3
    const center = loop.reduce((acc, idx) => {
      acc.x += positions[idx * 3]
      acc.y += positions[idx * 3 + 1]
      acc.z += positions[idx * 3 + 2]
      return acc
    }, new THREE.Vector3()).divideScalar(loop.length)
    positions.push(center.x, center.y, center.z)

    for (let i = 0; i < loop.length; i += 1) {
      const a = loop[i]
      const b = loop[(i + 1) % loop.length]
      const normal = triangleNormalFromPositions(positions, a, b, centerIndex)
      const outward = center.clone().sub(meshCenter)
      if (normal.dot(outward) < 0) {
        indices.push(b, a, centerIndex)
      } else {
        indices.push(a, b, centerIndex)
      }
    }
  })

  const repaired = new THREE.BufferGeometry()
  repaired.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  repaired.setIndex(indices)
  repaired.computeBoundingBox()
  repaired.computeVertexNormals()
  return repaired
}

function triangleNormalFromPositions(positions, a, b, c) {
  const va = new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2])
  const vb = new THREE.Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2])
  const vc = new THREE.Vector3(positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2])
  return vb.sub(va).cross(vc.sub(va)).normalize()
}

function weldGeometry(geometry, tolerance) {
  const source = geometry
  const position = source.attributes.position
  const scale = 1 / tolerance
  const vertices = []
  const vertexMap = new Map()
  const remap = []

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const key = `${Math.round(x * scale)}:${Math.round(y * scale)}:${Math.round(z * scale)}`
    let mapped = vertexMap.get(key)
    if (mapped === undefined) {
      mapped = vertices.length / 3
      vertexMap.set(key, mapped)
      vertices.push(x, y, z)
    }
    remap[i] = mapped
  }

  const rawIndices = source.index
    ? Array.from(source.index.array, (idx) => remap[idx])
    : Array.from({ length: position.count }, (_, i) => remap[i])
  const indices = []
  for (let i = 0; i < rawIndices.length; i += 3) {
    const a = rawIndices[i]
    const b = rawIndices[i + 1]
    const c = rawIndices[i + 2]
    if (a === b || b === c || c === a) continue
    indices.push(a, b, c)
  }

  const welded = new THREE.BufferGeometry()
  welded.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  welded.setIndex(indices)
  welded.computeBoundingBox()
  welded.computeVertexNormals()
  return welded
}

function findBoundaryLoops(geometry) {
  const index = geometry.index
  if (!index) return []

  const edgeMap = new Map()
  const addEdge = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    const edge = edgeMap.get(key) || { a, b, count: 0 }
    edge.count += 1
    edgeMap.set(key, edge)
  }

  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i)
    const b = index.getX(i + 1)
    const c = index.getX(i + 2)
    addEdge(a, b)
    addEdge(b, c)
    addEdge(c, a)
  }

  const adjacency = new Map()
  edgeMap.forEach((edge) => {
    if (edge.count !== 1) return
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, new Set())
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, new Set())
    adjacency.get(edge.a).add(edge.b)
    adjacency.get(edge.b).add(edge.a)
  })

  const visitedEdges = new Set()
  const loops = []
  const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`)

  adjacency.forEach((neighbors, start) => {
    neighbors.forEach((firstNeighbor) => {
      const firstKey = edgeKey(start, firstNeighbor)
      if (visitedEdges.has(firstKey)) return

      const loop = [start]
      let prev = start
      let current = firstNeighbor
      visitedEdges.add(firstKey)

      for (let guard = 0; guard < adjacency.size + 3; guard += 1) {
        loop.push(current)
        const next = [...(adjacency.get(current) || [])].find((candidate) => {
          if (candidate === prev && adjacency.get(current).size > 1) return false
          return !visitedEdges.has(edgeKey(current, candidate)) || candidate === start
        })
        if (next === undefined || next === start) break
        visitedEdges.add(edgeKey(current, next))
        prev = current
        current = next
      }

      if (loop.length >= 3) loops.push(loop)
    })
  })

  return loops
}

export function applyScale(geometry, scaleFactor) {
  const factor = Number(scaleFactor)
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error('Scale factor must be greater than zero')
  }

  const scaled = geometry.clone()
  scaled.scale(factor, factor, factor)
  scaled.computeBoundingBox()
  scaled.computeVertexNormals()
  return scaled
}

async function getManifoldModule() {
  if (!manifoldModulePromise) {
    manifoldModulePromise = import('manifold-3d').then(async (mod) => {
      const wasmBinary = await loadManifoldWasmBinary()
      const api = await mod.default({
        locateFile: manifoldWasmPath,
        wasmBinary,
      })
      api.setup()
      return api
    })
  }
  return manifoldModulePromise
}

function geometryToManifoldMesh(geometry, manifold) {
  const source = geometry.clone()
  source.computeVertexNormals()
  const pos = source.attributes.position
  const vertProperties = []
  const vertexMap = new Map()
  const remap = []

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`
    let mapped = vertexMap.get(key)
    if (mapped === undefined) {
      mapped = vertexMap.size
      vertexMap.set(key, mapped)
      vertProperties.push(x, y, z)
    }
    remap[i] = mapped
  }

  const triVerts = []
  if (source.index) {
    const index = source.index.array
    for (let i = 0; i < index.length; i++) {
      triVerts.push(remap[index[i]])
    }
  } else {
    for (let i = 0; i < pos.count; i++) {
      triVerts.push(remap[i])
    }
  }

  const mesh = new manifold.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(vertProperties),
    triVerts: new Uint32Array(triVerts),
  })
  source.dispose()
  return mesh
}

function manifoldMeshToGeometry(mesh) {
  const positions = new Float32Array(mesh.numVert * 3)
  for (let i = 0; i < mesh.numVert; i++) {
    positions[i * 3] = mesh.vertProperties[i * mesh.numProp]
    positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1]
    positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2]
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1))
  geometry.computeBoundingBox()
  geometry.computeVertexNormals()
  return geometry
}

function chunkLabel(partNumber, ix, iy, iz, bodyIndex = 0, bodyCount = 1) {
  const base = `P${String(partNumber).padStart(2, '0')}-X${ix}Y${iy}Z${iz}`
  return bodyCount > 1 ? `${base}-B${bodyIndex + 1}` : base
}

export async function splitMeshManifold(mesh, buildVolume, gridDivisions) {
  let splitGeometry = mesh.geometry
  const info = validateManifold(splitGeometry)
  if (!info.watertight) {
    const repaired = repairMeshGeometry(splitGeometry)
    const repairedInfo = validateManifold(repaired)
    if (!repairedInfo.watertight) {
      throw new Error('Mesh is non-manifold and could not be repaired automatically. Try repairing larger holes in your CAD or slicer before export.')
    }
    splitGeometry = repaired
  }

  const [dx, dy, dz] = gridDivisions.map(Number)
  if (dx === 0 || dy === 0 || dz === 0) return []
  if (![dx, dy, dz].every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error('Grid divisions must be positive whole numbers')
  }

  const manifold = await getManifoldModule()
  const manifoldMesh = geometryToManifoldMesh(splitGeometry, manifold)
  const solid = manifold.Manifold.ofMesh(manifoldMesh)
  const status = solid.status()
  if (status !== 'NoError') {
    solid.delete?.()
    throw new Error(`Input mesh is not manifold (${status})`)
  }

  splitGeometry.computeBoundingBox()
  const bb = splitGeometry.boundingBox
  const meshCenter = new THREE.Vector3().copy(bb.min).add(bb.max).multiplyScalar(0.5)
  const meshSize = new THREE.Vector3().copy(bb.max).sub(bb.min)
  const cellSize = [meshSize.x / dx, meshSize.y / dy, meshSize.z / dz]
  const chunks = []
  let partNumber = 1

  try {
    for (let iz = 0; iz < dz; iz++) {
      for (let iy = 0; iy < dy; iy++) {
        for (let ix = 0; ix < dx; ix++) {
          const cx = meshCenter.x - meshSize.x / 2 + cellSize[0] * (ix + 0.5)
          const cy = meshCenter.y - meshSize.y / 2 + cellSize[1] * (iy + 0.5)
          const cz = meshCenter.z - meshSize.z / 2 + cellSize[2] * (iz + 0.5)
          const cutter = manifold.Manifold.cube(cellSize, true).translate([cx, cy, cz])
          const part = solid.intersect(cutter)
          cutter.delete?.()

          try {
            if (part.isEmpty()) continue
            const manifoldStatus = part.status()
            if (manifoldStatus !== 'NoError') {
              throw new Error(`Split part failed manifold validation (${manifoldStatus})`)
            }

            const resultMesh = part.getMesh()
            const geometry = manifoldMeshToGeometry(resultMesh)
            const components = splitDisconnectedComponents(geometry)
            components.forEach((componentGeometry, bodyIndex) => {
              const label = chunkLabel(partNumber, ix, iy, iz, bodyIndex, components.length)
              chunks.push({
                index: partNumber - 1,
                assemblyOrder: partNumber,
                geometry: componentGeometry,
                label,
                bodyIndex,
                bodyCount: components.length,
                volume: computeVolume(componentGeometry),
                centroid: computeCentroid(componentGeometry),
                manifoldStatus,
              })
              partNumber += 1
            })
          } finally {
            part.delete?.()
          }
        }
      }
    }
  } finally {
    solid.delete?.()
  }

  return chunks
}

function splitDisconnectedComponents(geometry) {
  const position = geometry.attributes.position
  if (!position) return []

  const indices = geometry.index
    ? Array.from(geometry.index.array)
    : Array.from({ length: position.count }, (_, i) => i)
  const faceCount = Math.floor(indices.length / 3)
  if (faceCount <= 1) return [geometry]

  const vertexFaces = new Map()
  for (let face = 0; face < faceCount; face += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[face * 3 + corner]
      if (!vertexFaces.has(vertex)) vertexFaces.set(vertex, [])
      vertexFaces.get(vertex).push(face)
    }
  }

  const visited = new Uint8Array(faceCount)
  const components = []
  for (let startFace = 0; startFace < faceCount; startFace += 1) {
    if (visited[startFace]) continue
    const stack = [startFace]
    const faces = []
    visited[startFace] = 1

    while (stack.length > 0) {
      const face = stack.pop()
      faces.push(face)
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = indices[face * 3 + corner]
        const neighbors = vertexFaces.get(vertex) || []
        neighbors.forEach((neighborFace) => {
          if (visited[neighborFace]) return
          visited[neighborFace] = 1
          stack.push(neighborFace)
        })
      }
    }

    components.push(faces)
  }

  if (components.length <= 1) return [geometry]

  return components.map((faces) => {
    const vertexMap = new Map()
    const positions = []
    const componentIndices = []

    faces.forEach((face) => {
      for (let corner = 0; corner < 3; corner += 1) {
        const sourceVertex = indices[face * 3 + corner]
        let targetVertex = vertexMap.get(sourceVertex)
        if (targetVertex === undefined) {
          targetVertex = positions.length / 3
          vertexMap.set(sourceVertex, targetVertex)
          positions.push(
            position.getX(sourceVertex),
            position.getY(sourceVertex),
            position.getZ(sourceVertex),
          )
        }
        componentIndices.push(targetVertex)
      }
    })

    const component = new THREE.BufferGeometry()
    component.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    component.setIndex(componentIndices)
    component.computeBoundingBox()
    component.computeVertexNormals()
    return component
  })
}

function computeCentroid(geometry) {
  const pos = geometry.attributes.position
  const centroid = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    centroid.x += pos.getX(i)
    centroid.y += pos.getY(i)
    centroid.z += pos.getZ(i)
  }
  centroid.divideScalar(pos.count)
  return centroid
}

function toPositive(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return num
}

function resolveConnectorType(type) {
  const normalized = String(type || 'none').toLowerCase().trim()
  if (normalized === 'none') return 'none'
  if (normalized.includes('mortise')) return 'mortise-and-tenon'
  if (normalized === 'key') return 'key'
  if (normalized.includes('dowel')) return 'dowel'
  return 'dowel'
}

function clampConnectorSpacing(value, min = 0.1) {
  return value < min ? min : value
}

// Peg (male) and socket (female) dimensions for a connector. The socket is the
// peg grown by the clearance on every cross-section axis, so the male ALWAYS
// fits the female — get this wrong and nothing assembles. Kept as a pure,
// exported function so the socket > peg invariant can be unit-tested.
export function connectorDimensions(type, { size, thickness, depth, clearance } = {}) {
  const gap = Math.max(0, Number(clearance) || 0)
  const height = depth * 2

  if (type === 'dowel') {
    const radius = clampConnectorSpacing(size / 2, 0.1)
    return {
      shape: 'cylinder',
      peg: { radius, height },
      socket: { radius: clampConnectorSpacing(radius + gap, 0.1), height },
    }
  }

  const width = clampConnectorSpacing(size, 1.5)
  const cross = clampConnectorSpacing(thickness, type === 'key' ? 1.0 : 1.5)
  return {
    shape: 'cube',
    peg: { x: width, y: cross, z: height },
    socket: { x: width + gap * 2, y: cross + gap * 2, z: height + gap * 2 },
  }
}

function createConnectorShape(manifold, type, options) {
  const dims = connectorDimensions(type, options)
  if (dims.shape === 'cylinder') {
    return {
      makePeg: () => manifold.Manifold.cylinder(dims.peg.height, dims.peg.radius, dims.peg.radius, 24, true),
      makeSocket: () => manifold.Manifold.cylinder(dims.socket.height, dims.socket.radius, dims.socket.radius, 24, true),
    }
  }
  return {
    makePeg: () => manifold.Manifold.cube([dims.peg.x, dims.peg.y, dims.peg.z], true),
    makeSocket: () => manifold.Manifold.cube([dims.socket.x, dims.socket.y, dims.socket.z], true),
  }
}

// A connector shorter than this isn't worth placing (and signals the wall is
// too thin to take one safely), so the face is skipped instead of forced.
const MIN_CONNECTOR_DEPTH = 0.8

// Largest connector count that physically fits across a shared face span. A
// requested "connectors per face" is REDUCED (never forced) when the face is
// too small, so connectors can't overlap/merge on a tiny mating surface.
export function fittedConnectorCount(requestedPerFace, faceSpan, connectorCross, clearance) {
  const requested = Math.max(1, Math.floor(Number(requestedPerFace) || 1))
  const cross = Math.max(0.1, Number(connectorCross) || 0.1)
  const pitch = cross + Math.max(0, Number(clearance) || 0) * 2 + cross * 0.6
  const usable = Math.max(0, Number(faceSpan) || 0)
  const maxFit = Math.max(1, Math.floor(usable / pitch))
  return Math.min(requested, maxFit)
}

// Clamp insertion depth to a fraction of the local wall thickness so the peg
// (and its socket) can't punch through the opposite surface — that both wrecks
// the visible surface and leaves an unprintably thin wall.
export function clampConnectorDepth(requestedDepth, localThickness, factor = 0.4) {
  const requested = Math.max(0, Number(requestedDepth) || 0)
  if (!Number.isFinite(localThickness)) return requested
  return Math.min(requested, Math.max(0, localThickness) * factor)
}

// Distance from the shared cut plane to the far wall of a part at a point, by
// raycasting into the body. Used to size connectors to the LOCAL thickness
// rather than the (often far larger, for thin/curved parts) bounding box.
function localWallThickness(raycaster, mesh, bbox, point, axis, plane, nudge) {
  const inwardSign = bbox.min.getComponent(axis) + bbox.max.getComponent(axis) < plane * 2 ? -1 : 1
  const direction = new THREE.Vector3()
  direction.setComponent(axis, inwardSign)
  const origin = point.clone()
  origin.setComponent(axis, plane)
  origin.addScaledVector(direction, nudge)
  raycaster.set(origin, direction)
  const hits = raycaster.intersectObject(mesh, false)
  return hits.length ? hits[0].distance : Infinity
}

export async function addConnectorsManifold(chunks, config = {}) {
  const type = resolveConnectorType(config.type)
  if (type === 'none') return chunks
  if (chunks.length < 2) return chunks

  const manifold = await getManifoldModule()
  const depth = Number(config.depth ?? 5)
  const perFace = Math.max(1, Number(config.perFace || 1))
  if (!Number.isFinite(depth) || depth <= 0) {
    throw new Error('Connector depth must be greater than zero')
  }

  const clearance = Number(config.clearance ?? 0.3)
  const size = toPositive(config.diameter, 6)
  const size2 = toPositive(config.tenonWidth ?? config.keyWidth ?? config.width, size)
  const thickness = toPositive(config.tenonThickness ?? config.keyHeight ?? config.thickness, type === 'key' ? Math.max(1.5, size * 0.55) : Math.max(1.5, size * 0.45))

  if (!Number.isFinite(clearance) || clearance < 0) {
    throw new Error('Connector clearance cannot be negative')
  }

  const bboxes = chunks.map((chunk) => {
    chunk.geometry.computeBoundingBox()
    return chunk.geometry.boundingBox.clone()
  })
  const solids = chunks.map((chunk) => manifold.Manifold.ofMesh(geometryToManifoldMesh(chunk.geometry, manifold)))
  const connectorCounts = chunks.map((chunk) => Number(chunk.connectorCount || 0))
  // Raycast meshes (double-sided so back walls register) for local-thickness
  // probing, so connectors are clamped to the part's real wall, not its bbox.
  const raycaster = new THREE.Raycaster()
  const raycastMeshes = chunks.map((chunk) => {
    const mesh = new THREE.Mesh(chunk.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    mesh.updateMatrixWorld()
    return mesh
  })

  const worldSpan = new THREE.Vector3()
  bboxes.forEach((box) => {
    worldSpan.set(
      Math.max(worldSpan.x, box.max.x - box.min.x),
      Math.max(worldSpan.y, box.max.y - box.min.y),
      Math.max(worldSpan.z, box.max.z - box.min.z),
    )
  })
  const bboxTouchTolerance = Math.max(1e-4, (worldSpan.x + worldSpan.y + worldSpan.z) * 1e-6)

  try {
    for (let i = 0; i < chunks.length; i++) {
      for (let j = i + 1; j < chunks.length; j++) {
        const bbA = bboxes[i]
        const bbB = bboxes[j]
        if (!bbA.intersectsBox(bbB)) continue

        const interMin = new THREE.Vector3(
          Math.max(bbA.min.x, bbB.min.x),
          Math.max(bbA.min.y, bbB.min.y),
          Math.max(bbA.min.z, bbB.min.z),
        )
        const interMax = new THREE.Vector3(
          Math.min(bbA.max.x, bbB.max.x),
          Math.min(bbA.max.y, bbB.max.y),
          Math.min(bbA.max.z, bbB.max.z),
        )
        const interBox = new THREE.Box3(interMin, interMax)
        const interSize = new THREE.Vector3()
        interBox.getSize(interSize)
        if (interSize.x <= -bboxTouchTolerance || interSize.y <= -bboxTouchTolerance || interSize.z <= -bboxTouchTolerance) continue

        const touchingAxes = [0, 1, 2]
          .map((axis) => ({
            axis,
            overlap: interSize.getComponent(axis),
          }))
          .filter((entry) => entry.overlap >= -bboxTouchTolerance && entry.overlap <= bboxTouchTolerance)
        if (touchingAxes.length !== 1) {
          continue
        }

        const axis = touchingAxes[0].axis
        const center = new THREE.Vector3()
        interBox.getCenter(center)
        const otherAxes = [(axis + 1) % 3, (axis + 2) % 3]
        const extentA = interSize.getComponent(otherAxes[0])
        const extentB = interSize.getComponent(otherAxes[1])
        if (extentA <= bboxTouchTolerance || extentB <= bboxTouchTolerance) {
          continue
        }

        const faceTolerance = Math.max(bboxTouchTolerance * 20, 1e-3)
        const connectorFit = fitConnectorToSharedFace(type, {
          size,
          size2,
          thickness,
          depth,
          clearance,
          extentA,
          extentB,
          axisDepthA: Math.max(faceTolerance, bbA.max.getComponent(axis) - bbA.min.getComponent(axis)),
          axisDepthB: Math.max(faceTolerance, bbB.max.getComponent(axis) - bbB.min.getComponent(axis)),
          faceTolerance,
        })
        if (!connectorFit) continue

        const candidates = findSharedCutFaceCandidates(
          chunks[i].geometry,
          chunks[j].geometry,
          axis,
          center.getComponent(axis),
          interBox,
          otherAxes,
          Math.max(connectorFit.radius * 1.75, faceTolerance * 4),
          faceTolerance,
          connectorFit.radius + clearance + faceTolerance,
        )

        if (candidates.length === 0) {
          continue
        }

        // Reduce the per-face count to what physically fits this mating face.
        const connectorCross = type === 'dowel'
          ? connectorFit.radius * 2
          : Math.max(connectorFit.size2, connectorFit.thickness)
        const edgeMargin = connectorFit.radius + clearance + faceTolerance
        const effectivePerFace = fittedConnectorCount(perFace, extentA - edgeMargin * 2, connectorCross, clearance)
        const positions = distributeConnectorCandidates(candidates, effectivePerFace, otherAxes)

        // Clamp depth to the thinnest local wall across the chosen positions so
        // neither the peg nor its socket punches through the opposite surface.
        const planeValue = center.getComponent(axis)
        let minWall = Infinity
        for (const pos of positions) {
          minWall = Math.min(
            minWall,
            localWallThickness(raycaster, raycastMeshes[i], bbA, pos, axis, planeValue, faceTolerance),
            localWallThickness(raycaster, raycastMeshes[j], bbB, pos, axis, planeValue, faceTolerance),
          )
        }
        const safeDepth = clampConnectorDepth(connectorFit.depth, minWall)
        if (safeDepth < MIN_CONNECTOR_DEPTH) continue

        const shape = createConnectorShape(manifold, type, {
          size: type === 'dowel' ? connectorFit.size : connectorFit.size2,
          thickness: connectorFit.thickness,
          depth: safeDepth,
          clearance,
        })
        for (const pos of positions) {
          const peg = orientConnector(shape.makePeg(), axis).translate([pos.x, pos.y, pos.z])
          const socket = orientConnector(shape.makeSocket(), axis).translate([pos.x, pos.y, pos.z])

          const male = solids[i].add(peg)
          const female = solids[j].subtract(socket)
          solids[i].delete?.()
          solids[j].delete?.()
          peg.delete?.()
          socket.delete?.()
          solids[i] = male
          solids[j] = female
          connectorCounts[i] += 1
          connectorCounts[j] += 1
        }
      }
    }

    return chunks.map((chunk, index) => {
      const status = solids[index].status()
      if (status !== 'NoError') throw new Error(`Connector operation failed manifold validation (${status})`)
      const geometry = manifoldMeshToGeometry(solids[index].getMesh())
      return {
        ...chunk,
        geometry,
        volume: Math.abs(solids[index].volume()),
        centroid: computeCentroid(geometry),
        connectorCount: connectorCounts[index],
        manifoldStatus: status,
      }
    })
  } finally {
    solids.forEach((solid) => solid.delete?.())
    raycastMeshes.forEach((mesh) => mesh.material.dispose())
  }
}

function fitConnectorToSharedFace(type, {
  size,
  size2,
  thickness,
  depth,
  clearance,
  extentA,
  extentB,
  axisDepthA,
  axisDepthB,
  faceTolerance,
}) {
  const smallestFaceExtent = Math.min(extentA, extentB)
  const maxCrossSection = Math.max(0, (smallestFaceExtent - 2 * (clearance + faceTolerance)) * 0.8)
  if (maxCrossSection <= 0.25) return null

  const fittedDepth = Math.min(depth, Math.max(0.5, Math.min(axisDepthA, axisDepthB) * 0.45))
  if (!Number.isFinite(fittedDepth) || fittedDepth <= 0) return null

  if (type === 'dowel') {
    const fittedDiameter = Math.max(0.25, Math.min(size, maxCrossSection))
    return {
      size: fittedDiameter,
      size2: fittedDiameter,
      thickness: fittedDiameter,
      depth: fittedDepth,
      radius: fittedDiameter / 2,
    }
  }

  const requestedCross = Math.max(size2, thickness)
  const scale = requestedCross > maxCrossSection ? maxCrossSection / requestedCross : 1
  const fittedWidth = Math.max(0.25, size2 * scale)
  const fittedThickness = Math.max(0.25, thickness * scale)
  const fittedCross = Math.max(fittedWidth, fittedThickness)

  return {
    size: fittedWidth,
    size2: fittedWidth,
    thickness: fittedThickness,
    depth: fittedDepth,
    radius: fittedCross / 2,
  }
}

function findSharedCutFaceCandidates(geometryA, geometryB, axis, plane, interBox, otherAxes, matchDistance, tolerance, edgeMargin) {
  const trianglesA = collectCutFaceTriangles(geometryA, axis, plane, interBox, tolerance)
  const trianglesB = collectCutFaceTriangles(geometryB, axis, plane, interBox, tolerance)
  if (trianglesA.length === 0 || trianglesB.length === 0) return []

  const minU = interBox.min.getComponent(otherAxes[0]) + edgeMargin
  const maxU = interBox.max.getComponent(otherAxes[0]) - edgeMargin
  const minV = interBox.min.getComponent(otherAxes[1]) + edgeMargin
  const maxV = interBox.max.getComponent(otherAxes[1]) - edgeMargin
  if (minU > maxU || minV > maxV) return []

  const points = []
  const steps = 7
  for (let uIndex = 1; uIndex <= steps; uIndex += 1) {
    for (let vIndex = 1; vIndex <= steps; vIndex += 1) {
      const u = minU + ((maxU - minU) * uIndex) / (steps + 1)
      const v = minV + ((maxV - minV) * vIndex) / (steps + 1)
      if (!pointOnCutTriangles(u, v, trianglesA, tolerance)) continue
      if (!pointOnCutTriangles(u, v, trianglesB, tolerance)) continue

      const point = new THREE.Vector3()
      point.setComponent(axis, plane)
      point.setComponent(otherAxes[0], u)
      point.setComponent(otherAxes[1], v)
      points.push(point)
    }
  }

  if (points.length > 0) {
    return dedupePoints(points, tolerance).sort((a, b) => {
      const primary = a.getComponent(otherAxes[0]) - b.getComponent(otherAxes[0])
      if (Math.abs(primary) > tolerance) return primary
      return a.getComponent(otherAxes[1]) - b.getComponent(otherAxes[1])
    })
  }

  const legacyPointsA = collectCutFaceVertices(geometryA, axis, plane, interBox, tolerance)
  const legacyPointsB = collectCutFaceVertices(geometryB, axis, plane, interBox, tolerance)
  const maxDistanceSq = matchDistance * matchDistance
  return legacyPointsA
    .filter((point) => {
      const u = point.getComponent(otherAxes[0])
      const v = point.getComponent(otherAxes[1])
      if (u < minU || u > maxU || v < minV || v > maxV) return false
      return legacyPointsB.some((other) => distanceOnAxesSq(point, other, otherAxes) <= maxDistanceSq)
    })
    .sort((a, b) => {
      const primary = a.getComponent(otherAxes[0]) - b.getComponent(otherAxes[0])
      if (Math.abs(primary) > tolerance) return primary
      return a.getComponent(otherAxes[1]) - b.getComponent(otherAxes[1])
    })
}

function collectCutFaceTriangles(geometry, axis, plane, interBox, tolerance) {
  const position = geometry.attributes.position
  if (!position) return []

  const index = geometry.index
  const triangles = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const max = index ? index.count : position.count

  for (let i = 0; i + 2 < max; i += 3) {
    const ai = index ? index.getX(i) : i
    const bi = index ? index.getX(i + 1) : i + 1
    const ci = index ? index.getX(i + 2) : i + 2
    a.set(position.getX(ai), position.getY(ai), position.getZ(ai))
    b.set(position.getX(bi), position.getY(bi), position.getZ(bi))
    c.set(position.getX(ci), position.getY(ci), position.getZ(ci))

    if (
      Math.abs(a.getComponent(axis) - plane) > tolerance ||
      Math.abs(b.getComponent(axis) - plane) > tolerance ||
      Math.abs(c.getComponent(axis) - plane) > tolerance
    ) {
      continue
    }

    if (!containsPointWithTolerance(interBox, a, tolerance) || !containsPointWithTolerance(interBox, b, tolerance) || !containsPointWithTolerance(interBox, c, tolerance)) {
      continue
    }

    const otherAxes = [(axis + 1) % 3, (axis + 2) % 3]
    triangles.push({
      a: [a.getComponent(otherAxes[0]), a.getComponent(otherAxes[1])],
      b: [b.getComponent(otherAxes[0]), b.getComponent(otherAxes[1])],
      c: [c.getComponent(otherAxes[0]), c.getComponent(otherAxes[1])],
    })
  }

  return triangles
}

function containsPointWithTolerance(box, point, tolerance) {
  return (
    point.x >= box.min.x - tolerance &&
    point.x <= box.max.x + tolerance &&
    point.y >= box.min.y - tolerance &&
    point.y <= box.max.y + tolerance &&
    point.z >= box.min.z - tolerance &&
    point.z <= box.max.z + tolerance
  )
}

function pointOnCutTriangles(u, v, triangles, tolerance) {
  return triangles.some((triangle) => pointInTriangle2D(u, v, triangle, tolerance))
}

function pointInTriangle2D(u, v, triangle, tolerance) {
  const v0x = triangle.c[0] - triangle.a[0]
  const v0y = triangle.c[1] - triangle.a[1]
  const v1x = triangle.b[0] - triangle.a[0]
  const v1y = triangle.b[1] - triangle.a[1]
  const v2x = u - triangle.a[0]
  const v2y = v - triangle.a[1]

  const dot00 = v0x * v0x + v0y * v0y
  const dot01 = v0x * v1x + v0y * v1y
  const dot02 = v0x * v2x + v0y * v2y
  const dot11 = v1x * v1x + v1y * v1y
  const dot12 = v1x * v2x + v1y * v2y
  const denom = dot00 * dot11 - dot01 * dot01
  if (Math.abs(denom) <= tolerance * tolerance) return false

  const invDenom = 1 / denom
  const alpha = (dot11 * dot02 - dot01 * dot12) * invDenom
  const beta = (dot00 * dot12 - dot01 * dot02) * invDenom
  return alpha >= -tolerance && beta >= -tolerance && alpha + beta <= 1 + tolerance
}

function collectCutFaceVertices(geometry, axis, plane, interBox, tolerance) {
  const position = geometry.attributes.position
  if (!position) return []

  const points = []
  const vertex = new THREE.Vector3()

  for (let i = 0; i < position.count; i += 1) {
    vertex.set(position.getX(i), position.getY(i), position.getZ(i))
    if (Math.abs(vertex.getComponent(axis) - plane) > tolerance) continue
    if (!interBox.containsPoint(vertex)) continue
    points.push(vertex.clone())
  }

  return dedupePoints(points, tolerance)
}

function dedupePoints(points, tolerance) {
  const scale = 1 / Math.max(tolerance, 1e-6)
  const seen = new Set()
  const unique = []
  points.forEach((point) => {
    const key = `${Math.round(point.x * scale)}:${Math.round(point.y * scale)}:${Math.round(point.z * scale)}`
    if (seen.has(key)) return
    seen.add(key)
    unique.push(point)
  })
  return unique
}

function distanceOnAxesSq(a, b, axes) {
  const da = a.getComponent(axes[0]) - b.getComponent(axes[0])
  const db = a.getComponent(axes[1]) - b.getComponent(axes[1])
  return da * da + db * db
}

function distributeConnectorCandidates(candidates, count, otherAxes) {
  if (candidates.length <= count) return candidates

  const selected = []
  const sorted = [...candidates].sort((a, b) => {
    const primary = a.getComponent(otherAxes[0]) - b.getComponent(otherAxes[0])
    if (Math.abs(primary) > 1e-6) return primary
    return a.getComponent(otherAxes[1]) - b.getComponent(otherAxes[1])
  })

  for (let i = 0; i < count; i += 1) {
    const index = Math.round(((i + 1) / (count + 1)) * (sorted.length - 1))
    selected.push(sorted[index])
  }
  return selected
}

function orientConnector(connector, axis) {
  if (axis === 0) return connector.rotate([0, 90, 0])
  if (axis === 1) return connector.rotate([90, 0, 0])
  return connector
}

export function validateExportChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('No split parts are available for export')
  }

  chunks.forEach((chunk, i) => {
    const label = chunk.label || `part ${i + 1}`
    const info = validateManifold(chunk.geometry)
    const volume = Math.abs(chunk.volume || info.volume || computeVolume(chunk.geometry))
    if (!info.watertight || info.faceCount <= 0 || info.vertCount <= 0 || volume <= 0) {
      throw new Error(`Part ${label} is not manifold and cannot be exported`)
    }
  })

  return true
}

// Re-derive a guaranteed-manifold geometry by round-tripping through the
// authoritative manifold-3d engine (the same one that produces the parts).
// Returns null when the engine cannot make a closed solid from the input.
function manifoldCleanGeometry(geometry, manifold) {
  let solid
  try {
    solid = manifold.Manifold.ofMesh(geometryToManifoldMesh(geometry, manifold))
    if (solid.status() !== 'NoError' || solid.isEmpty()) return null
    const cleaned = manifoldMeshToGeometry(solid.getMesh())
    cleaned.computeBoundingBox()
    return cleaned
  } catch {
    return null
  } finally {
    solid?.delete?.()
  }
}

// Resolve which parts can actually be exported. Parts come out of manifold-3d
// (manifold by construction), but the cheap watertight heuristic re-checks at
// coarse precision and can false-flag good parts. For any part the heuristic
// dislikes we defer to the authoritative engine and attempt an automatic
// repair; genuinely unrepairable parts are isolated (left out with a notice)
// rather than failing the whole export. Only an empty survivor set throws, so a
// single bad part can never block the customer from downloading the rest.
export async function prepareExportChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('No split parts are available for export')
  }

  let manifold = null
  const exportable = []
  const failed = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const label = chunk.label || `part ${i + 1}`
    const info = validateManifold(chunk.geometry)
    const volume = Math.abs(chunk.volume || info.volume || computeVolume(chunk.geometry))

    if (info.watertight && info.faceCount > 0 && info.vertCount > 0 && volume > 0) {
      exportable.push(chunk)
      continue
    }

    if (!manifold) manifold = await getManifoldModule()
    let cleaned = manifoldCleanGeometry(chunk.geometry, manifold)
    if (!cleaned) {
      cleaned = manifoldCleanGeometry(repairMeshGeometry(chunk.geometry), manifold)
    }

    if (cleaned) {
      exportable.push({ ...chunk, geometry: cleaned, wasRepaired: true })
    } else {
      failed.push({ label, index: chunk.index })
    }
  }

  if (exportable.length === 0) {
    const error = new Error(
      'None of the split parts are manifold, even after automatic repair, so the export cannot be produced. Repair the larger holes in your CAD or slicer and try again.',
    )
    error.code = 'NO_EXPORTABLE_PARTS'
    error.failedParts = failed
    throw error
  }

  return { exportable, failed }
}

async function resolvePreparedChunks(chunks, options) {
  if (options.preparedExportable) {
    return { exportable: options.preparedExportable, failed: options.preparedFailed || [] }
  }
  return prepareExportChunks(chunks)
}

function describeUnexportableParts(failed) {
  return [
    'Some parts could not be made watertight automatically and were left out of this package.',
    'Repair them in your CAD or slicer before printing:',
    '',
    ...failed.map((part) => `  - ${part.label}`),
    '',
    'Every other part in this package is watertight and ready to print.',
    '',
  ].join('\n')
}

async function createStlZip(chunks, options = {}) {
  const { STLExporter } = await import('three/addons/exporters/STLExporter.js')
  const exporter = new STLExporter()
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const exportReceipt = createExportReceipt(options.exportAuthorization, options)

  chunks.forEach(chunk => {
    const mesh = new THREE.Mesh(chunk.geometry)
    const stlData = exporter.parse(mesh, { binary: true })
    const stlBuffer = stlData instanceof ArrayBuffer
      ? stlData
      : stlData.buffer.slice(stlData.byteOffset, stlData.byteOffset + stlData.byteLength)
    stampStlHeader(stlBuffer, exportReceipt)
    zip.file(`part_${String(chunk.index).padStart(2, '0')}_${chunk.label}.stl`, stlBuffer)
  })

  const failedParts = options.failedParts || []
  if (failedParts.length) {
    zip.file('UNEXPORTABLE-PARTS.txt', describeUnexportableParts(failedParts))
  }

  if (exportReceipt) {
    zip.file('mesh-splitter-license.json', JSON.stringify(exportReceipt, null, 2))
  }
  return zip
}

export async function exportStl(chunks, options = {}) {
  const { exportable, failed } = await resolvePreparedChunks(chunks, options)
  const zip = await createStlZip(exportable, { ...options, failedParts: failed })
  return zip.generateAsync({ type: 'blob' })
}

export async function exportPackage(chunks, buildVolume, options = {}) {
  const exportAuthorization = normalizeExportAuthorization(options.exportAuthorization)
  if (requiresExportAuthorization(options) && !exportAuthorization) {
    throw new Error('Export authorization is required')
  }

  const { exportable, failed } = await resolvePreparedChunks(chunks, options)
  const zip = await createStlZip(exportable, { ...options, exportAuthorization, failedParts: failed })
  const pdfData = await exportPdf(exportable, buildVolume, { ...options, exportAuthorization })
  zip.file('mesh-splitter-assembly.pdf', pdfData)
  return zip.generateAsync({ type: 'blob' })
}

function requiresExportAuthorization(options = {}) {
  if (typeof options.requireExportAuthorization === 'boolean') return options.requireExportAuthorization
  return import.meta.env?.VITE_CREDITS_ENFORCEMENT === 'required'
}

function normalizeExportAuthorization(authorization) {
  if (!authorization?.token || !authorization?.fingerprint || !authorization?.exportId) return null
  return {
    token: String(authorization.token),
    fingerprint: String(authorization.fingerprint),
    exportId: String(authorization.exportId),
    issuedAt: authorization.issuedAt ? String(authorization.issuedAt) : undefined,
    expiresAt: authorization.expiresAt ? String(authorization.expiresAt) : undefined,
  }
}

function createExportReceipt(authorization, options = {}) {
  const normalized = normalizeExportAuthorization(authorization)
  if (!normalized) return null
  return {
    product: 'MALIEV Mesh Splitter',
    appUrl: options.appUrl || DEFAULT_APP_URL,
    exportId: normalized.exportId,
    receipt: normalized.fingerprint,
    issuedAt: normalized.issuedAt,
    expiresAt: normalized.expiresAt,
    sourceFilename: options.sourceFilename || 'Uploaded mesh',
  }
}

function stampStlHeader(stlBuffer, exportReceipt) {
  if (!exportReceipt || !(stlBuffer instanceof ArrayBuffer) || stlBuffer.byteLength < 80) return
  const header = new Uint8Array(stlBuffer, 0, 80)
  header.fill(0)
  const text = new TextEncoder().encode(`MALIEV Mesh Splitter receipt ${exportReceipt.receipt}`)
  header.set(text.slice(0, 80))
}

const PDF_PAGE = {
  width: 210,
  height: 297,
  margin: 24,
}

const BRAND = {
  black: [15, 23, 42],
  ink: [31, 41, 55],
  muted: [107, 114, 128],
  border: [209, 213, 219],
  panel: [248, 250, 252],
  accent: [14, 165, 233],
  navy: [31, 42, 73],
  lightBlue: [239, 246, 255],
}

const DEFAULT_APP_URL = 'https://shop.maliev.com/tools/mesh-splitter'
const SNAPSHOT_IMAGE_ASPECT = 4 / 3
const PDF_LOGO = {
  x: PDF_PAGE.margin,
  y: 9,
  width: 25,
  height: 5.7,
}
const MALIEV_WORDMARK_BOUNDS = {
  x: -1604.676,
  y: -390,
  width: 1698.258,
  height: 390,
  invertY: true,
}

function setRgb(pdf, method, color) {
  pdf[method](color[0], color[1], color[2])
}

function setFont(pdf, size, style = 'normal', color = BRAND.ink) {
  pdf.setFont('helvetica', style)
  pdf.setFontSize(size)
  setRgb(pdf, 'setTextColor', color)
}

async function addHeader(pdf, title, subtitle, appUrl, qrImage) {
  setRgb(pdf, 'setFillColor', BRAND.black)
  pdf.rect(0, 0, PDF_PAGE.width, 27, 'F')
  setRgb(pdf, 'setFillColor', BRAND.navy)
  pdf.rect(70, 0, PDF_PAGE.width - 70, 27, 'F')

  drawLogo(pdf)
  setFont(pdf, 5.8, 'normal', [229, 231, 235])
  pdf.text(appUrl, PDF_PAGE.width - PDF_PAGE.margin, 14, { align: 'right' })
}

function addPageTitle(pdf, title, subtitle, qrImage) {
  if (qrImage) {
    // Compact, caption-less QR that ends above the page content (y≈55) so the
    // part image frames at y58 never overdraw it. The captioned QR lives on the
    // cover hero instead.
    addQrPanel(pdf, qrImage, PDF_PAGE.width - PDF_PAGE.margin - 24, 31, 24, 24, { caption: false })
  }

  setFont(pdf, 20, 'bold', BRAND.black)
  pdf.text(title, PDF_PAGE.margin, 44)
  if (subtitle) {
    setFont(pdf, 9, 'normal', BRAND.muted)
    pdf.text(subtitle, PDF_PAGE.margin, 52, { maxWidth: qrImage ? 128 : 162 })
  }
}

function drawLogo(pdf) {
  if (typeof pdf.path !== 'function' || typeof pdf.fill !== 'function') {
    drawLogoFallback(pdf)
    return
  }

  try {
    const commands = createPdfPathFromSvgPath(getMalievLogoPathData(), MALIEV_WORDMARK_BOUNDS, PDF_LOGO)
    if (!commands.length) {
      drawLogoFallback(pdf)
      return
    }

    setRgb(pdf, 'setFillColor', [242, 242, 242])
    pdf.path(commands)
    pdf.fill()
  } catch {
    drawLogoFallback(pdf)
  }
}

function drawLogoFallback(pdf) {
  setFont(pdf, 11, 'bold', [255, 255, 255])
  pdf.text('MALIEV', PDF_PAGE.margin, 14)
}

function getMalievLogoPathData() {
  const match = malievLogoWhiteSvg.match(/<path\b[\s\S]*?\sd=["']([^"']+)["']/i)
  if (!match?.[1]) throw new Error('MALIEV logo SVG path not found')
  return match[1]
}

function createPdfPathFromSvgPath(pathData, bounds, box) {
  const tokens = pathData.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []
  const commands = []
  let cursor = 0
  let command = null
  let current = { x: 0, y: 0 }
  let subpathStart = { x: 0, y: 0 }

  const isCommand = (value) => /^[A-Za-z]$/.test(value)
  const hasNumber = () => cursor < tokens.length && !isCommand(tokens[cursor])
  const readNumber = () => {
    if (!hasNumber()) throw new Error('Malformed logo path')
    return Number(tokens[cursor++])
  }
  const point = (x, y, relative) => ({
    x: relative ? current.x + x : x,
    y: relative ? current.y + y : y,
  })
  const append = (op, sourcePoint) => {
    commands.push({ op, c: mapLogoPoint(sourcePoint, bounds, box) })
    current = sourcePoint
  }

  while (cursor < tokens.length) {
    if (isCommand(tokens[cursor])) {
      command = tokens[cursor++]
    }
    if (!command) throw new Error('Malformed logo path')

    const relative = command === command.toLowerCase()
    switch (command.toUpperCase()) {
      case 'M': {
        let firstPoint = true
        while (hasNumber()) {
          const next = point(readNumber(), readNumber(), relative)
          append(firstPoint ? 'm' : 'l', next)
          if (firstPoint) {
            subpathStart = next
            firstPoint = false
          }
        }
        command = relative ? 'l' : 'L'
        break
      }
      case 'L':
        while (hasNumber()) {
          append('l', point(readNumber(), readNumber(), relative))
        }
        break
      case 'H':
        while (hasNumber()) {
          const x = readNumber()
          append('l', { x: relative ? current.x + x : x, y: current.y })
        }
        break
      case 'V':
        while (hasNumber()) {
          const y = readNumber()
          append('l', { x: current.x, y: relative ? current.y + y : y })
        }
        break
      case 'C':
        while (hasNumber()) {
          const controlA = point(readNumber(), readNumber(), relative)
          const controlB = point(readNumber(), readNumber(), relative)
          const end = point(readNumber(), readNumber(), relative)
          commands.push({
            op: 'c',
            c: [
              ...mapLogoPoint(controlA, bounds, box),
              ...mapLogoPoint(controlB, bounds, box),
              ...mapLogoPoint(end, bounds, box),
            ],
          })
          current = end
        }
        break
      case 'Z':
        commands.push({ op: 'h', c: [] })
        current = subpathStart
        command = null
        break
      default:
        throw new Error(`Unsupported logo path command: ${command}`)
    }
  }

  return commands
}

function mapLogoPoint(sourcePoint, bounds, box) {
  const x = box.x + ((sourcePoint.x - bounds.x) / bounds.width) * box.width
  const normalizedY = bounds.invertY
    ? (bounds.y + bounds.height - sourcePoint.y) / bounds.height
    : (sourcePoint.y - bounds.y) / bounds.height
  const y = box.y + normalizedY * box.height
  return [roundPdfCoordinate(x), roundPdfCoordinate(y)]
}

function roundPdfCoordinate(value) {
  return Number(value.toFixed(3))
}

function addFooter(pdf, appUrl, pageNumber, exportAuthorization) {
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.line(PDF_PAGE.margin, 280, PDF_PAGE.width - PDF_PAGE.margin, 280)
  setFont(pdf, 8, 'normal', BRAND.muted)
  const receipt = exportAuthorization?.fingerprint ? ` | Receipt ${exportAuthorization.fingerprint}` : ''
  pdf.text(`Generated by MALIEV Mesh Splitter | ${appUrl}${receipt}`, PDF_PAGE.margin, 286, {
    maxWidth: PDF_PAGE.width - PDF_PAGE.margin * 2 - 20,
  })
  pdf.text(`Page ${pageNumber}`, PDF_PAGE.width - PDF_PAGE.margin, 286, { align: 'right' })
}

async function addPage(pdf, title, subtitle, appUrl, qrImage, pageNumber, options = {}) {
  if (pageNumber > 1) pdf.addPage()
  await addHeader(pdf, title, subtitle, appUrl, qrImage)
  if (options.titleBlock !== false) {
    addPageTitle(pdf, title, subtitle, qrImage)
  }
  addFooter(pdf, appUrl, pageNumber, options.exportAuthorization)
}

function addImageFrame(pdf, image, x, y, width, height, caption, options = {}) {
  const { title, badge } = options
  setRgb(pdf, 'setFillColor', BRAND.panel)
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, height, 4, 4, 'FD')
  const contentTop = title ? y + 17 : y + 6
  const contentHeight = title ? height - 25 : height - 14
  if (title) {
    setFont(pdf, 9, 'bold', BRAND.black)
    pdf.text(title, x + 5, y + 11)
  }
  if (badge) {
    drawPill(pdf, badge, x + width - 24, y + 6, 18, 6)
  }
  if (image) {
    setRgb(pdf, 'setFillColor', [255, 255, 255])
    pdf.roundedRect(x + 5, contentTop, width - 10, contentHeight, 3, 3, 'F')
    const contentBox = containImageBox(x + 5, contentTop, width - 10, contentHeight, SNAPSHOT_IMAGE_ASPECT)
    pdf.addImage(image, 'JPEG', contentBox.x, contentBox.y, contentBox.width, contentBox.height)
  } else {
    setFont(pdf, 9, 'normal', BRAND.muted)
    pdf.text('Preview image unavailable for this export.', x + width / 2, y + height / 2, { align: 'center' })
  }
  if (caption) {
    setFont(pdf, 8, 'normal', BRAND.muted)
    pdf.text(caption, x + 5, y + height - 5)
  }
}

function containImageBox(x, y, width, height, imageAspect) {
  const boxAspect = width / height
  if (boxAspect > imageAspect) {
    const containedWidth = height * imageAspect
    return {
      x: x + (width - containedWidth) / 2,
      y,
      width: containedWidth,
      height,
    }
  }

  const containedHeight = width / imageAspect
  return {
    x,
    y: y + (height - containedHeight) / 2,
    width,
    height: containedHeight,
  }
}

function addMetric(pdf, label, value, x, y, width = 54, height = 18) {
  setRgb(pdf, 'setFillColor', [255, 255, 255])
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, height, 3, 3, 'FD')
  setFont(pdf, 7, 'normal', BRAND.muted)
  pdf.text(label, x + 3, y + 6)
  setFont(pdf, 10, 'bold', BRAND.black)
  pdf.text(String(value), x + 3, y + 14, { maxWidth: width - 6 })
}

function drawPill(pdf, text, x, y, width, height) {
  setRgb(pdf, 'setFillColor', [255, 255, 255])
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, height, height / 2, height / 2, 'FD')
  setFont(pdf, 4.5, 'bold', BRAND.muted)
  pdf.text(text, x + width / 2, y + 4, { align: 'center' })
}

function addQrPanel(pdf, qrImage, x, y, width, height, { caption = true } = {}) {
  setRgb(pdf, 'setFillColor', BRAND.panel)
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, height, 4, 4, 'FD')
  // Without a caption the QR fills the panel (square inset); with one it leaves
  // room below for the two-line "Scan to open" label.
  const inset = caption ? 3.5 : 3
  const qrSize = caption ? width - 7 : Math.min(width - inset * 2, height - inset * 2)
  if (qrImage) {
    pdf.addImage(qrImage, 'PNG', x + (width - qrSize) / 2, y + inset, qrSize, qrSize)
  }
  if (caption) {
    setFont(pdf, 5.2, 'bold', BRAND.muted)
    pdf.text(['Scan to open', 'Mesh Splitter'], x + width / 2, y + height - 8, { align: 'center' })
  }
}

function addCoverHero(pdf, qrImage, appUrl) {
  const x = PDF_PAGE.margin
  const y = 18
  const width = PDF_PAGE.width - PDF_PAGE.margin * 2
  const height = 50
  setRgb(pdf, 'setFillColor', BRAND.black)
  pdf.roundedRect(x + 0.8, y + 1.4, width, height, 7, 7, 'F')
  setRgb(pdf, 'setFillColor', [255, 255, 255])
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, height, 7, 7, 'FD')

  setFont(pdf, 6.2, 'bold', [71, 85, 105])
  pdf.text('PRINT-READY MESH PACKAGE', x + 8, y + 10)
  setFont(pdf, 21, 'bold', BRAND.black)
  pdf.text(['Mesh Splitter', 'Assembly Packet'], x + 8, y + 20)
  setFont(pdf, 7.2, 'normal', BRAND.muted)
  pdf.text([
    'Generated by MALIEV Mesh Splitter. Use this packet together with the',
    'bundled STL files for printing, checking, and assembling the split model.',
  ], x + 8, y + 36, { maxWidth: 105 })
  addQrPanel(pdf, qrImage, x + width - 33, y + 8, 24, 31)
}

// Page-1 packet copy. Each entry is hand-broken into lines sized to fit its
// column; the card widths below feed both the layout and PACKET_TEXT_LAYOUT so a
// real-jsPDF test can guarantee no line re-wraps. A re-wrapped line would spill
// a hidden extra line that overlaps the next row, icon, or card border.
const CHECKLIST_CARD_WIDTH = 50
const ASSEMBLY_FLOW_CARD_WIDTH = 50
const PACKAGE_CONTENTS_CARD_WIDTH = 83
const IMPORTANT_NOTE_CARD_WIDTH = 75

const PACKET_CHECKLIST_ITEMS = [
  ['Print all bundled STL files', 'at the intended scale.'],
  ['Keep labels visible until', 'assembly is complete.'],
  ['Check nozzle, layer height,', 'and support before printing.'],
  ['Dry-fit parts before using', 'glue or fasteners.'],
]

const PACKET_ASSEMBLY_STEPS = [
  ['Sort printed parts by label and', 'connector location.'],
  ['Dry-fit and confirm orientation', 'with the preview.'],
  ['Join from the largest mating', 'faces outward.'],
]

const PACKAGE_CONTENTS_BODY = [
  'This packet is the visual reference for the exported mesh package.',
  'Keep it with the split STL files so the operator can verify the model,',
  'part count, and print setup.',
]
const PACKAGE_CONTENTS_NOTE = [
  'For multi-part models, exported filenames and labels should',
  'match the assembly order shown in this packet.',
]
const IMPORTANT_NOTE_BODY = [
  'Confirm build volume, units, and orientation before production printing.',
  'Recheck scale after any model repair or re-split.',
]
const IMPORTANT_NOTE_NOTE = [
  'Scan the QR code to reopen Mesh Splitter',
  'for re-splitting or regeneration.',
]

// Wrap-sensitive blocks: each line must fit its column at the listed font size.
// The maxWidth mirrors the in-card text padding (checklist x+11/right-4 => -15;
// info note x+15/right-5 => -20; flow x+13/right-5 => -18).
export const PACKET_TEXT_LAYOUT = [
  { label: 'checklist', fontSize: 6.1, maxWidth: CHECKLIST_CARD_WIDTH - 15, lines: PACKET_CHECKLIST_ITEMS.flat() },
  { label: 'assemblyFlow', fontSize: 5.9, maxWidth: ASSEMBLY_FLOW_CARD_WIDTH - 18, lines: PACKET_ASSEMBLY_STEPS.flat() },
  { label: 'packageContentsNote', fontSize: 6.1, maxWidth: PACKAGE_CONTENTS_CARD_WIDTH - 20, lines: PACKAGE_CONTENTS_NOTE },
  { label: 'importantNote', fontSize: 6.1, maxWidth: IMPORTANT_NOTE_CARD_WIDTH - 20, lines: IMPORTANT_NOTE_NOTE },
]

function addChecklistCard(pdf, x, y, width, height) {
  setRgb(pdf, 'setFillColor', [255, 255, 255])
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, height, 4, 4, 'FD')
  setFont(pdf, 9, 'bold', BRAND.black)
  pdf.text('Print checklist', x + 5, y + 10)
  // Four two-line items spread across the card body. Start/step are tuned so the
  // final item's second line clears the bottom border instead of touching it.
  let rowY = y + 20
  const rowStep = 11
  PACKET_CHECKLIST_ITEMS.forEach((item) => {
    setRgb(pdf, 'setDrawColor', [148, 163, 184])
    pdf.roundedRect(x + 5, rowY - 2.5, 3.2, 3.2, 0.6, 0.6, 'S')
    setFont(pdf, 6.1, 'normal', BRAND.ink)
    pdf.text(item, x + 11, rowY, { maxWidth: width - 15 })
    rowY += rowStep
  })
}

function addAssemblyFlowCard(pdf, x, y, width, height) {
  setRgb(pdf, 'setFillColor', [255, 255, 255])
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, height, 4, 4, 'FD')
  setFont(pdf, 9, 'bold', BRAND.black)
  pdf.text('Assembly flow', x + 5, y + 10)
  const steps = PACKET_ASSEMBLY_STEPS
  let rowY = y + 21
  steps.forEach((step, index) => {
    const circleY = rowY - 1.4
    setRgb(pdf, 'setFillColor', BRAND.black)
    pdf.circle(x + 7.5, circleY, 3.5, 'F')
    setFont(pdf, 6.3, 'bold', [255, 255, 255])
    // Anchor the digit on the circle's exact center so it reads centered.
    pdf.text(String(index + 1), x + 7.5, circleY, { align: 'center', baseline: 'middle' })
    setFont(pdf, 5.9, 'normal', BRAND.ink)
    pdf.text(step, x + 13, rowY, { maxWidth: width - 18 })
    rowY += 9.6
  })
}

function addInfoCard(pdf, title, body, info, x, y, width, height) {
  setRgb(pdf, 'setFillColor', [255, 255, 255])
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, height, 4, 4, 'FD')
  setFont(pdf, 9, 'bold', BRAND.black)
  pdf.text(title, x + 5, y + 10)
  setFont(pdf, 6.7, 'normal', BRAND.ink)
  pdf.text(body, x + 5, y + 20, { maxWidth: width - 10 })
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.line(x + 5, y + height - 18, x + width - 5, y + height - 18)
  // Center the icon and the note block on a shared line so the text sits level
  // with the middle of the "i" badge rather than riding above it.
  const noteCenterY = y + height - 9
  drawInfoIcon(pdf, x + 8, noteCenterY)
  setFont(pdf, 6.1, 'normal', BRAND.ink)
  const noteLines = Array.isArray(info) ? info : [info]
  const noteLineHeight = 2.5
  const noteTop = noteCenterY - ((noteLines.length - 1) * noteLineHeight) / 2
  noteLines.forEach((line, i) => {
    pdf.text(line, x + 15, noteTop + i * noteLineHeight, { maxWidth: width - 20, baseline: 'middle' })
  })
}

function drawInfoIcon(pdf, centerX, centerY) {
  setRgb(pdf, 'setFillColor', BRAND.lightBlue)
  setRgb(pdf, 'setDrawColor', [147, 197, 253])
  pdf.circle(centerX, centerY, 3.4, 'FD')
  setFont(pdf, 8.5, 'bold', BRAND.accent)
  pdf.text('i', centerX, centerY + 1.3, { align: 'center' })
}

function partDimensions(chunk) {
  const box = new THREE.Box3().setFromObject(new THREE.Mesh(chunk.geometry))
  const size = new THREE.Vector3()
  box.getSize(size)
  return size
}

function orderedChunks(chunks) {
  return [...chunks].sort((a, b) => (a.assemblyOrder ?? a.index) - (b.assemblyOrder ?? b.index))
}

async function createQrCode(appUrl) {
  try {
    const QRCodeModule = await import('qrcode')
    const QRCode = QRCodeModule.default || QRCodeModule
    return QRCode.toDataURL(appUrl, {
      margin: 1,
      width: 180,
      color: {
        dark: '#111827',
        light: '#ffffff',
      },
    })
  } catch {
    return null
  }
}

function addPartsTable(pdf, chunks, startY = 168) {
  const headers = ['Order', 'Label', 'Volume', 'Size X/Y/Z mm']
  const widths = [20, 42, 28, 72]
  let x = PDF_PAGE.margin
  setFont(pdf, 8, 'bold', BRAND.black)
  headers.forEach((header, i) => {
    pdf.text(header, x, startY)
    x += widths[i]
  })
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.line(PDF_PAGE.margin, startY + 3, PDF_PAGE.width - PDF_PAGE.margin, startY + 3)

  let y = startY + 11
  let remaining = 0
  setFont(pdf, 8, 'normal', BRAND.ink)
  for (const chunk of orderedChunks(chunks)) {
    if (y > 273) {
      remaining += 1
      continue
    }
    const size = partDimensions(chunk)
    const volumeCm3 = Math.abs(chunk.volume || computeVolume(chunk.geometry)) / 1000
    x = PDF_PAGE.margin
    const row = [
      String(chunk.assemblyOrder ?? chunk.index + 1),
      chunk.label,
      `${volumeCm3.toFixed(2)} cm3`,
      `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`,
    ]
    row.forEach((cell, i) => {
      pdf.text(cell, x, y, { maxWidth: widths[i] - 4 })
      x += widths[i]
    })
    y += 8
  }
  if (remaining > 0) {
    setFont(pdf, 8, 'normal', BRAND.muted)
    pdf.text(`${remaining} additional parts continue on their individual part pages.`, PDF_PAGE.margin, 276)
  }
}

export async function exportPdf(chunks, buildVolume, options = {}) {
  const { jsPDF } = await import('jspdf')
  const {
    renderWholeMesh,
    renderAssembly,
    renderPartInContext,
    renderPartIsolated,
    renderAssemblyStep,
    disposeSnapshotRenderer,
  } = await import('./renderSnapshots')

  const pdf = new jsPDF()
  const appUrl = options.appUrl || DEFAULT_APP_URL
  const sourceFilename = options.sourceFilename || 'Uploaded mesh'
  const ordered = orderedChunks(chunks)
  const qrImage = await createQrCode(appUrl)
  const pdfContext = { exportAuthorization: options.exportAuthorization }
  let pageNumber = 1

  let completeImage = null
  let labeledAssemblyImage = null
  try {
    completeImage = options.sourceGeometry
      ? renderWholeMesh(options.sourceGeometry)
      : renderAssembly(chunks, { labels: false })
    labeledAssemblyImage = renderAssembly(chunks, { labels: true })
  } catch {
    completeImage = null
    labeledAssemblyImage = null
  }

  try {
    await addPage(
      pdf,
      'Mesh Splitter Assembly Packet',
      '',
      appUrl,
      qrImage,
      pageNumber,
      { ...pdfContext, titleBlock: false },
    )
    addCoverHero(pdf, qrImage, appUrl)
    addMetric(pdf, 'Source file', sourceFilename, PDF_PAGE.margin, 74, 42)
    addMetric(pdf, 'Build volume', `${buildVolume.join(' x ')} mm`, 70, 74, 43)
    addMetric(pdf, 'Part count', chunks.length, 117, 74, 32)
    addMetric(pdf, 'Units', 'mm', 153, 74, 33)
    addImageFrame(
      pdf,
      completeImage,
      PDF_PAGE.margin,
      99,
      108,
      104,
      'Preview for verification before printing and assembly.',
      { title: 'Complete assembly preview', badge: 'Assembled result' },
    )
    addChecklistCard(pdf, 136, 99, CHECKLIST_CARD_WIDTH, 62)
    addAssemblyFlowCard(pdf, 136, 165, ASSEMBLY_FLOW_CARD_WIDTH, 48)
    addInfoCard(
      pdf,
      'Package contents',
      PACKAGE_CONTENTS_BODY,
      PACKAGE_CONTENTS_NOTE,
      PDF_PAGE.margin,
      218,
      PACKAGE_CONTENTS_CARD_WIDTH,
      48,
    )
    addInfoCard(
      pdf,
      'Important note',
      IMPORTANT_NOTE_BODY,
      IMPORTANT_NOTE_NOTE,
      111,
      218,
      IMPORTANT_NOTE_CARD_WIDTH,
      48,
    )

    pageNumber += 1
    await addPage(
      pdf,
      'Labeled Part Index',
      'This page shows the full assembly with part labels and the printable part inventory.',
      appUrl,
      qrImage,
      pageNumber,
      pdfContext,
    )
    addImageFrame(pdf, labeledAssemblyImage, PDF_PAGE.margin, 58, 162, 96, 'Complete assembly with labels')
    addPartsTable(pdf, chunks, 168)

    for (const chunk of ordered) {
      pageNumber += 1
      const size = partDimensions(chunk)
      const inContext = renderPartInContext(chunks, chunk.index)
      const isolated = renderPartIsolated(chunk)
      await addPage(
        pdf,
        `Part ${chunk.assemblyOrder ?? chunk.index + 1}: ${chunk.label}`,
        'Review the highlighted position before printing and assembling this part.',
        appUrl,
        qrImage,
        pageNumber,
        pdfContext,
      )
      addImageFrame(pdf, inContext, PDF_PAGE.margin, 58, 77, 74, 'Part highlighted inside assembly')
      addImageFrame(pdf, isolated, 109, 58, 77, 74, 'Individual part only')
      addMetric(pdf, 'Label', chunk.label, PDF_PAGE.margin, 145, 42)
      addMetric(pdf, 'Dimensions', `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} mm`, 70, 145, 70)
      addMetric(pdf, 'Volume', `${(Math.abs(chunk.volume || computeVolume(chunk.geometry)) / 1000).toFixed(2)} cm3`, 146, 145, 40)
      setFont(pdf, 11, 'bold', BRAND.black)
      pdf.text('Part handling notes', PDF_PAGE.margin, 182)
      setFont(pdf, 9, 'normal', BRAND.ink)
      pdf.text([
        '1. Keep the part label visible until final assembly.',
        '2. Confirm connector fit before applying adhesive or permanent fasteners.',
        '3. If orientation matters for surface finish, choose the slicer orientation that protects visible faces.',
      ], PDF_PAGE.margin, 193, { maxWidth: 178 })
    }

    for (let i = 0; i < ordered.length; i += 2) {
      pageNumber += 1
      await addPage(
        pdf,
        'Visual Assembly Guide',
        'Add parts in order. Newly added parts are colored; previously placed parts are grey.',
        appUrl,
        qrImage,
        pageNumber,
        pdfContext,
      )

      for (let slot = 0; slot < 2; slot++) {
        const stepIndex = i + slot
        if (stepIndex >= ordered.length) break
        const chunk = ordered[stepIndex]
        const stepImage = renderAssemblyStep(ordered, stepIndex)
        const y = slot === 0 ? 58 : 169
        addImageFrame(pdf, stepImage, PDF_PAGE.margin, y, 92, 80, `Step ${stepIndex + 1}: add ${chunk.label}`)
        setFont(pdf, 12, 'bold', BRAND.black)
        pdf.text(`Step ${stepIndex + 1}`, 124, y + 12)
        setFont(pdf, 9, 'normal', BRAND.ink)
        pdf.text([
          `Place ${chunk.label} in the highlighted position.`,
          'Check that neighboring faces sit flush.',
          'Confirm connector alignment before moving to the next part.',
        ], 124, y + 24, { maxWidth: 62 })
      }
    }
  } finally {
    disposeSnapshotRenderer?.()
  }

  return pdf.output('arraybuffer')
}
