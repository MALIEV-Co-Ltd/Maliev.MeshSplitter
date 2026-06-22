import * as THREE from 'three'
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url'

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
  const info = validateManifold(mesh.geometry)
  if (!info.watertight) {
    throw new Error('Mesh must be watertight for manifold splitting')
  }

  const [dx, dy, dz] = gridDivisions.map(Number)
  if (dx === 0 || dy === 0 || dz === 0) return []
  if (![dx, dy, dz].every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error('Grid divisions must be positive whole numbers')
  }

  const manifold = await getManifoldModule()
  const manifoldMesh = geometryToManifoldMesh(mesh.geometry, manifold)
  const solid = manifold.Manifold.ofMesh(manifoldMesh)
  const status = solid.status()
  if (status !== 'NoError') {
    solid.delete?.()
    throw new Error(`Input mesh is not manifold (${status})`)
  }

  mesh.geometry.computeBoundingBox()
  const bb = mesh.geometry.boundingBox
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

export async function addConnectorsManifold(chunks, config) {
  const type = (config.type || 'None').toLowerCase()
  if (type === 'none') return chunks
  if (chunks.length < 2) return chunks

  const manifold = await getManifoldModule()
  const radius = Number(config.diameter || 6) / 2
  const clearance = Number(config.clearance || 0.1)
  const depth = Number(config.depth || 10)
  const perFace = Math.max(1, Number(config.perFace || 1))
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error('Connector diameter must be greater than zero')
  }
  if (!Number.isFinite(depth) || depth <= 0) {
    throw new Error('Connector depth must be greater than zero')
  }
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

        const touchingAxes = [0, 1, 2]
          .map((axis) => ({
            axis,
            overlap: interSize.getComponent(axis),
          }))
          .filter((entry) => entry.overlap <= bboxTouchTolerance)
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

        for (let p = 0; p < perFace; p++) {
          const frac = (p + 1) / (perFace + 1)
          const offset = new THREE.Vector3()
          if (perFace > 1) {
            offset.setComponent(otherAxes[0], (frac - 0.5) * extentA)
            offset.setComponent(otherAxes[1], (frac - 0.5) * extentB)
          }
          const pos = center.clone().add(offset)
          const peg = orientConnector(manifold.Manifold.cylinder(depth * 2, radius, radius, 24, true), axis).translate([pos.x, pos.y, pos.z])
          const socket = orientConnector(manifold.Manifold.cylinder(depth * 2, radius + clearance, radius + clearance, 24, true), axis).translate([pos.x, pos.y, pos.z])

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
    const stlString = exporter.parse(mesh, { binary: false })
    zip.file(`part_${String(chunk.index).padStart(2, '0')}_${chunk.label}.stl`, stlString)
  })
  return zip
}

export async function exportStl(chunks) {
  const zip = await createStlZip(chunks)
  return zip.generateAsync({ type: 'blob' })
}

export async function exportPackage(chunks, buildVolume) {
  const zip = await createStlZip(chunks)
  const pdfData = await exportPdf(chunks, buildVolume)
  zip.file('mesh-splitter-assembly.pdf', pdfData)
  return zip.generateAsync({ type: 'blob' })
}

export async function exportPdf(chunks, buildVolume) {
  validateExportChunks(chunks)
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF()

  pdf.setFontSize(24)
  pdf.text('MeshSplitter Assembly Packet', 105, 38, { align: 'center' })

  pdf.setFontSize(14)
  pdf.text(`Build Volume: ${buildVolume[0]} x ${buildVolume[1]} x ${buildVolume[2]} mm`, 20, 66)
  pdf.text(`Part Count: ${chunks.length}`, 20, 81)

  const date = new Date().toLocaleDateString()
  pdf.text(`Date: ${date}`, 20, 96)

  pdf.setFontSize(12)
  const steps = [
    '1. Print every labeled STL part using the orientation chosen in your slicer.',
    '2. Dry fit parts by label before applying adhesive or permanent fasteners.',
    '3. Use matching connector faces and labels to keep the assembly order stable.',
    '4. Re-export from MeshSplitter after any scale, connector, or build-volume change.',
  ]
  let stepY = 122
  pdf.setFontSize(16)
  pdf.text('Assembly Instructions', 20, stepY)
  pdf.setFontSize(11)
  stepY += 12
  steps.forEach((step) => {
    pdf.text(step, 20, stepY, { maxWidth: 170 })
    stepY += 11
  })

  pdf.addPage()
  pdf.setFontSize(18)
  pdf.text('Parts List', 105, 20, { align: 'center' })

  pdf.setFontSize(10)
  const headers = ['#', 'Label', 'Volume (cm\u00B3)', 'X (mm)', 'Y (mm)', 'Z (mm)']
  const colWidths = [15, 35, 30, 25, 25, 25]
  let xPos = 15
  headers.forEach((h, i) => {
    pdf.text(h, xPos, 35)
    xPos += colWidths[i]
  })

  pdf.line(15, 37, 15 + colWidths.reduce((a, b) => a + b, 0), 37)

  let yPos = 45
  chunks.forEach(chunk => {
    if (yPos > 270) {
      pdf.addPage()
      yPos = 25
    }
    const box = new THREE.Box3().setFromObject(new THREE.Mesh(chunk.geometry))
    const size = new THREE.Vector3()
    box.getSize(size)
    const volCm3 = (chunk.volume || 0) / 1000

    xPos = 15
    const row = [
      String(chunk.index),
      chunk.label,
      volCm3.toFixed(2),
      size.x.toFixed(1),
      size.y.toFixed(1),
      size.z.toFixed(1),
    ]
    row.forEach((cell, i) => {
      pdf.text(cell, xPos, yPos)
      xPos += colWidths[i]
    })
    yPos += 8
  })

  return pdf.output('arraybuffer')
}
