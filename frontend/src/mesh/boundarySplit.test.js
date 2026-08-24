import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { analyzeBoundaries } from './boundaryAnalysis'
import { splitMeshAtBoundary } from './boundarySplit'
import { computeVolume, isWatertightAuthoritative } from './meshProcessor'

function coloredBox() {
  const geometry = new THREE.BoxGeometry(10, 10, 10, 2, 1, 1).toNonIndexed()
  const position = geometry.attributes.position
  const triangleRegions = new Uint32Array(position.count / 3)
  for (let face = 0; face < triangleRegions.length; face++) {
    const x = (position.getX(face * 3) + position.getX(face * 3 + 1) + position.getX(face * 3 + 2)) / 3
    triangleRegions[face] = x < 0 ? 0 : 1
  }
  return { geometry, triangleRegions }
}

describe('splitMeshAtBoundary', () => {
  it('caps both sides of a selected topology loop as watertight printable solids', async () => {
    const mesh = coloredBox()
    const [candidate] = analyzeBoundaries(mesh, { mode: 'color' })
    const originalPosition = mesh.geometry.attributes.position.array.slice()

    expect(await isWatertightAuthoritative(mesh.geometry)).toBe(true)

    const chunks = await splitMeshAtBoundary(mesh.geometry, candidate)

    expect(chunks).toHaveLength(2)
    expect(await Promise.all(chunks.map((chunk) => isWatertightAuthoritative(chunk.geometry)))).toEqual([true, true])
    expect(chunks.every((chunk) => chunk.splitBoundaryId === candidate.id && chunk.splitMethod === 'topology')).toBe(true)
    expect(chunks.reduce((sum, chunk) => sum + computeVolume(chunk.geometry), 0)).toBeCloseTo(computeVolume(mesh.geometry), 2)
    expect([...mesh.geometry.attributes.position.array]).toEqual([...originalPosition])
  })

  it('rejects an invalid selection without mutating the source geometry', async () => {
    const mesh = coloredBox()
    const originalPosition = mesh.geometry.attributes.position.array.slice()

    await expect(splitMeshAtBoundary(mesh.geometry, {
      id: 'stale', mode: 'color', loops: [], sideFaces: [[0], []], plane: { origin: [0, 0, 0], normal: [0, 1, 0] },
    })).rejects.toThrow('no longer valid')
    expect([...mesh.geometry.attributes.position.array]).toEqual([...originalPosition])
  })
})
