import * as THREE from 'three'
import { Brush, Evaluator, INTERSECTION, ADDITION, SUBTRACTION, computeMeshVolume } from 'three-bvh-csg'

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
    volume = computeMeshVolume(geometry)
  } catch {
    volume = computeVolumeImpl(geometry)
  }

  return { watertight, volume, euler, faceCount, vertCount }
}

export function computeVolume(geometry) {
  return computeVolumeImpl(geometry)
}

export function splitMesh(mesh, buildVolume, gridDivisions) {
  const info = validateManifold(mesh.geometry)
  if (!info.watertight) {
    throw new Error('Mesh must be watertight for splitting')
  }
  const [dx, dy, dz] = gridDivisions
  if (dx === 0 || dy === 0 || dz === 0) return []

  const evaluator = new Evaluator()
  const existingAttrs = Object.keys(mesh.geometry.attributes)
  evaluator.attributes = ['position']
  if (existingAttrs.includes('normal')) evaluator.attributes.push('normal')
  if (existingAttrs.includes('uv')) evaluator.attributes.push('uv')

  const mainBrush = new Brush(mesh.geometry.clone())
  mainBrush.position.set(0, 0, 0)
  mainBrush.updateMatrixWorld()
  mainBrush.prepareGeometry()

  mesh.geometry.computeBoundingBox()
  const bb = mesh.geometry.boundingBox
  const meshCenter = new THREE.Vector3().copy(bb.min).add(bb.max).multiplyScalar(0.5)
  const meshSize = new THREE.Vector3().copy(bb.max).sub(bb.min)

  const cellSize = [meshSize.x / dx, meshSize.y / dy, meshSize.z / dz]
  const chunks = []
  let chunkIndex = 0

  for (let iz = 0; iz < dz; iz++) {
    for (let iy = 0; iy < dy; iy++) {
      for (let ix = 0; ix < dx; ix++) {
        const cx = meshCenter.x - meshSize.x / 2 + cellSize[0] * (ix + 0.5)
        const cy = meshCenter.y - meshSize.y / 2 + cellSize[1] * (iy + 0.5)
        const cz = meshCenter.z - meshSize.z / 2 + cellSize[2] * (iz + 0.5)

        const cellGeo = new THREE.BoxGeometry(cellSize[0], cellSize[1], cellSize[2])
        const cellBrush = new Brush(cellGeo)
        cellBrush.position.set(cx, cy, cz)
        cellBrush.updateMatrixWorld()
        cellBrush.prepareGeometry()

        let result
        try {
          result = evaluator.evaluate(mainBrush, cellBrush, INTERSECTION)
        } catch {
          cellGeo.dispose()
          continue
        }

        const resultGeo = result.geometry
        if (resultGeo.attributes.position.count > 0) {
          chunks.push({
            index: chunkIndex++,
            geometry: resultGeo.clone(),
            label: `X${ix}Y${iy}Z${iz}`,
            volume: computeMeshVolume(resultGeo),
            centroid: computeCentroid(resultGeo),
          })
        }
      }
    }
  }

  mainBrush.geometry.dispose()
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

export function addConnectors(chunks, config) {
  const type = (config.type || 'None').toLowerCase()
  if (type === 'none') return chunks
  chunks = chunks.map(c => ({ ...c, geometry: c.geometry.clone() }))
  if (chunks.length < 2) return chunks

  const evaluator = new Evaluator()
  const { diameter, depth, clearance, perFace } = config
  const radius = diameter / 2

  const filterAttrs = (geom) => {
    const keys = Object.keys(geom.attributes)
    const attrs = ['position']
    if (keys.includes('normal')) attrs.push('normal')
    if (keys.includes('uv')) attrs.push('uv')
    evaluator.attributes = attrs
  }

  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      chunks[i].geometry.computeBoundingBox()
      chunks[j].geometry.computeBoundingBox()
      const bbA = chunks[i].geometry.boundingBox
      const bbB = chunks[j].geometry.boundingBox

      if (!bbA.intersectsBox(bbB)) continue

      const interMin = new THREE.Vector3(
        Math.max(bbA.min.x, bbB.min.x),
        Math.max(bbA.min.y, bbB.min.y),
        Math.max(bbA.min.z, bbB.min.z)
      )
      const interMax = new THREE.Vector3(
        Math.min(bbA.max.x, bbB.max.x),
        Math.min(bbA.max.y, bbB.max.y),
        Math.min(bbA.max.z, bbB.max.z)
      )
      const interBox = new THREE.Box3(interMin, interMax)
      const interSize = new THREE.Vector3()
      interBox.getSize(interSize)

      const axis = interSize.x <= interSize.y && interSize.x <= interSize.z ? 0
        : interSize.y <= interSize.z ? 1 : 2
      const center = new THREE.Vector3()
      interBox.getCenter(center)

      const otherAxes = [(axis + 1) % 3, (axis + 2) % 3]
      const extentA = interSize.getComponent(otherAxes[0])
      const extentB = interSize.getComponent(otherAxes[1])

      for (let p = 0; p < perFace; p++) {
        const frac = (p + 1) / (perFace + 1)
        const offset = new THREE.Vector3()
        if (perFace === 1) {
          offset.set(0, 0, 0)
        } else {
          offset.setComponent(otherAxes[0], (frac - 0.5) * extentA)
          offset.setComponent(otherAxes[1], (frac - 0.5) * extentB)
        }
        const pos = center.clone().add(offset)

        const cylGeo = new THREE.CylinderGeometry(radius, radius, depth * 2, 16)
        const cylBrush = new Brush(cylGeo)
        if (axis === 0) cylBrush.rotation.z = -Math.PI / 2
        else if (axis === 2) cylBrush.rotation.x = Math.PI / 2
        cylBrush.position.copy(pos)
        cylBrush.updateMatrixWorld()
        cylBrush.prepareGeometry()

        const cylGeoHole = new THREE.CylinderGeometry(radius + clearance, radius + clearance, depth * 2, 16)
        const cylBrushHole = new Brush(cylGeoHole)
        if (axis === 0) cylBrushHole.rotation.z = -Math.PI / 2
        else if (axis === 2) cylBrushHole.rotation.x = Math.PI / 2
        cylBrushHole.position.copy(pos)
        cylBrushHole.updateMatrixWorld()
        cylBrushHole.prepareGeometry()

        try {
          const brushI = new Brush(chunks[i].geometry)
          brushI.position.set(0, 0, 0)
          brushI.updateMatrixWorld()
          brushI.prepareGeometry()
          filterAttrs(chunks[i].geometry)
          const maleResult = evaluator.evaluate(brushI, cylBrush, ADDITION)
          chunks[i].geometry = maleResult.geometry.clone()

          const brushJ = new Brush(chunks[j].geometry)
          brushJ.position.set(0, 0, 0)
          brushJ.updateMatrixWorld()
          brushJ.prepareGeometry()
          filterAttrs(chunks[j].geometry)
          const femaleResult = evaluator.evaluate(brushJ, cylBrushHole, SUBTRACTION)
          chunks[j].geometry = femaleResult.geometry.clone()
        } catch {
          continue
        }
      }
    }
  }

  return chunks
}

export async function exportStl(chunks) {
  const { STLExporter } = await import('three/addons/exporters/STLExporter.js')
  const exporter = new STLExporter()
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  chunks.forEach(chunk => {
    const mesh = new THREE.Mesh(chunk.geometry)
    const stlString = exporter.parse(mesh, { binary: false })
    zip.file(`part_${String(chunk.index).padStart(2, '0')}_${chunk.label}.stl`, stlString)
  })

  return zip.generateAsync({ type: 'blob' })
}

export async function exportPdf(chunks, buildVolume) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF()

  pdf.setFontSize(24)
  pdf.text('Mesh Split Report', 105, 40, { align: 'center' })

  pdf.setFontSize(14)
  pdf.text(`Build Volume: ${buildVolume[0]} x ${buildVolume[1]} x ${buildVolume[2]} mm`, 20, 70)
  pdf.text(`Part Count: ${chunks.length}`, 20, 85)

  const date = new Date().toLocaleDateString()
  pdf.text(`Date: ${date}`, 20, 100)

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
