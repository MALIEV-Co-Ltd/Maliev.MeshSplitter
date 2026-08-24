import * as THREE from 'three'
import { computeVolume, isWatertightAuthoritative } from './meshProcessor'

function sourceVertexIndex(geometry, face, offset) {
  return geometry.index ? geometry.index.getX(face * 3 + offset) : face * 3 + offset
}

function pushPoint(target, point) {
  target.push(point.x, point.y, point.z)
}

function capBasis(normal) {
  const helper = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(helper, normal).normalize()
  return { u, v: new THREE.Vector3().crossVectors(normal, u).normalize() }
}

function buildCappedSide(geometry, faceIds, loopCoordinates, plane) {
  if (!faceIds.length || !loopCoordinates.length) throw new Error('The selected boundary is no longer valid for this mesh revision.')
  const source = geometry.attributes.position
  const positions = []
  const centroid = new THREE.Vector3()
  let centroidSamples = 0
  for (const face of faceIds) {
    for (let offset = 0; offset < 3; offset++) {
      const index = sourceVertexIndex(geometry, face, offset)
      const point = new THREE.Vector3(source.getX(index), source.getY(index), source.getZ(index))
      pushPoint(positions, point)
      centroid.add(point)
      centroidSamples += 1
    }
  }
  centroid.multiplyScalar(1 / centroidSamples)

  const origin = new THREE.Vector3().fromArray(plane.origin)
  const normal = new THREE.Vector3().fromArray(plane.normal).normalize()
  if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() < 0.9) throw new Error('The selected boundary has no stable cap plane.')
  const desiredNormal = centroid.clone().sub(origin).dot(normal) < 0 ? normal : normal.clone().negate()
  const points = loopCoordinates.map((coordinates) => new THREE.Vector3().fromArray(coordinates))
  const { u, v } = capBasis(normal)
  const projected = points.map((point) => {
    const relative = point.clone().sub(origin)
    return new THREE.Vector2(relative.dot(u), relative.dot(v))
  })
  const triangles = THREE.ShapeUtils.triangulateShape(projected, [])
  if (triangles.length !== points.length - 2) throw new Error('The selected boundary could not be capped safely.')
  for (const triangle of triangles) {
    const cap = triangle.map((index) => points[index])
    const capNormal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(cap[1], cap[0]),
      new THREE.Vector3().subVectors(cap[2], cap[0]),
    )
    if (capNormal.dot(desiredNormal) < 0) [cap[1], cap[2]] = [cap[2], cap[1]]
    cap.forEach((point) => pushPoint(positions, point))
  }

  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  result.computeVertexNormals()
  result.computeBoundingBox()
  return result
}

export async function splitMeshAtBoundary(geometry, candidate) {
  if (!candidate?.id || candidate.sideFaces?.length !== 2 || candidate.loops?.length !== 1 || candidate.sideFaces.some((side) => !side.length)) {
    throw new Error('The selected boundary is no longer valid for this mesh revision.')
  }
  const generated = []
  try {
    for (let side = 0; side < 2; side++) {
      const capped = buildCappedSide(geometry, candidate.sideFaces[side], candidate.loops[0], candidate.plane)
      if (!await isWatertightAuthoritative(capped)) {
        capped.dispose()
        throw new Error('Boundary split did not produce two watertight parts.')
      }
      generated.push({
        geometry: capped,
        volume: computeVolume(capped),
        centroid: capped.boundingBox.getCenter(new THREE.Vector3()),
        index: side,
        label: `P${String(side + 1).padStart(2, '0')}`,
        connectorCount: 0,
        manifoldStatus: 'NoError',
        splitBoundaryId: candidate.id,
        splitMethod: 'topology',
      })
    }
    return generated
  } catch (error) {
    generated.forEach((chunk) => chunk.geometry.dispose())
    throw error
  }
}
