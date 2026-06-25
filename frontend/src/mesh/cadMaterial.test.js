import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCadSurfaceMaterial } from './cadMaterial'

describe('createCadSurfaceMaterial', () => {
  it('uses smooth CAD shading with a matte PBR finish', () => {
    const material = createCadSurfaceMaterial(0xc0c0c0)

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(material.roughness).toBe(0.55)
    expect(material.metalness).toBe(0.05)
    expect(material.side).toBe(THREE.DoubleSide)
  })

  it('preserves transparency options used for faded non-selected parts', () => {
    const material = createCadSurfaceMaterial(0x9fb8d6, {
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    })

    expect(material.transparent).toBe(true)
    expect(material.opacity).toBe(0.22)
    expect(material.depthWrite).toBe(false)
  })
})
