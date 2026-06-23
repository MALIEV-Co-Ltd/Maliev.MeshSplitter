import * as THREE from 'three'

export const DEFAULT_CAMERA_FIT_MARGIN = 1.35

export function calculatePerspectiveFitDistance(box, fovDegrees, aspect, margin = DEFAULT_CAMERA_FIT_MARGIN) {
  if (!box || box.isEmpty()) return 0
  const sphere = new THREE.Sphere()
  box.getBoundingSphere(sphere)
  const radius = Math.max(sphere.radius, 1)
  const verticalFov = THREE.MathUtils.degToRad(fovDegrees)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect)
  const fitFov = Math.max(0.01, Math.min(verticalFov, horizontalFov))
  return (radius / Math.sin(fitFov / 2)) * margin
}
