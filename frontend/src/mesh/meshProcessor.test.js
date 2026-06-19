import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { validateManifold, computeVolume, splitMesh, addConnectors } from './meshProcessor'

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

describe('splitMesh', () => {
  it('splits a 100x100x100 box into 4 chunks (2x2x1)', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = splitMesh(mesh, [100, 100, 100], [2, 2, 1])
    expect(chunks).toHaveLength(4)
  })

  it('each chunk has valid geometry with position count > 0', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = splitMesh(mesh, [100, 100, 100], [2, 2, 1])
    chunks.forEach(chunk => {
      expect(chunk.geometry.attributes.position.count).toBeGreaterThan(0)
    })
  })

  it('each chunk has valid volume after split', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = splitMesh(mesh, [100, 100, 100], [2, 2, 1])
    const totalVolume = chunks.reduce((s, c) => s + c.volume, 0)
    expect(totalVolume).toBeCloseTo(1000000, -4)
    chunks.forEach(chunk => {
      expect(chunk.volume).toBeGreaterThan(0)
      expect(chunk.geometry.attributes.position.count).toBeGreaterThan(0)
    })
  })

  it('returns empty for zero divisions', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = splitMesh(mesh, [100, 100, 100], [0, 0, 0])
    expect(chunks).toHaveLength(0)
  })
})

describe('addConnectors', () => {
  it('adds dowel connectors between adjacent chunks', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const origChunks = splitMesh(mesh, [100, 100, 100], [2, 1, 1])
    const originalCounts = origChunks.map(c => c.geometry.attributes.position.count)
    const config = { type: 'dowel', diameter: 5, depth: 10, clearance: 0.2, perFace: 2 }
    const result = addConnectors(origChunks, config)
    expect(result).toHaveLength(2)
    const newCounts = result.map(c => c.geometry.attributes.position.count)
    const changed = newCounts.some((count, i) => count !== originalCounts[i])
    expect(changed).toBe(true)
  })

  it('chunks remain structurally valid after connector addition', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const chunks = splitMesh(mesh, [100, 100, 100], [2, 1, 1])
    const config = { type: 'dowel', diameter: 5, depth: 10, clearance: 0.2, perFace: 2 }
    const result = addConnectors(chunks, config)
    result.forEach((chunk, i) => {
      const info = validateManifold(chunk.geometry)
      expect(info.vertCount).toBeGreaterThan(0)
      expect(info.faceCount).toBeGreaterThan(0)
    })
  })
})
