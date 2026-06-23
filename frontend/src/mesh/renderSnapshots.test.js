import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { calculateSnapshotCameraDistance } from './renderSnapshots'

describe('PDF snapshot camera fitting', () => {
  it('uses the projected bounding sphere instead of max dimension so cube corners stay in frame', () => {
    const box = new THREE.Box3(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50))

    const distance = calculateSnapshotCameraDistance(box, 40, 4 / 3)

    expect(distance).toBeGreaterThan(330)
    expect(distance).toBeLessThan(350)
  })

  it('fits long thin parts with extra margin for oblique viewing angles', () => {
    const box = new THREE.Box3(new THREE.Vector3(-500, -5, -5), new THREE.Vector3(500, 5, 5))

    const distance = calculateSnapshotCameraDistance(box, 40, 4 / 3)

    expect(distance).toBeGreaterThan(1970)
  })
})
