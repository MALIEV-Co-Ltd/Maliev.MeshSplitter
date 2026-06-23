import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCadSurfaceMaterial } from './cadMaterial'

describe('createCadSurfaceMaterial', () => {
  it('uses flat diffuse CAD shading without specular smoothing', () => {
    const material = createCadSurfaceMaterial(0xe74c3c)

    expect(material).toBeInstanceOf(THREE.MeshLambertMaterial)
    expect(material.flatShading).toBe(true)
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
