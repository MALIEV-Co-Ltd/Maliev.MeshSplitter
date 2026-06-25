import * as THREE from 'three'

export function createCadSurfaceMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    roughness: 0.55,
    metalness: 0.05,
    flatShading: true,
    ...extra,
  })
}
