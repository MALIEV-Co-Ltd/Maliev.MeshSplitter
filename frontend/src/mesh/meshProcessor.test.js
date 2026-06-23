import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  addConnectorsManifold,
  applyScale,
  computeVolume,
  exportStl,
  exportPackage,
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

  it('skips connectors when the shared cut face is too close to exterior thin-wall edges', async () => {
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
    expect(result[0].volume).toBeCloseTo(expectedLeftVolume, 2)
    expect(result[1].volume).toBeCloseTo(expectedRightVolume, 2)
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
  it('rejects non-manifold chunks before STL export', async () => {
    const badChunk = {
      index: 0,
      label: 'bad',
      geometry: new THREE.PlaneGeometry(10, 10),
    }

    expect(() => validateExportChunks([badChunk])).toThrow('not manifold')
    await expect(exportStl([badChunk])).rejects.toThrow('not manifold')
  })

  it('exports STL + PDF in a single ZIP package', async () => {
    const chunks = await splitMeshManifold(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20)), [20, 20, 20], [2, 1, 1])
    const packageBlob = await exportPackage(chunks, [20, 20, 20])
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(packageBlob)
    const files = Object.keys(zip.files)

    expect(files.some((f) => f.endsWith('.pdf'))).toBe(true)
    expect(files.some((f) => f.endsWith('.stl'))).toBe(true)
    expect(files.some((f) => f.includes('mesh-splitter-assembly.pdf'))).toBe(true)
  })
})
