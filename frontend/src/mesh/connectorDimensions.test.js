import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { connectorDimensions, fittedConnectorCount, clampConnectorDepth, localWallThicknessAroundFootprint } from './meshProcessor'

function mergeGeometries(geometries) {
  const positions = []
  geometries.forEach((geometry) => {
    const source = geometry.index ? geometry.toNonIndexed() : geometry
    const position = source.attributes.position
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i))
    }
  })
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return merged
}

// The female socket must always be larger than the male peg, or printed parts
// can't be assembled (the male won't enter the hole).
describe('connectorDimensions', () => {
  it('makes the dowel socket wider than the pin', () => {
    const d = connectorDimensions('dowel', { size: 6, thickness: 6, depth: 5, clearance: 0.3 })
    expect(d.shape).toBe('cylinder')
    expect(d.socket.radius).toBeGreaterThan(d.peg.radius)
  })

  it('makes the mortise pocket larger than the tenon on every axis', () => {
    const d = connectorDimensions('mortise-and-tenon', { size: 6, thickness: 4, depth: 5, clearance: 0.3 })
    expect(d.socket.x).toBeGreaterThan(d.peg.x)
    expect(d.socket.y).toBeGreaterThan(d.peg.y)
    expect(d.socket.z).toBeGreaterThan(d.peg.z)
  })

  it('makes the key slot larger than the key — regression for the 20x10 / 0.3 report', () => {
    const d = connectorDimensions('key', { size: 20, thickness: 10, depth: 5, clearance: 0.3 })
    // Pre-fix the peg was 20 * 1.25 = 25 wide while the socket was only 20.6,
    // so the male was wider than the female and nothing fit.
    expect(d.peg.x).toBe(20)
    expect(d.socket.x).toBeCloseTo(20.6, 5)
    expect(d.socket.x).toBeGreaterThan(d.peg.x)
    expect(d.socket.y).toBeGreaterThan(d.peg.y)
  })

  it('keeps the socket larger than the peg even with zero clearance is impossible, so requires positive clearance', () => {
    const d = connectorDimensions('key', { size: 20, thickness: 10, depth: 5, clearance: 0 })
    // With no clearance the socket equals the peg (a press fit, not larger).
    expect(d.socket.x).toBe(d.peg.x)
  })
})

describe('fittedConnectorCount', () => {
  it('reduces the requested count when the face is too small for them', () => {
    // cross 6, clearance 0.3 -> pitch 10.2mm; a 12mm usable face fits only one.
    expect(fittedConnectorCount(2, 12, 6, 0.3)).toBe(1)
  })

  it('keeps the requested count when the face is large enough', () => {
    expect(fittedConnectorCount(2, 40, 6, 0.3)).toBe(2)
  })

  it('never forces more than the face allows and never returns fewer than one', () => {
    expect(fittedConnectorCount(4, 2, 6, 0.3)).toBe(1)
    expect(fittedConnectorCount(2, 1000, 6, 0.3)).toBe(2)
  })
})

describe('clampConnectorDepth', () => {
  it('caps insertion depth at 40% of the local wall thickness', () => {
    expect(clampConnectorDepth(5, 6)).toBeCloseTo(2.4, 5)
  })

  it('keeps the requested depth when the wall is thick enough', () => {
    expect(clampConnectorDepth(5, 100)).toBe(5)
  })

  it('falls back to the requested depth when thickness is unknown', () => {
    expect(clampConnectorDepth(5, Infinity)).toBe(5)
  })
})

// The poke-through bug: connectors appeared on the part's OUTER surface because
// the wall-thickness probe returned Infinity on a raycast miss (treating an
// unmeasurable wall as having unlimited room). It must instead fail safe to 0
// so the connector is skipped, and it must sample the connector's whole
// footprint, not just the single center point.
describe('localWallThicknessAroundFootprint', () => {
  function makeBoxMesh(size) {
    const geometry = new THREE.BoxGeometry(size, size, size)
    geometry.computeBoundingBox()
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    mesh.updateMatrixWorld()
    return { geometry, mesh }
  }

  it('measures the full local wall when the footprint stays on the face', () => {
    const { geometry, mesh } = makeBoxMesh(10)
    const raycaster = new THREE.Raycaster()
    const point = new THREE.Vector3(-5, 0, 0) // center of the -X face
    const thickness = localWallThicknessAroundFootprint(
      raycaster, mesh, geometry.boundingBox, point, 0, [1, 2], -5, 0.01, 1,
    )
    expect(thickness).toBeCloseTo(10, 1)
  })

  it('fails safe to zero when part of the footprint hangs off the body', () => {
    const { geometry, mesh } = makeBoxMesh(10)
    const raycaster = new THREE.Raycaster()
    const point = new THREE.Vector3(-5, 0, 0)
    // footprintRadius 6 pushes the corner samples to ±6mm, past the 10mm box,
    // so those rays miss and the helper must report 0, not Infinity.
    const thickness = localWallThicknessAroundFootprint(
      raycaster, mesh, geometry.boundingBox, point, 0, [1, 2], -5, 0.01, 6,
    )
    expect(thickness).toBe(0)
  })
})
