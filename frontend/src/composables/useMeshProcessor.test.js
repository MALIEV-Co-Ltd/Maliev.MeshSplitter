import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

const {
  mockValidateManifold,
  mockComputeVolume,
  mockApplyScale,
  mockRepairMeshGeometry,
  mockSplitMeshManifold,
  mockComputeConnectorPositions,
  mockApplyConnectorsFromManifest,
  mockExportPackage,
  mockExportStl,
  mockExportPdf,
  mockPrepareExportChunks,
  mockStlParse,
} = vi.hoisted(() => ({
  mockValidateManifold: vi.fn(),
  mockComputeVolume: vi.fn(),
  mockApplyScale: vi.fn(),
  mockRepairMeshGeometry: vi.fn(),
  mockSplitMeshManifold: vi.fn(),
  mockComputeConnectorPositions: vi.fn(),
  mockApplyConnectorsFromManifest: vi.fn(),
  mockExportPackage: vi.fn(),
  mockExportStl: vi.fn(),
  mockExportPdf: vi.fn(),
  mockPrepareExportChunks: vi.fn(),
  mockStlParse: vi.fn(),
}))

vi.mock('../mesh/meshProcessor', () => ({
  validateManifold: mockValidateManifold,
  computeVolume: mockComputeVolume,
  applyScale: mockApplyScale,
  repairMeshGeometry: mockRepairMeshGeometry,
  splitMeshManifold: mockSplitMeshManifold,
  addConnectorsManifold: mockApplyConnectorsFromManifest,
  computeConnectorPositions: mockComputeConnectorPositions,
  applyConnectorsFromManifest: mockApplyConnectorsFromManifest,
  exportPackage: mockExportPackage,
  exportStl: mockExportStl,
  exportPdf: mockExportPdf,
  prepareExportChunks: mockPrepareExportChunks,
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

function createTranslatedMockGeometry() {
  const geo = new THREE.BoxGeometry(20, 20, 30).translate(25, -3, 7)
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
      expect(mockValidateManifold).toHaveBeenCalledWith(expect.objectContaining({ type: 'BoxGeometry' }))
      expect(meshInfo.value).toEqual({
        filename: 'test.stl',
        verts: 24,
        faces: 12,
        is_watertight: true,
        was_repaired: false,
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

    it('centers mesh on X/Y and places it on floor', async () => {
      const geometry = createTranslatedMockGeometry()
      mockStlParse.mockReturnValue(geometry)
      mockValidateManifold.mockReturnValue({
        watertight: true,
        volume: 12000,
        euler: 2,
        faceCount: 24,
        vertCount: 48,
      })

      const file = createMockFile('offset.stl')
      const { loadStl, meshInfo } = useMeshProcessor()
      await loadStl(file)

      const { min, max } = meshInfo.value.bounds
      expect(min.z).toBeCloseTo(0, 5)
      expect(((max.x + min.x) / 2)).toBeCloseTo(0, 5)
      expect(((max.y + min.y) / 2)).toBeCloseTo(0, 5)
      expect(max.z).toBeGreaterThan(0)
      expect(min.x).toBeLessThan(0)
      expect(max.x).toBeGreaterThan(0)
    })

    it('stores a reduced preview mesh separately from the full print mesh', async () => {
      const geometry = new THREE.SphereGeometry(25, 48, 24)
      mockStlParse.mockReturnValue(geometry)
      mockValidateManifold.mockReturnValue({
        watertight: true,
        volume: 1000,
        euler: 2,
        faceCount: 2208,
        vertCount: geometry.attributes.position.count,
      })

      const { loadStl, meshGeometry, previewMeshGeometry, previewInfo } = useMeshProcessor({ previewTargetFaces: 120 })
      await loadStl(createMockFile('dense.stl'))

      expect(previewInfo.value.optimized).toBe(true)
      expect(previewMeshGeometry.value).not.toBe(meshGeometry.value)
      expect(previewMeshGeometry.value.attributes.position.count).toBeLessThan(meshGeometry.value.attributes.position.count)
      expect(meshGeometry.value.attributes.position.count).toBe(geometry.attributes.position.count)
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
      mockSplitMeshManifold.mockResolvedValue(rawChunks)

      const file = createMockFile('test.stl')
      const { loadStl, split, chunks, loading, error } = useMeshProcessor()

      await loadStl(file)
      await split([250, 250, 250], [2, 1, 1])

      expect(mockSplitMeshManifold).toHaveBeenCalledOnce()
      expect(chunks.value).toHaveLength(2)
      expect(chunks.value[0].color).toBeDefined()
      expect(chunks.value[1].color).toBeDefined()
      expect(typeof chunks.value[0].color).toBe('number')
      expect(loading.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('splits the full-resolution mesh and creates separate preview chunks', async () => {
      const geometry = new THREE.SphereGeometry(25, 48, 24)
      mockStlParse.mockReturnValue(geometry)
      mockValidateManifold.mockReturnValue({
        watertight: true,
        volume: 1000,
        euler: 2,
        faceCount: 2208,
        vertCount: geometry.attributes.position.count,
      })

      const rawChunks = [
        { index: 0, geometry, label: 'P00', volume: 500, centroid: new THREE.Vector3(0, 0, 0) },
      ]
      mockSplitMeshManifold.mockResolvedValue(rawChunks)

      const { loadStl, split, meshGeometry, chunks, previewChunks } = useMeshProcessor({ previewTargetFaces: 120 })
      await loadStl(createMockFile('dense.stl'))
      await split([250, 250, 250], [1, 1, 1])

      expect(mockSplitMeshManifold.mock.calls[0][0].geometry).toBe(meshGeometry.value)
      expect(chunks.value[0].geometry).toBe(geometry)
      expect(previewChunks.value[0].geometry).not.toBe(chunks.value[0].geometry)
      expect(previewChunks.value[0].geometry.attributes.position.count).toBeLessThan(chunks.value[0].geometry.attributes.position.count)
    })
  })

  describe('applyConnectors', () => {
    it('uses baseline split chunks so connector updates replace prior connectors', async () => {
      const geometry = createMockGeometry()
      mockStlParse.mockReturnValue(geometry)
      mockValidateManifold.mockReturnValue({
        watertight: true, volume: 1000, euler: 2, faceCount: 12, vertCount: 24,
      })
      geometry.userData = { splitSource: 'base' }
      const rawChunks = [
        { index: 0, geometry, label: 'P00', volume: 500, centroid: new THREE.Vector3(0, 0, 0) },
        { index: 1, geometry, label: 'P01', volume: 500, centroid: new THREE.Vector3(0, 0, 0) },
      ]
      const withConnectorA = [
        (() => {
          const geometry = new THREE.BoxGeometry(1, 1, 1)
          geometry.userData = { source: 'connectorA' }
          return { index: 0, geometry, label: 'P00', volume: 250, centroid: new THREE.Vector3(0, 0, 0) }
        })(),
        (() => {
          const geometry = new THREE.BoxGeometry(1, 1, 1)
          geometry.userData = { source: 'connectorA' }
          return { index: 1, geometry, label: 'P01', volume: 250, centroid: new THREE.Vector3(0, 0, 0) }
        })(),
      ]
      const withConnectorB = [
        (() => {
          const geometry = new THREE.BoxGeometry(2, 2, 2)
          geometry.userData = { source: 'connectorB' }
          return { index: 0, geometry, label: 'P00', volume: 250, centroid: new THREE.Vector3(0, 0, 0) }
        })(),
        (() => {
          const geometry = new THREE.BoxGeometry(2, 2, 2)
          geometry.userData = { source: 'connectorB' }
          return { index: 1, geometry, label: 'P01', volume: 250, centroid: new THREE.Vector3(0, 0, 0) }
        })(),
      ]

      mockSplitMeshManifold.mockResolvedValue(rawChunks)
      mockComputeConnectorPositions.mockResolvedValue([{ id: 'conn-0' }])
      mockApplyConnectorsFromManifest
        .mockResolvedValueOnce(withConnectorA)
        .mockResolvedValueOnce(withConnectorB)

      const file = createMockFile('test.stl')
      const { loadStl, split, applyConnectors, chunks, connectorPositions } = useMeshProcessor()
      await loadStl(file)
      await split([250, 250, 250], [2, 1, 1])

      await applyConnectors({ type: 'Dowel', diameter: 5 })
      await applyConnectors({ type: 'Mortise & Tenon', diameter: 6 })

      const firstCallInput = mockApplyConnectorsFromManifest.mock.calls[0][0]
      const secondCallInput = mockApplyConnectorsFromManifest.mock.calls[1][0]

      expect(mockApplyConnectorsFromManifest).toHaveBeenCalledTimes(2)
      expect(firstCallInput[0].geometry.userData).toMatchObject({ splitSource: 'base' })
      expect(firstCallInput[1].geometry.userData).toMatchObject({ splitSource: 'base' })
      expect(secondCallInput[0].geometry.userData).toMatchObject({ splitSource: 'base' })
      expect(secondCallInput[1].geometry.userData).toMatchObject({ splitSource: 'base' })
      expect(chunks.value[0].geometry.userData).toMatchObject({ source: 'connectorB' })
      expect(chunks.value[1].geometry.userData).toMatchObject({ source: 'connectorB' })
      expect(connectorPositions.value).toEqual([{ id: 'conn-0' }])
    })
  })

  describe('setScaleFactor', () => {
    it('regenerates working mesh from the uploaded source geometry', async () => {
      const geometry = createMockGeometry()
      const scaled = new THREE.BoxGeometry(20, 20, 20)
      scaled.computeBoundingBox()
      mockStlParse.mockReturnValue(geometry)
      mockApplyScale.mockReturnValue(scaled)
      mockValidateManifold.mockReturnValue({
        watertight: true, volume: 8000, euler: 2, faceCount: 12, vertCount: 24,
      })

      const { loadStl, setScaleFactor, scaleFactor, meshInfo } = useMeshProcessor()
      await loadStl(createMockFile('test.stl'))
      setScaleFactor(2)

      expect(mockApplyScale).toHaveBeenCalledWith(expect.any(THREE.BufferGeometry), 2)
      expect(scaleFactor.value).toBe(2)
      expect(meshInfo.value.volume).toBe(8000)
    })
  })

  describe('buildExportPackage', () => {
    it('passes source geometry and public URL metadata into package export', async () => {
      const geometry = createMockGeometry()
      mockStlParse.mockReturnValue(geometry)
      mockValidateManifold.mockReturnValue({
        watertight: true, volume: 1000, euler: 2, faceCount: 12, vertCount: 24,
      })
      mockExportPackage.mockResolvedValue(new Blob(['zip']))

      const { loadStl, buildExportPackage, buildVolume, meshGeometry, previewMeshGeometry } = useMeshProcessor({ previewTargetFaces: 6 })
      await loadStl(createMockFile('packet.stl'))
      buildVolume.value = [180, 180, 180]
      const result = await buildExportPackage()

      expect(mockExportPackage).toHaveBeenCalledWith(
        [],
        [180, 180, 180],
        expect.objectContaining({
          appUrl: 'https://shop.maliev.com/tools/mesh-splitter',
          sourceFilename: 'packet.stl',
          sourceGeometry: meshGeometry.value,
        }),
      )
      expect(mockExportPackage.mock.calls[0][2].sourceGeometry).not.toBe(previewMeshGeometry.value)
      expect(result.filename).toBe('packet-mesh-splitter-package.zip')
    })
  })

  describe('clearMesh', () => {
    it('resets state to initial values', async () => {
      const geometry = createMockGeometry()
      mockStlParse.mockReturnValue(geometry)
      mockValidateManifold.mockReturnValue({
        watertight: true, volume: 1000, euler: 2, faceCount: 12, vertCount: 24,
      })
      mockSplitMeshManifold.mockResolvedValue([
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
