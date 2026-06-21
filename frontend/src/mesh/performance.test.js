import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { splitMeshManifold, validateExportChunks } from './meshProcessor'

describe('mesh performance budget', () => {
  it('splits a basic 2x2x1 model fast enough for interactive customer use', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const started = performance.now()
    const chunks = await splitMeshManifold(mesh, [100, 100, 100], [2, 2, 1])
    const durationMs = performance.now() - started

    validateExportChunks(chunks)
    expect(chunks).toHaveLength(4)
    expect(durationMs).toBeLessThan(3000)
  })
})
