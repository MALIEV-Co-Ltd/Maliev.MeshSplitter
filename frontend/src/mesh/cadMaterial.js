import * as THREE from 'three'

export function createCadSurfaceMaterial(color, extra = {}) {
  return new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
    flatShading: true,
    ...extra,
  })
}
