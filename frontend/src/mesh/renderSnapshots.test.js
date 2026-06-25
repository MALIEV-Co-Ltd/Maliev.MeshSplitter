import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { calculatePerspectiveFitDistance } from './cameraFit'
import { computePartCameraView } from './renderSnapshots'

describe('PDF snapshot camera fitting', () => {
  it('uses the projected bounding sphere instead of max dimension so cube corners stay in frame', () => {
    const box = new THREE.Box3(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50))

    const distance = calculatePerspectiveFitDistance(box, 40, 4 / 3)

    expect(distance).toBeGreaterThan(330)
    expect(distance).toBeLessThan(350)
  })

  it('fits long thin parts with extra margin for oblique viewing angles', () => {
    const box = new THREE.Box3(new THREE.Vector3(-500, -5, -5), new THREE.Vector3(500, 5, 5))

    const distance = calculatePerspectiveFitDistance(box, 40, 4 / 3)

    expect(distance).toBeGreaterThan(1970)
  })
})

describe('assembly-step camera (computePartCameraView)', () => {
  const assemblyBox = new THREE.Box3(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100))
  const assemblyCenter = new THREE.Vector3(0, 0, 0)

  it('views from the part outward side so the body cannot occlude the part', () => {
    // A part jutting out toward +X. The camera must end up further out along +X
    // than the part, with the part between the camera and the body.
    const partCenter = new THREE.Vector3(80, 0, 0)
    const view = computePartCameraView(assemblyBox, partCenter, 15)

    const outward = partCenter.clone().sub(assemblyCenter)
    const cameraToPart = view.position.clone().sub(partCenter)
    expect(cameraToPart.dot(outward)).toBeGreaterThan(0)
    expect(view.position.x).toBeGreaterThan(partCenter.x)
  })

  it('zooms in on a small part instead of framing the whole model', () => {
    const smallPart = computePartCameraView(assemblyBox, new THREE.Vector3(60, 0, 0), 8)
    const wholeModelDistance = calculatePerspectiveFitDistance(assemblyBox, 40, 4 / 3, 1.35)
    // Aiming at the small part sits the camera much closer than framing it all.
    expect(smallPart.distance).toBeLessThan(wholeModelDistance)
    expect(smallPart.distance).toBeGreaterThan(0)
  })

  it('always looks at the part and tilts down for a 3/4 read', () => {
    const partCenter = new THREE.Vector3(0, 0, 90) // directly above the centre
    const view = computePartCameraView(assemblyBox, partCenter, 12)
    expect(view.target.equals(partCenter)).toBe(true)
    // Not a flat top-down: the camera keeps a horizontal offset from the part.
    const horizontal = Math.hypot(view.position.x - partCenter.x, view.position.y - partCenter.y)
    expect(horizontal).toBeGreaterThan(0)
  })
})
