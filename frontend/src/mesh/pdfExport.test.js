import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

const {
  pdfInstances,
  mockRenderWholeMesh,
  mockRenderAssembly,
  mockRenderPartInContext,
  mockRenderPartIsolated,
  mockRenderAssemblyStep,
  mockDisposeSnapshotRenderer,
  mockQrToDataUrl,
} = vi.hoisted(() => {
  const pdfInstances = []
  return {
    pdfInstances,
    mockRenderWholeMesh: vi.fn(() => 'data:image/png;base64,complete'),
    mockRenderAssembly: vi.fn((chunks, options) => options?.labels
      ? 'data:image/png;base64,labeled'
      : 'data:image/png;base64,assembly'),
    mockRenderPartInContext: vi.fn((chunks, index) => `data:image/png;base64,context-${index}`),
    mockRenderPartIsolated: vi.fn((chunk) => `data:image/png;base64,isolated-${chunk.index}`),
    mockRenderAssemblyStep: vi.fn((chunks, index) => `data:image/png;base64,step-${index}`),
    mockDisposeSnapshotRenderer: vi.fn(),
    mockQrToDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,qr')),
  }
})

vi.mock('qrcode', () => ({
  default: {
    toDataURL: mockQrToDataUrl,
  },
}))

vi.mock('./renderSnapshots', () => ({
  renderWholeMesh: mockRenderWholeMesh,
  renderAssembly: mockRenderAssembly,
  renderPartInContext: mockRenderPartInContext,
  renderPartIsolated: mockRenderPartIsolated,
  renderAssemblyStep: mockRenderAssemblyStep,
  disposeSnapshotRenderer: mockDisposeSnapshotRenderer,
}))

vi.mock('jspdf', () => {
  return {
    jsPDF: vi.fn(() => {
      const instance = {
        setFont: vi.fn(),
        setFontSize: vi.fn(),
        setTextColor: vi.fn(),
        setFillColor: vi.fn(),
        setDrawColor: vi.fn(),
        rect: vi.fn(),
        roundedRect: vi.fn(),
        circle: vi.fn(),
        line: vi.fn(),
        text: vi.fn(),
        path: vi.fn(),
        fill: vi.fn(),
        addImage: vi.fn(),
        addPage: vi.fn(),
        output: vi.fn(() => new ArrayBuffer(16)),
      }
      pdfInstances.push(instance)
      return instance
    }),
  }
})

import { exportPdf } from './meshProcessor'

function makeChunks() {
  return [
    {
      index: 0,
      assemblyOrder: 1,
      label: 'P01-X0Y0Z0',
      geometry: new THREE.BoxGeometry(10, 10, 10),
      volume: 1000,
      color: 0xe74c3c,
      centroid: new THREE.Vector3(-5, 0, 0),
    },
    {
      index: 1,
      assemblyOrder: 2,
      label: 'P02-X1Y0Z0',
      geometry: new THREE.BoxGeometry(10, 10, 10).translate(12, 0, 0),
      volume: 1000,
      color: 0x3498db,
      centroid: new THREE.Vector3(7, 0, 0),
    },
  ]
}

describe('exportPdf', () => {
  beforeEach(() => {
    pdfInstances.length = 0
    vi.clearAllMocks()
  })

  it('creates a MALIEV branded visual assembly packet with QR and part images', async () => {
    const sourceGeometry = new THREE.BoxGeometry(25, 12, 8)
    const chunks = makeChunks()

    const bytes = await exportPdf(chunks, [250, 250, 250], {
      appUrl: 'https://shop.maliev.com/tools/mesh-splitter',
      sourceFilename: 'customer-part.stl',
      sourceGeometry,
    })

    const pdf = pdfInstances[0]
    const imagePayloads = pdf.addImage.mock.calls.map((call) => call[0])
    const textPayloads = pdf.text.mock.calls.flatMap((call) => Array.isArray(call[0]) ? call[0] : [call[0]]).join(' ')
    const completeImageCall = pdf.addImage.mock.calls.find((call) => call[0] === 'data:image/png;base64,complete')

    expect(bytes.byteLength).toBe(16)
    expect(mockQrToDataUrl).toHaveBeenCalledWith('https://shop.maliev.com/tools/mesh-splitter', expect.any(Object))
    expect(mockRenderWholeMesh).toHaveBeenCalledWith(sourceGeometry)
    expect(mockRenderAssembly).toHaveBeenCalledWith(chunks, { labels: true })
    expect(mockRenderPartInContext).toHaveBeenCalledTimes(2)
    expect(mockRenderPartIsolated).toHaveBeenCalledTimes(2)
    expect(mockRenderAssemblyStep).toHaveBeenCalledTimes(2)
    expect(mockDisposeSnapshotRenderer).toHaveBeenCalled()

    expect(pdf.path).toHaveBeenCalled()
    expect(pdf.fill).toHaveBeenCalled()
    const logoPath = pdf.path.mock.calls[0][0]
    expect(logoPath.some((command) => command.op === 'm')).toBe(true)
    expect(logoPath.some((command) => command.op === 'l')).toBe(true)
    expect(logoPath.some((command) => command.op === 'h')).toBe(true)
    expect(imagePayloads).toContain('data:image/png;base64,qr')
    expect(imagePayloads).toContain('data:image/png;base64,complete')
    expect(imagePayloads).toContain('data:image/png;base64,labeled')
    expect(imagePayloads).toContain('data:image/png;base64,context-0')
    expect(imagePayloads).toContain('data:image/png;base64,isolated-0')
    expect(imagePayloads).toContain('data:image/png;base64,step-0')
    expect(completeImageCall[2]).toBeCloseTo(29, 1)
    expect(completeImageCall[3]).toBeCloseTo(118.75, 1)
    expect(completeImageCall[4]).toBeCloseTo(98, 1)
    expect(completeImageCall[5]).toBeCloseTo(73.5, 1)
    expect(pdf.circle).toHaveBeenCalled()
    expect(textPayloads).toContain('MALIEV')
    expect(textPayloads).toContain('PRINT-READY MESH PACKAGE')
    expect(textPayloads).toContain('Mesh Splitter Assembly Packet')
    expect(textPayloads).toContain('Print checklist')
    expect(textPayloads).toContain('Assembly flow')
    expect(textPayloads).toContain('Package contents')
    expect(textPayloads).toContain('Important note')
    expect(textPayloads).toContain('Units')
    expect(textPayloads).toContain('mm')
    expect(textPayloads).toContain('Generated by MALIEV Mesh Splitter')
    expect(textPayloads).toContain('customer-part.stl')
  })
})
