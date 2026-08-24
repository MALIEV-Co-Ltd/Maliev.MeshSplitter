import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { analyzeBoundaries } from './boundaryAnalysis'
import { splitMeshAtBoundary } from './boundarySplit'
import { sizeAlignmentPlug } from './alignmentSizing'
import { addConnectorsManifold, isWatertightAuthoritative } from './meshProcessor'

describe('local feature-boundary workflow', () => {
  it('turns a selected color loop into two printable parts and a tapered alignment plug', async () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10, 2, 1, 1).toNonIndexed()
    const position = geometry.attributes.position
    const triangleRegions = new Uint32Array(position.count / 3)
    for (let face = 0; face < triangleRegions.length; face++) {
      const centerX = (position.getX(face * 3) + position.getX(face * 3 + 1) + position.getX(face * 3 + 2)) / 3
      triangleRegions[face] = centerX < 0 ? 0 : 1
    }
    const [candidate] = analyzeBoundaries({ geometry, triangleRegions }, { mode: 'color' })
    const parts = await splitMeshAtBoundary(geometry, candidate)
    const sizing = sizeAlignmentPlug({
      partVolumesMm3: parts.map((part) => part.volume),
      faceAreaMm2: 100,
      localThicknessMm: 5,
      clearance: 0.3,
      requestedCount: 2,
    })

    const assembly = await addConnectorsManifold(parts, {
      type: 'Square Taper', keyWidth: sizing.widthMm, keyHeight: sizing.thicknessMm,
      depth: sizing.depthMm, clearance: sizing.clearanceMm, perFace: sizing.count,
    })

    expect(sizing).toMatchObject({ viable: true, purpose: 'alignment-only', loadBearing: false })
    expect(assembly.filter((chunk) => !chunk.isKey)).toHaveLength(2)
    expect(assembly.filter((chunk) => chunk.isKey)).toHaveLength(1)
    expect(await Promise.all(assembly.map((chunk) => isWatertightAuthoritative(chunk.geometry)))).toEqual([true, true, true])
  })
})
