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
        getTextWidth: vi.fn((t) => String(t).length * 1.5),
        path: vi.fn(),
        fill: vi.fn(),
        addImage: vi.fn(),
        addPage: vi.fn(),
        addFileToVFS: vi.fn(),
        addFont: vi.fn(),
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
      exportAuthorization: {
        token: 'signed-export-token',
        exportId: 'export-123',
        fingerprint: 'ABCDEF1234567890',
      },
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
    // Square snapshot aspect: the image is centred in the frame's content box.
    expect(completeImageCall[2]).toBeCloseTo(38.5, 1)
    expect(completeImageCall[3]).toBeCloseTo(116, 1)
    expect(completeImageCall[4]).toBeCloseTo(79, 1)
    expect(completeImageCall[5]).toBeCloseTo(79, 1)
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
    expect(textPayloads).toContain('Receipt ABCDEF1234567890')
    expect(textPayloads).toContain('customer-part.stl')
    expect(textPayloads).not.toContain(`Generated ${'locally'}`)
    expect(textPayloads).not.toContain(`WA${'SM'}`)
    expect(textPayloads).not.toContain(`100% ${'local'}`)
  })

  it('vertically centers each assembly-flow step number on its circle', async () => {
    await exportPdf(makeChunks(), [250, 250, 250], {
      sourceGeometry: new THREE.BoxGeometry(25, 12, 8),
    })
    const pdf = pdfInstances[0]
    const flowCircles = pdf.circle.mock.calls.filter((call) => Math.abs(call[2] - 3.5) < 1e-6)
    expect(flowCircles).toHaveLength(3)
    for (const digit of ['1', '2', '3']) {
      const digitCall = pdf.text.mock.calls.find((call) => call[0] === digit && call[3]?.align === 'center')
      expect(digitCall, `missing centered digit ${digit}`).toBeTruthy()
      expect(digitCall[3]?.baseline).toBe('middle')
      // The digit is anchored on the exact center of one of the flow circles.
      const onCircle = flowCircles.some((c) => Math.abs(c[0] - digitCall[1]) < 1e-6 && Math.abs(c[1] - digitCall[2]) < 1e-6)
      expect(onCircle, `digit ${digit} not on a circle center`).toBe(true)
    }
  })

  it('keeps the print checklist clear of the card bottom border', async () => {
    await exportPdf(makeChunks(), [250, 250, 250], {
      sourceGeometry: new THREE.BoxGeometry(25, 12, 8),
    })
    const pdf = pdfInstances[0]
    // addChecklistCard(pdf, 136, 99, 50, 62) -> bottom border at y = 161.
    const lastItem = pdf.text.mock.calls.find(
      (call) => Array.isArray(call[0]) && call[0][0] === 'Dry-fit parts before using',
    )
    expect(lastItem).toBeTruthy()
    // Baseline plus a line of descent must still sit above the 161mm border.
    expect(lastItem[2] + 3).toBeLessThanOrEqual(161)
  })

  it('vertically centers info-card notes on the info icon', async () => {
    await exportPdf(makeChunks(), [250, 250, 250], {
      sourceGeometry: new THREE.BoxGeometry(25, 12, 8),
    })
    const pdf = pdfInstances[0]
    const iconCircles = pdf.circle.mock.calls.filter((call) => Math.abs(call[2] - 3.4) < 1e-6)
    expect(iconCircles).toHaveLength(2)
    const noteLineA = pdf.text.mock.calls.find((call) => call[0] === 'For multi-part models, exported filenames and labels should')
    const noteLineB = pdf.text.mock.calls.find((call) => call[0] === 'match the assembly order shown in this packet.')
    expect(noteLineA).toBeTruthy()
    expect(noteLineB).toBeTruthy()
    expect(noteLineA[3]?.baseline).toBe('middle')
    // The two note lines straddle the icon center symmetrically.
    const iconCenterY = iconCircles[0][1]
    expect((noteLineA[2] + noteLineB[2]) / 2).toBeCloseTo(iconCenterY, 5)
  })

  it('embeds the NotoSansThai font and renders Thai copy when locale is th', async () => {
    await exportPdf(makeChunks(), [256, 256, 250], {
      sourceFilename: 'persian-cat-500mm.stl',
      locale: 'th',
    })
    const pdf = pdfInstances[0]
    // The Thai font is embedded under both styles so bold never falls back to
    // helvetica (which would render Thai as blank boxes).
    expect(pdf.addFileToVFS).toHaveBeenCalledWith('NotoSansThai.ttf', expect.any(String))
    expect(pdf.addFont).toHaveBeenCalledWith('NotoSansThai.ttf', 'NotoSansThai', 'normal')
    expect(pdf.addFont).toHaveBeenCalledWith('NotoSansThai.ttf', 'NotoSansThai', 'bold')
    expect(pdf.setFont).toHaveBeenCalledWith('NotoSansThai', expect.any(String))

    const textPayloads = pdf.text.mock.calls.flatMap((call) => Array.isArray(call[0]) ? call[0] : [call[0]]).join(' ')
    expect(textPayloads).toContain('คู่มือการประกอบแบบภาพ') // Visual Assembly Guide
    expect(textPayloads).toContain('ไฟล์ต้นฉบับ') // Source file
    // Latin part labels are preserved verbatim.
    expect(textPayloads).toContain('P01-X0Y0Z0')
  })

  it('keeps English copy and the helvetica font when locale is omitted', async () => {
    await exportPdf(makeChunks(), [256, 256, 250], { sourceFilename: 'part.stl' })
    const pdf = pdfInstances[0]
    expect(pdf.addFont).not.toHaveBeenCalled()
    expect(pdf.setFont).toHaveBeenCalledWith('helvetica', expect.any(String))
    const textPayloads = pdf.text.mock.calls.flatMap((call) => Array.isArray(call[0]) ? call[0] : [call[0]]).join(' ')
    expect(textPayloads).toContain('Visual Assembly Guide')
  })
})
