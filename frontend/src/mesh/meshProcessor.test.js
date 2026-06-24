import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  addConnectorsManifold,
  applyScale,
  computeVolume,
  exportStl,
  exportPackage,
  orderPartsByConnectivity,
  repairMeshGeometry,
  splitMeshManifold,
  validateExportChunks,
  validateManifold,
} from './meshProcessor'

describe('validateManifold', () => {
  it('detects a 10x10x10 box as watertight', () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10)
    const info = validateManifold(geometry)
    expect(info.watertight).toBe(true)
    expect(info.faceCount).toBe(12)
    expect(info.volume).toBeCloseTo(1000, 0)
    expect(info.vertCount).toBeGreaterThan(0)
  })

  it('detects a PlaneGeometry as non-watertight', () => {
    const geometry = new THREE.PlaneGeometry(10, 10)
    const info = validateManifold(geometry)
    expect(info.watertight).toBe(false)
  })
})

describe('computeVolume', () => {
  it('returns ~6000 for 10x20x30 box', () => {
    const geometry = new THREE.BoxGeometry(10, 20, 30)
    const volume = computeVolume(geometry)
    expect(volume).toBeCloseTo(6000, -1)
  })
})

describe('applyScale', () => {
  it('scales geometry dimensions and volume before splitting', () => {
    const geometry = new THREE.BoxGeometry(10, 20, 30)
    const scaled = applyScale(geometry, 2)
    scaled.computeBoundingBox()
    const size = scaled.boundingBox.getSize(new THREE.Vector3())

    expect(size.x).toBeCloseTo(20)
    expect(size.y).toBeCloseTo(40)
    expect(size.z).toBeCloseTo(60)
    expect(computeVolume(scaled)).toBeCloseTo(48000, -1)
  })
})

describe('splitMeshManifold', () => {
  it('repairs a simple non-manifold hole before splitting', async () => {
    const geometry = boxWithMissingTriangle()
    expect(validateManifold(geometry).watertight).toBe(false)

    const repaired = repairMeshGeometry(geometry)
    expect(validateManifold(repaired).watertight).toBe(true)

    const chunks = await splitMeshManifold(new THREE.Mesh(geometry), [100, 100, 100], [2, 1, 1])
    expect(chunks).toHaveLength(2)
    chunks.forEach((chunk) => {
      expect(validateManifold(chunk.geometry).watertight).toBe(true)
    })
  })

  it('uses browser-loadable WASM manifold operations to produce watertight chunks', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = await splitMeshManifold(mesh, [100, 100, 100], [2, 2, 1])

    expect(chunks).toHaveLength(4)
    chunks.forEach(chunk => {
      expect(chunk.label).toMatch(/^P\d{2}-X\dY\dZ\d$/)
      expect(chunk.manifoldStatus).toBe('NoError')
      expect(validateManifold(chunk.geometry).watertight).toBe(true)
    })
  })

  it('reports disconnected mesh bodies inside one build-volume cell as separate parts', async () => {
    const upperArm = new THREE.BoxGeometry(40, 12, 12).translate(0, 24, 0)
    const lowerArm = new THREE.BoxGeometry(40, 12, 12).translate(0, -24, 0)
    const mesh = new THREE.Mesh(mergeTestGeometries([upperArm, lowerArm]))

    const chunks = await splitMeshManifold(mesh, [100, 100, 100], [1, 1, 1])

    expect(chunks).toHaveLength(2)
    chunks.forEach((chunk) => {
      expect(chunk.label).toMatch(/^P\d{2}-X0Y0Z0-B\d$/)
      expect(validateManifold(chunk.geometry).watertight).toBe(true)
    })
  })

  it('splits disconnected bodies before connector placement so each body can receive a connector', async () => {
    const upperBeam = new THREE.BoxGeometry(80, 12, 20).translate(0, 24, 0)
    const lowerBeam = new THREE.BoxGeometry(80, 12, 20).translate(0, -24, 0)
    const mesh = new THREE.Mesh(mergeTestGeometries([upperBeam, lowerBeam]))

    const chunks = await splitMeshManifold(mesh, [100, 100, 100], [2, 1, 1])
    const baselineVolumes = chunks.map((chunk) => chunk.volume)

    expect(chunks).toHaveLength(4)

    const result = await addConnectorsManifold(chunks, {
      type: 'Mortise & Tenon',
      tenonWidth: 6,
      tenonThickness: 4,
      depth: 5,
      clearance: 0.3,
      perFace: 1,
    })

    result.forEach((chunk, i) => {
      expect(chunk.connectorCount).toBeGreaterThan(0)
      expect(Math.abs(chunk.volume - baselineVolumes[i])).toBeGreaterThan(0.1)
      expect(validateManifold(chunk.geometry).watertight).toBe(true)
    })
  })
})

describe('orderPartsByConnectivity', () => {
  // Four unit cubes in a row, but supplied in an index order (A, C, B, D) that
  // raster sequencing would assemble as A then C — and C does not touch A, a
  // "floating" step. Connectivity ordering must never leave such a gap.
  function boxPart(index, cx, label) {
    const geometry = new THREE.BoxGeometry(10, 10, 10).translate(cx, 5, 5)
    geometry.computeBoundingBox()
    return { index, label, volume: 1000, centroid: new THREE.Vector3(cx, 5, 5), geometry }
  }

  function sharesFace(a, b) {
    let overlapping = 0
    for (const axis of ['x', 'y', 'z']) {
      const overlap = Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis])
      if (overlap < -0.01) return false
      if (overlap > 0.01) overlapping += 1
    }
    return overlapping >= 2
  }

  it('sequences every part adjacent to one already placed (no floating steps)', () => {
    const parts = [
      boxPart(0, 5, 'A'),  // x 0..10
      boxPart(1, 25, 'C'), // x 20..30 — not adjacent to A
      boxPart(2, 15, 'B'), // x 10..20 — bridges A and C
      boxPart(3, 35, 'D'), // x 30..40 — adjacent to C
    ]

    const ordered = orderPartsByConnectivity(parts)
    const bySeq = [...ordered].sort((a, b) => a.assemblyOrder - b.assemblyOrder)

    expect(bySeq.map((p) => p.assemblyOrder)).toEqual([1, 2, 3, 4])
    for (let i = 1; i < bySeq.length; i += 1) {
      const earlier = bySeq.slice(0, i)
      const connected = earlier.some((e) => sharesFace(e.geometry.boundingBox, bySeq[i].geometry.boundingBox))
      expect(connected).toBe(true)
    }
  })

  it('leaves a single part (or keys) untouched', () => {
    const one = [{ index: 0, label: 'P01', volume: 1, geometry: new THREE.BoxGeometry(1, 1, 1) }]
    expect(orderPartsByConnectivity(one)).toBe(one)
  })
})

describe('addConnectorsManifold', () => {
  it('keeps connector-modified chunks watertight and exportable', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = await splitMeshManifold(mesh, [100, 100, 100], [2, 1, 1])
    const config = { type: 'dowel', diameter: 5, depth: 10, clearance: 0.2, perFace: 2 }
    const result = await addConnectorsManifold(chunks, config)

    expect(result).toHaveLength(2)
    result.forEach(chunk => {
      expect(chunk.manifoldStatus).toBe('NoError')
      expect(validateManifold(chunk.geometry).watertight).toBe(true)
    })
    expect(() => validateExportChunks(result)).not.toThrow()
  })

  it('creates different geometry for mortise & tenon connectors', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = await splitMeshManifold(mesh, [100, 100, 100], [2, 1, 1])

    const dowel = await addConnectorsManifold(chunks, { type: 'Dowel', diameter: 6, depth: 8, clearance: 0.2, perFace: 1 })
    const mortise = await addConnectorsManifold(chunks, { type: 'Mortise & Tenon', tenonWidth: 6, tenonThickness: 4, depth: 8, clearance: 0.2, perFace: 1 })

    expect(dowel[0].geometry.attributes.position.count).not.toEqual(mortise[0].geometry.attributes.position.count)
    expect(dowel[1].geometry.attributes.position.count).not.toEqual(mortise[1].geometry.attributes.position.count)
  })

  it('creates different geometry for key connectors', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = await splitMeshManifold(mesh, [100, 100, 100], [2, 1, 1])

    const dowel = await addConnectorsManifold(chunks, { type: 'Dowel', diameter: 6, depth: 8, clearance: 0.2, perFace: 1 })
    const key = await addConnectorsManifold(chunks, { type: 'Key', keyWidth: 6, keyHeight: 3.5, depth: 8, clearance: 0.2, perFace: 1 })

    expect(dowel[0].geometry.attributes.position.count).not.toEqual(key[0].geometry.attributes.position.count)
    expect(dowel[1].geometry.attributes.position.count).not.toEqual(key[1].geometry.attributes.position.count)
  })

  it('does not create duplicate connectors when applying the same config to the same split', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = await splitMeshManifold(mesh, [100, 100, 100], [2, 1, 1])
    const config = { type: 'dowel', diameter: 5, depth: 10, clearance: 0.2, perFace: 2 }

    const firstApply = await addConnectorsManifold(chunks, config)
    const secondApply = await addConnectorsManifold(chunks, config)

    expect(secondApply).toHaveLength(2)
    firstApply.forEach((chunk, i) => {
      expect(secondApply[i].geometry.attributes.position.count)
        .toBe(chunk.geometry.attributes.position.count)
      expect(secondApply[i].geometry.index.count)
        .toBe(chunk.geometry.index.count)
      expect(secondApply[i].manifoldStatus).toBe(chunk.manifoldStatus)
    })
  })

  it('ignores non-adjacent pieces so floating connectors are not emitted', async () => {
    const left = new THREE.BoxGeometry(10, 10, 10).translate(-25, 0, 0)
    const right = new THREE.BoxGeometry(10, 10, 10).translate(25, 0, 0)
    const expectedLeftVolume = computeVolume(left)
    const expectedRightVolume = computeVolume(right)
    const chunks = [
      { index: 0, geometry: left, label: 'P00', volume: computeVolume(left) },
      { index: 1, geometry: right, label: 'P01', volume: computeVolume(right) },
    ]
    const config = { type: 'dowel', diameter: 5, depth: 10, clearance: 0.2, perFace: 1 }
    const result = await addConnectorsManifold(chunks, config)

    expect(result).toHaveLength(2)
    expect(result[0].volume).toBeCloseTo(expectedLeftVolume, 2)
    expect(result[1].volume).toBeCloseTo(expectedRightVolume, 2)
  })

  it('does not place connectors in bounding-box overlap where no cut surface exists', async () => {
    const lowerLeft = new THREE.BoxGeometry(20, 20, 20).translate(-10, -40, -40)
    const upperLeft = new THREE.BoxGeometry(20, 20, 20).translate(-10, 40, 40)
    const upperRight = new THREE.BoxGeometry(20, 20, 20).translate(10, 40, 40)
    const offsetRight = new THREE.BoxGeometry(20, 20, 20).translate(30, -40, -40)
    const left = mergeTestGeometries([lowerLeft, upperLeft])
    const right = mergeTestGeometries([upperRight, offsetRight])
    const expectedLeftVolume = computeVolume(left)
    const expectedRightVolume = computeVolume(right)
    const chunks = [
      { index: 0, geometry: left, label: 'P00', volume: expectedLeftVolume },
      { index: 1, geometry: right, label: 'P01', volume: expectedRightVolume },
    ]

    const result = await addConnectorsManifold(chunks, { type: 'Dowel', diameter: 5, depth: 10, clearance: 0.2, perFace: 1 })

    expect(result).toHaveLength(2)
    expect(result[0].volume).toBeGreaterThan(expectedLeftVolume)
    expect(result[1].volume).toBeLessThan(expectedRightVolume)
    const addedVolume = result[0].volume - expectedLeftVolume
    expect(addedVolume).toBeLessThan(800)
    expect(result[0].centroid.y).toBeGreaterThan(0)
    expect(result[0].centroid.z).toBeGreaterThan(0)
  })

  it('automatically scales oversized connectors to fit thin shared split faces', async () => {
    const left = new THREE.BoxGeometry(20, 6, 80).translate(-10, 0, 0)
    const right = new THREE.BoxGeometry(20, 6, 80).translate(10, 0, 0)
    const expectedLeftVolume = computeVolume(left)
    const expectedRightVolume = computeVolume(right)
    const chunks = [
      { index: 0, geometry: left, label: 'P00', volume: expectedLeftVolume },
      { index: 1, geometry: right, label: 'P01', volume: expectedRightVolume },
    ]

    const result = await addConnectorsManifold(chunks, {
      type: 'Mortise & Tenon',
      tenonWidth: 8,
      tenonThickness: 4,
      depth: 8,
      clearance: 0.2,
      perFace: 1,
    })

    expect(result).toHaveLength(2)
    expect(result[0].connectorCount).toBeGreaterThan(0)
    expect(result[1].connectorCount).toBeGreaterThan(0)
    expect(result[0].volume).toBeGreaterThan(expectedLeftVolume)
    expect(result[1].volume).toBeLessThan(expectedRightVolume)
    result.forEach((chunk) => expect(validateManifold(chunk.geometry).watertight).toBe(true))
  })
})

function mergeTestGeometries(geometries) {
  const positions = []
  const indices = []
  let vertexOffset = 0

  geometries.forEach((geometry) => {
    const source = geometry.index ? geometry : geometry.toNonIndexed()
    const position = source.attributes.position
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i))
    }

    if (source.index) {
      for (let i = 0; i < source.index.count; i += 1) {
        indices.push(source.index.getX(i) + vertexOffset)
      }
    } else {
      for (let i = 0; i < position.count; i += 1) {
        indices.push(vertexOffset + i)
      }
    }
    vertexOffset += position.count
  })

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setIndex(indices)
  merged.computeVertexNormals()
  return merged
}

function boxWithMissingTriangle() {
  const source = new THREE.BoxGeometry(20, 20, 20).toNonIndexed()
  const position = source.attributes.position
  const positions = []
  for (let i = 3; i < position.count; i += 1) {
    positions.push(position.getX(i), position.getY(i), position.getZ(i))
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

describe('export validation', () => {
  it('rejects export only when no part can be made manifold', async () => {
    const badChunk = {
      index: 0,
      label: 'bad',
      geometry: new THREE.PlaneGeometry(10, 10),
    }

    // The sync validator still flags a non-manifold part...
    expect(() => validateExportChunks([badChunk])).toThrow('not manifold')
    // ...but the export pipeline now only fails when *nothing* survives repair.
    await expect(exportStl([badChunk])).rejects.toThrow(/manifold/i)
  })

  it('isolates an unrepairable part and still exports the rest', async () => {
    const good = { index: 0, label: 'GOOD-1', geometry: new THREE.BoxGeometry(20, 20, 20) }
    const bad = { index: 1, label: 'BAD-1', geometry: new THREE.PlaneGeometry(10, 10) }

    const blob = await exportStl([good, bad])
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(blob)
    const files = Object.keys(zip.files)

    expect(files.some((f) => f.endsWith('.stl'))).toBe(true)
    expect(files).toContain('UNEXPORTABLE-PARTS.txt')
    const notice = await zip.file('UNEXPORTABLE-PARTS.txt').async('string')
    expect(notice).toContain('BAD-1')
  })

  it('exports STL + PDF in a single ZIP package', async () => {
    const chunks = await splitMeshManifold(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20)), [20, 20, 20], [2, 1, 1])
    const exportAuthorization = {
      token: 'signed-export-token',
      exportId: 'export-123',
      fingerprint: 'ABCDEF1234567890',
      issuedAt: '2026-06-23T10:00:00.000Z',
      expiresAt: '2026-06-23T10:15:00.000Z',
    }
    const packageBlob = await exportPackage(chunks, [20, 20, 20], {
      exportAuthorization,
      requireExportAuthorization: true,
      sourceFilename: 'cube.stl',
      sourceGeometry: new THREE.BoxGeometry(20, 20, 20),
    })
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(packageBlob)
    const files = Object.keys(zip.files)

    // Layout: assembly PDF + license at the zip root, parts under parts/, the
    // whole source mesh under original/.
    expect(files).toContain('mesh-splitter-assembly.pdf')
    expect(files).toContain('mesh-splitter-license.json')
    expect(files.some((f) => f.startsWith('parts/') && f.endsWith('.stl'))).toBe(true)
    expect(files).toContain('original/cube.stl')

    const license = JSON.parse(await zip.file('mesh-splitter-license.json').async('string'))
    expect(license).toMatchObject({
      product: 'MALIEV Mesh Splitter',
      exportId: 'export-123',
      receipt: 'ABCDEF1234567890',
      sourceFilename: 'cube.stl',
    })

    const stlName = files.find((f) => f.startsWith('parts/') && f.endsWith('.stl'))
    const stlBytes = await zip.file(stlName).async('uint8array')
    const header = new TextDecoder().decode(stlBytes.slice(0, 80))
    const view = new DataView(stlBytes.buffer, stlBytes.byteOffset, stlBytes.byteLength)
    const triangleCount = view.getUint32(80, true)

    expect(header).toContain('MALIEV Mesh Splitter receipt ABCDEF1234567890')
    expect(stlBytes.byteLength).toBe(84 + triangleCount * 50)
  })

  it('requires export authorization when enforcement is enabled', async () => {
    const chunks = await splitMeshManifold(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20)), [20, 20, 20], [1, 1, 1])

    await expect(exportPackage(chunks, [20, 20, 20], {
      requireExportAuthorization: true,
    })).rejects.toThrow('Export authorization is required')
  })

  it('groups and packs key connectors in exportPackage', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const cleanChunks = await splitMeshManifold(mesh, [100, 100, 100], [2, 1, 1])
    
    const chunks = await addConnectorsManifold(cleanChunks, { type: 'Key', keyWidth: 6, keyHeight: 3.5, depth: 8, clearance: 0.2, perFace: 1 })
    expect(chunks.some(c => c.isKey)).toBe(true)
    const keyChunks = chunks.filter(c => c.isKey)
    expect(keyChunks.length).toBeGreaterThan(0)

    const packageBlob = await exportPackage(chunks, [100, 100, 100], {
      requireExportAuthorization: false,
      sourceFilename: 'cube.stl',
      sourceGeometry: new THREE.BoxGeometry(100, 100, 100),
    })

    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(packageBlob)
    const files = Object.keys(zip.files)

    expect(files).toContain(`parts/Key-${keyChunks.length}pcs.stl`)
    keyChunks.forEach(chunk => {
      expect(files).not.toContain(`parts/part_${String(chunk.index).padStart(2, '0')}_${chunk.label}.stl`)
    })
  })
})
