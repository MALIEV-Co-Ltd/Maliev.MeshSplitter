import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

const { mockValidateManifold, mockComputeVolume, mockSplitMesh, mockAddConnectors, mockExportStl, mockExportPdf, mockStlParse } = vi.hoisted(() => ({
  mockValidateManifold: vi.fn(),
  mockComputeVolume: vi.fn(),
  mockSplitMesh: vi.fn(),
  mockAddConnectors: vi.fn(),
  mockExportStl: vi.fn(),
  mockExportPdf: vi.fn(),
  mockStlParse: vi.fn(),
}))

vi.mock('../mesh/meshProcessor', () => ({
  validateManifold: mockValidateManifold,
  computeVolume: mockComputeVolume,
  splitMesh: mockSplitMesh,
  addConnectors: mockAddConnectors,
  exportStl: mockExportStl,
  exportPdf: mockExportPdf,
}))

vi.mock('three/addons/loaders/STLLoader.js', () => ({
  STLLoader: vi.fn(() => ({
    parse: mockStlParse,
  })),
}))

import { useMeshProcessor } from './useMeshProcessor'

function createMockGeometry() {
  const geo = new THREE.BoxGeometry(10, 10, 10)
  geo.computeBoundingBox()
  return geo
}

function createMockFile(name, content = 'stl data') {
  const file = new File([content], name, { type: 'application/sla' })
  file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8))
  return file
}

describe('useMeshProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadStl', () => {
    it('parses file and sets meshInfo', async () => {
      const geometry = createMockGeometry()
      mockStlParse.mockReturnValue(geometry)
      mockValidateManifold.mockReturnValue({
        watertight: true,
        volume: 1000,
        euler: 2,
        faceCount: 12,
        vertCount: 24,
      })

      const file = createMockFile('test.stl')
      const { loadStl, meshInfo, loading, error } = useMeshProcessor()

      const result = await loadStl(file)

      expect(mockStlParse).toHaveBeenCalledWith(expect.any(ArrayBuffer))
      expect(mockValidateManifold).toHaveBeenCalledWith(geometry)
      expect(meshInfo.value).toEqual({
        filename: 'test.stl',
        verts: 24,
        faces: 12,
        is_watertight: true,
        volume: 1000,
        bounds: {
          min: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) },
          max: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) },
        },
      })
      expect(result).toStrictEqual(meshInfo.value)
      expect(loading.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('sets error on parse failure', async () => {
      mockStlParse.mockImplementation(() => { throw new Error('Invalid STL') })

      const file = createMockFile('bad.stl')
      const { loadStl, error, loading } = useMeshProcessor()

      await expect(loadStl(file)).rejects.toThrow('Invalid STL')
      expect(error.value).toBe('Invalid STL')
      expect(loading.value).toBe(false)
    })
  })

  describe('split', () => {
    it('creates chunks with colors', async () => {
      const geometry = createMockGeometry()
      mockStlParse.mockReturnValue(geometry)
      mockValidateManifold.mockReturnValue({
        watertight: true, volume: 1000, euler: 2, faceCount: 12, vertCount: 24,
      })

      const rawChunks = [
        { index: 0, geometry, label: 'X0Y0Z0', volume: 500, centroid: new THREE.Vector3(0, 0, 0) },
        { index: 1, geometry, label: 'X1Y0Z0', volume: 500, centroid: new THREE.Vector3(0, 0, 0) },
      ]
      mockSplitMesh.mockReturnValue(rawChunks)

      const file = createMockFile('test.stl')
      const { loadStl, split, chunks, loading, error } = useMeshProcessor()

      await loadStl(file)
      await split([250, 250, 250], [2, 1, 1])

      expect(mockSplitMesh).toHaveBeenCalledOnce()
      expect(chunks.value).toHaveLength(2)
      expect(chunks.value[0].color).toBeDefined()
      expect(chunks.value[1].color).toBeDefined()
      expect(typeof chunks.value[0].color).toBe('number')
      expect(loading.value).toBe(false)
      expect(error.value).toBeNull()
    })
  })

  describe('clearMesh', () => {
    it('resets state to initial values', async () => {
      const geometry = createMockGeometry()
      mockStlParse.mockReturnValue(geometry)
      mockValidateManifold.mockReturnValue({
        watertight: true, volume: 1000, euler: 2, faceCount: 12, vertCount: 24,
      })
      mockSplitMesh.mockReturnValue([
        { index: 0, geometry, label: 'X0Y0Z0', volume: 500, centroid: new THREE.Vector3() },
      ])

      const { loadStl, split, clearMesh, meshInfo, chunks, error } = useMeshProcessor()
      const file = createMockFile('test.stl')
      await loadStl(file)
      await split([250, 250, 250], [2, 1, 1])

      expect(meshInfo.value).not.toBeNull()
      expect(chunks.value.length).toBeGreaterThan(0)

      clearMesh()

      expect(meshInfo.value).toBeNull()
      expect(chunks.value).toEqual([])
      expect(error.value).toBeNull()
    })
  })
})
