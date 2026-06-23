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
    throw new Error(`Unable to load manifold WASM (${response.status})`)
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

function chunkLabel(partNumber, ix, iy, iz) {
  return `P${String(partNumber).padStart(2, '0')}-X${ix}Y${iy}Z${iz}`
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
            const label = chunkLabel(partNumber, ix, iy, iz)
            chunks.push({
              index: partNumber - 1,
              assemblyOrder: partNumber,
              geometry,
              label,
              volume: Math.abs(part.volume()),
              centroid: computeCentroid(geometry),
              manifoldStatus,
            })
            partNumber += 1
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

function createConnectorShape(manifold, type, { size, thickness, depth, clearance }) {
  if (type === 'dowel') {
    const radius = clampConnectorSpacing(size / 2, 0.1)
    const socketRadius = clampConnectorSpacing(radius + (clearance || 0), 0.1)
    return {
      makePeg: () => manifold.Manifold.cylinder(depth * 2, radius, radius, 24, true),
      makeSocket: () => manifold.Manifold.cylinder(depth * 2, socketRadius, socketRadius, 24, true),
    }
  }

  if (type === 'mortise-and-tenon') {
    const width = clampConnectorSpacing(size, 1.5)
    const keyHeight = clampConnectorSpacing(thickness, 1.5)
    return {
      makePeg: () => manifold.Manifold.cube([width, keyHeight, depth * 2], true),
      makeSocket: () => manifold.Manifold.cube(
        [width + (clearance || 0) * 2, keyHeight + (clearance || 0) * 2, depth * 2 + (clearance || 0) * 2],
        true,
      ),
    }
  }

  const keyWidth = clampConnectorSpacing(size, 1.5)
  const keyHeight = clampConnectorSpacing(thickness, 1.0)
  return {
    makePeg: () => manifold.Manifold.cube([keyWidth * 1.25, keyHeight, depth * 2], true),
    makeSocket: () => {
      return manifold.Manifold.cube(
        [keyWidth + (clearance || 0) * 2, keyHeight + (clearance || 0) * 2, depth * 2 + (clearance || 0) * 2],
        true,
      )
    },
  }
}

export async function addConnectorsManifold(chunks, config) {
  const type = resolveConnectorType(config.type)
  if (type === 'none') return chunks
  if (chunks.length < 2) return chunks

  const manifold = await getManifoldModule()
  const depth = Number(config.depth || 10)
  const perFace = Math.max(1, Number(config.perFace || 1))
  if (!Number.isFinite(depth) || depth <= 0) {
    throw new Error('Connector depth must be greater than zero')
  }

  const clearance = Number(config.clearance || 0.1)
  const size = toPositive(config.diameter, 6)
  const size2 = toPositive(config.tenonWidth ?? config.keyWidth ?? config.width, size)
  const thickness = toPositive(config.tenonThickness ?? config.keyHeight ?? config.thickness, type === 'key' ? Math.max(1.5, size * 0.55) : Math.max(1.5, size * 0.45))
  const shape = createConnectorShape(manifold, type, {
    size: type === 'dowel' ? size : size2,
    thickness,
    depth,
    clearance,
  })

  if (!Number.isFinite(clearance) || clearance < 0) {
    throw new Error('Connector clearance cannot be negative')
  }

  const bboxes = chunks.map((chunk) => {
    chunk.geometry.computeBoundingBox()
    return chunk.geometry.boundingBox.clone()
  })
  const solids = chunks.map((chunk) => manifold.Manifold.ofMesh(geometryToManifoldMesh(chunk.geometry, manifold)))

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
        const connectorRadius = type === 'dowel'
          ? Math.max(size / 2, 0.1)
          : Math.max(size2, thickness) / 2
        const candidates = findSharedCutFaceCandidates(
          chunks[i].geometry,
          chunks[j].geometry,
          axis,
          center.getComponent(axis),
          interBox,
          otherAxes,
          Math.max(connectorRadius * 1.75, faceTolerance * 4),
          faceTolerance,
          connectorRadius + clearance + faceTolerance,
        )

        if (candidates.length === 0) {
          continue
        }

        const positions = distributeConnectorCandidates(candidates, perFace, otherAxes)
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
        manifoldStatus: status,
      }
    })
  } finally {
    solids.forEach((solid) => solid.delete?.())
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

async function createStlZip(chunks) {
  validateExportChunks(chunks)
  const { STLExporter } = await import('three/addons/exporters/STLExporter.js')
  const exporter = new STLExporter()
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  chunks.forEach(chunk => {
    const mesh = new THREE.Mesh(chunk.geometry)
    const stlData = exporter.parse(mesh, { binary: true })
    const stlBuffer = stlData instanceof ArrayBuffer
      ? stlData
      : stlData.buffer.slice(stlData.byteOffset, stlData.byteOffset + stlData.byteLength)
    zip.file(`part_${String(chunk.index).padStart(2, '0')}_${chunk.label}.stl`, stlBuffer)
  })
  return zip
}

export async function exportStl(chunks) {
  const zip = await createStlZip(chunks)
  return zip.generateAsync({ type: 'blob' })
}

export async function exportPackage(chunks, buildVolume, options = {}) {
  const zip = await createStlZip(chunks)
  const pdfData = await exportPdf(chunks, buildVolume, options)
  zip.file('mesh-splitter-assembly.pdf', pdfData)
  return zip.generateAsync({ type: 'blob' })
}

const PDF_PAGE = {
  width: 210,
  height: 297,
  margin: 15,
}

const BRAND = {
  black: [17, 24, 39],
  ink: [31, 41, 55],
  muted: [107, 114, 128],
  border: [209, 213, 219],
  panel: [248, 250, 252],
  accent: [14, 165, 233],
}

const DEFAULT_APP_URL = 'https://shop.maliev.com/tools/mesh-splitter'

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
  pdf.rect(0, 0, PDF_PAGE.width, 24, 'F')

  if (canRenderSvgLogo()) {
    try {
      await pdf.addSvgAsImage(malievLogoWhiteSvg, PDF_PAGE.margin, 7, 18, 6)
    } catch {
      drawLogoFallback(pdf)
    }
  } else {
    drawLogoFallback(pdf)
  }
  setFont(pdf, 8, 'normal', [229, 231, 235])
  pdf.text('Mesh Splitter', PDF_PAGE.margin + 24, 14)
  pdf.text(appUrl, PDF_PAGE.width - PDF_PAGE.margin, 14, { align: 'right' })

  if (qrImage) {
    pdf.addImage(qrImage, 'PNG', PDF_PAGE.width - PDF_PAGE.margin - 20, 28, 20, 20)
  }

  setFont(pdf, 20, 'bold', BRAND.black)
  pdf.text(title, PDF_PAGE.margin, 42)
  if (subtitle) {
    setFont(pdf, 9, 'normal', BRAND.muted)
    pdf.text(subtitle, PDF_PAGE.margin, 49, { maxWidth: qrImage ? 135 : 175 })
  }
}

function canRenderSvgLogo() {
  if (typeof document === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return false
  const canvas = document.createElement('canvas')
  return typeof canvas.getContext === 'function'
}

function drawLogoFallback(pdf) {
  setFont(pdf, 11, 'bold', [255, 255, 255])
  pdf.text('MALIEV', PDF_PAGE.margin, 14)
}

function addFooter(pdf, appUrl, pageNumber) {
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.line(PDF_PAGE.margin, 283, PDF_PAGE.width - PDF_PAGE.margin, 283)
  setFont(pdf, 8, 'normal', BRAND.muted)
  pdf.text(`Generated by MALIEV Mesh Splitter | ${appUrl}`, PDF_PAGE.margin, 289)
  pdf.text(`Page ${pageNumber}`, PDF_PAGE.width - PDF_PAGE.margin, 289, { align: 'right' })
}

async function addPage(pdf, title, subtitle, appUrl, qrImage, pageNumber) {
  if (pageNumber > 1) pdf.addPage()
  await addHeader(pdf, title, subtitle, appUrl, qrImage)
  addFooter(pdf, appUrl, pageNumber)
}

function addImageFrame(pdf, image, x, y, width, height, caption) {
  setRgb(pdf, 'setFillColor', BRAND.panel)
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, height, 2, 2, 'FD')
  if (image) {
    pdf.addImage(image, 'JPEG', x + 3, y + 6, width - 6, height - 14)
  } else {
    setFont(pdf, 9, 'normal', BRAND.muted)
    pdf.text('Preview image unavailable in this browser session.', x + width / 2, y + height / 2, { align: 'center' })
  }
  if (caption) {
    setFont(pdf, 8, 'normal', BRAND.muted)
    pdf.text(caption, x + 3, y + height - 4)
  }
}

function addMetric(pdf, label, value, x, y, width = 54) {
  setRgb(pdf, 'setFillColor', [255, 255, 255])
  setRgb(pdf, 'setDrawColor', BRAND.border)
  pdf.roundedRect(x, y, width, 18, 2, 2, 'FD')
  setFont(pdf, 7, 'normal', BRAND.muted)
  pdf.text(label, x + 3, y + 6)
  setFont(pdf, 10, 'bold', BRAND.black)
  pdf.text(String(value), x + 3, y + 14, { maxWidth: width - 6 })
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
  validateExportChunks(chunks)
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
      'Print-ready split mesh package generated locally in your browser by MALIEV Mesh Splitter.',
      appUrl,
      qrImage,
      pageNumber,
    )
    addMetric(pdf, 'Source file', sourceFilename, PDF_PAGE.margin, 58, 70)
    addMetric(pdf, 'Build volume', `${buildVolume.join(' x ')} mm`, 90, 58, 50)
    addMetric(pdf, 'Part count', chunks.length, 145, 58, 35)
    addImageFrame(pdf, completeImage, PDF_PAGE.margin, 84, 180, 124, 'Complete mesh / assembled result')
    setFont(pdf, 10, 'normal', BRAND.ink)
    pdf.text([
      'Use this packet with the bundled STL files. Print every labeled part, dry fit the assembly,',
      'then join parts by label and connector location. Scan the QR code for Mesh Splitter.',
    ], PDF_PAGE.margin, 224, { maxWidth: 180 })

    pageNumber += 1
    await addPage(
      pdf,
      'Labeled Part Index',
      'This page shows the full assembly with part labels and the printable part inventory.',
      appUrl,
      qrImage,
      pageNumber,
    )
    addImageFrame(pdf, labeledAssemblyImage, PDF_PAGE.margin, 58, 180, 96, 'Complete assembly with labels')
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
      )
      addImageFrame(pdf, inContext, PDF_PAGE.margin, 58, 86, 74, 'Part highlighted inside assembly')
      addImageFrame(pdf, isolated, 109, 58, 86, 74, 'Individual part only')
      addMetric(pdf, 'Label', chunk.label, PDF_PAGE.margin, 145, 45)
      addMetric(pdf, 'Dimensions', `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} mm`, 65, 145, 70)
      addMetric(pdf, 'Volume', `${(Math.abs(chunk.volume || computeVolume(chunk.geometry)) / 1000).toFixed(2)} cm3`, 145, 145, 35)
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
      )

      for (let slot = 0; slot < 2; slot++) {
        const stepIndex = i + slot
        if (stepIndex >= ordered.length) break
        const chunk = ordered[stepIndex]
        const stepImage = renderAssemblyStep(ordered, stepIndex)
        const y = slot === 0 ? 58 : 169
        addImageFrame(pdf, stepImage, PDF_PAGE.margin, y, 96, 80, `Step ${stepIndex + 1}: add ${chunk.label}`)
        setFont(pdf, 12, 'bold', BRAND.black)
        pdf.text(`Step ${stepIndex + 1}`, 118, y + 12)
        setFont(pdf, 9, 'normal', BRAND.ink)
        pdf.text([
          `Place ${chunk.label} in the highlighted position.`,
          'Check that neighboring faces sit flush.',
          'Confirm connector alignment before moving to the next part.',
        ], 118, y + 24, { maxWidth: 72 })
      }
    }
  } finally {
    disposeSnapshotRenderer?.()
  }

  return pdf.output('arraybuffer')
}
