import * as THREE from 'three'
import { analyzeBoundaries } from './boundaryAnalysis'

self.onmessage = ({ data }) => {
  try {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3))
    if (data.indices) geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))
    const candidates = analyzeBoundaries({ geometry, triangleRegions: data.triangleRegions }, data.options)
    self.postMessage({ revision: data.revision, candidates })
  } catch (error) {
    self.postMessage({ revision: data.revision, error: error.message })
  }
}
