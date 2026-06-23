import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  createPreviewGeometry,
  getGeometryFaceCount,
  resolvePreviewPixelRatio,
} from './previewGeometry'

describe('previewGeometry', () => {
  it('creates a decimated preview mesh without modifying the print mesh', () => {
    const source = new THREE.SphereGeometry(40, 64, 32)
    const originalFaces = getGeometryFaceCount(source)
    const originalVertices = source.attributes.position.count

    const result = createPreviewGeometry(source, { targetFaces: 180 })

    expect(result.optimized).toBe(true)
    expect(result.originalFaces).toBe(originalFaces)
    expect(result.previewFaces).toBeLessThanOrEqual(180)
    expect(result.geometry).not.toBe(source)
    expect(source.attributes.position.count).toBe(originalVertices)
    expect(getGeometryFaceCount(source)).toBe(originalFaces)
    expect(result.geometry.userData.preview.optimized).toBe(true)
  })

  it('keeps small preview meshes full detail while isolating them from export geometry', () => {
    const source = new THREE.BoxGeometry(10, 10, 10)
    const result = createPreviewGeometry(source, { targetFaces: 1000 })

    expect(result.optimized).toBe(false)
    expect(result.previewFaces).toBe(result.originalFaces)
    expect(result.geometry).not.toBe(source)
  })

  it('caps render pixel ratio for optimized large-model previews', () => {
    expect(resolvePreviewPixelRatio({ optimized: true, devicePixelRatio: 3 })).toBe(1)
    expect(resolvePreviewPixelRatio({ optimized: false, devicePixelRatio: 3 })).toBe(1.5)
    expect(resolvePreviewPixelRatio({ optimized: false, devicePixelRatio: 1 })).toBe(1)
  })
})
