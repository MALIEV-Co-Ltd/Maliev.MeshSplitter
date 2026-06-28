import * as THREE from 'three'

// Voxel remesh: rebuild a clean, watertight, 2-manifold surface from a broken
// (non-manifold / self-intersecting) triangle soup. This is the robust repair
// that BambuStudio / 3D-Builder use, and the only thing that survives meshes a
// CSG kernel can't interpret — e.g. a bolt whose head, flange and shaft are
// modeled as overlapping solids sharing a zero-thickness interface.
//
// Pipeline:
//   1. Generalized Winding Number (Jacobson et al.) gives a robust inside/outside
//      classification that is well-defined even for non-manifold input. It's
//      accelerated with a Barnes-Hut BVH (Barill et al. "Fast Winding Numbers"):
//      a far cluster of triangles is approximated by its aggregate dipole, so a
//      query costs O(log n) instead of O(n).
//   2. A signed distance field = sign(winding) x distance-to-nearest-surface,
//      which gives a tight, smoothly-interpolating field (far better marching-
//      cubes output than the raw step-shaped winding number).
//   3. Manifold.levelSet() runs marching cubes on that field, producing a clean
//      watertight manifold by construction.

const LEAF_SIZE = 8
const BARNES_HUT_BETA = 2.0
const INV_4PI = 1 / (4 * Math.PI)

// Build the winding-number + nearest-distance accelerator over a triangle soup.
// Returns { winding(x,y,z), closestDistSq(x,y,z), triCount }.
export function buildWindingField(geometry) {
  const pos = geometry.attributes.position
  const index = geometry.index ? geometry.index.array : null
  const triCount = index ? index.length / 3 : pos.count / 3

  const verts = new Float64Array(triCount * 9)
  const cx = new Float64Array(triCount), cy = new Float64Array(triCount), cz = new Float64Array(triCount)
  const anx = new Float64Array(triCount), any_ = new Float64Array(triCount), anz = new Float64Array(triCount)
  for (let f = 0; f < triCount; f++) {
    const i0 = index ? index[f * 3] : f * 3
    const i1 = index ? index[f * 3 + 1] : f * 3 + 1
    const i2 = index ? index[f * 3 + 2] : f * 3 + 2
    const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0)
    const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1)
    const ccx = pos.getX(i2), ccy = pos.getY(i2), ccz = pos.getZ(i2)
    verts[f * 9] = ax; verts[f * 9 + 1] = ay; verts[f * 9 + 2] = az
    verts[f * 9 + 3] = bx; verts[f * 9 + 4] = by; verts[f * 9 + 5] = bz
    verts[f * 9 + 6] = ccx; verts[f * 9 + 7] = ccy; verts[f * 9 + 8] = ccz
    cx[f] = (ax + bx + ccx) / 3; cy[f] = (ay + by + ccy) / 3; cz[f] = (az + bz + ccz) / 3
    // area-weighted normal = 0.5 (b-a) x (c-a)
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = ccx - ax, vy = ccy - ay, vz = ccz - az
    anx[f] = 0.5 * (uy * vz - uz * vy)
    any_[f] = 0.5 * (uz * vx - ux * vz)
    anz[f] = 0.5 * (ux * vy - uy * vx)
  }

  const order = new Int32Array(triCount)
  for (let i = 0; i < triCount; i++) order[i] = i

  const nodes = []
  function build(start, end) {
    let sumA = 0, px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0
    let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity
    for (let i = start; i < end; i++) {
      const f = order[i]
      const a = Math.hypot(anx[f], any_[f], anz[f])
      sumA += a; px += cx[f] * a; py += cy[f] * a; pz += cz[f] * a
      nx += anx[f]; ny += any_[f]; nz += anz[f]
      for (let k = 0; k < 3; k++) {
        const vx = verts[f * 9 + k * 3], vy = verts[f * 9 + k * 3 + 1], vz = verts[f * 9 + k * 3 + 2]
        if (vx < minx) minx = vx; if (vy < miny) miny = vy; if (vz < minz) minz = vz
        if (vx > maxx) maxx = vx; if (vy > maxy) maxy = vy; if (vz > maxz) maxz = vz
      }
    }
    if (sumA > 0) { px /= sumA; py /= sumA; pz /= sumA }
    let maxR = 0
    for (let i = start; i < end; i++) {
      const f = order[i]
      for (let k = 0; k < 3; k++) {
        const dx = verts[f * 9 + k * 3] - px, dy = verts[f * 9 + k * 3 + 1] - py, dz = verts[f * 9 + k * 3 + 2] - pz
        const r = dx * dx + dy * dy + dz * dz
        if (r > maxR) maxR = r
      }
    }
    maxR = Math.sqrt(maxR)
    const node = { px, py, pz, nx, ny, nz, maxR, minx, miny, minz, maxx, maxy, maxz, start, end, left: -1, right: -1 }
    const id = nodes.length
    nodes.push(node)
    if (end - start <= LEAF_SIZE) return id
    const ex = maxx - minx, ey = maxy - miny, ez = maxz - minz
    const axis = ex >= ey && ex >= ez ? 0 : (ey >= ez ? 1 : 2)
    const ca = axis === 0 ? cx : axis === 1 ? cy : cz
    const mid = (start + end) >> 1
    const slice = Array.from(order.subarray(start, end)).sort((p, q) => ca[p] - ca[q])
    for (let i = start; i < end; i++) order[i] = slice[i - start]
    node.left = build(start, mid)
    node.right = build(mid, end)
    return id
  }
  const root = build(0, triCount)

  function exactSolidAngle(f, qx, qy, qz) {
    const aX = verts[f * 9] - qx, aY = verts[f * 9 + 1] - qy, aZ = verts[f * 9 + 2] - qz
    const bX = verts[f * 9 + 3] - qx, bY = verts[f * 9 + 4] - qy, bZ = verts[f * 9 + 5] - qz
    const cX = verts[f * 9 + 6] - qx, cY = verts[f * 9 + 7] - qy, cZ = verts[f * 9 + 8] - qz
    const la = Math.sqrt(aX * aX + aY * aY + aZ * aZ)
    const lb = Math.sqrt(bX * bX + bY * bY + bZ * bZ)
    const lc = Math.sqrt(cX * cX + cY * cY + cZ * cZ)
    const det = aX * (bY * cZ - bZ * cY) - aY * (bX * cZ - bZ * cX) + aZ * (bX * cY - bY * cX)
    const denom = la * lb * lc
      + (aX * bX + aY * bY + aZ * bZ) * lc
      + (bX * cX + bY * cY + bZ * cZ) * la
      + (cX * aX + cY * aY + cZ * aZ) * lb
    return 2 * Math.atan2(det, denom)
  }

  const wstack = new Int32Array(512)
  function winding(qx, qy, qz) {
    let sum = 0, sp = 0
    wstack[sp++] = root
    while (sp > 0) {
      const nd = nodes[wstack[--sp]]
      const dx = qx - nd.px, dy = qy - nd.py, dz = qz - nd.pz
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > BARNES_HUT_BETA * nd.maxR && dist > 1e-9) {
        // dipole far-field: w ~= (1/4pi) N . (c - q) / |c - q|^3
        const inv = 1 / (dist * dist * dist)
        sum -= (nd.nx * dx + nd.ny * dy + nd.nz * dz) * inv
      } else if (nd.left < 0) {
        for (let i = nd.start; i < nd.end; i++) sum += exactSolidAngle(order[i], qx, qy, qz)
      } else {
        wstack[sp++] = nd.left; wstack[sp++] = nd.right
      }
    }
    return sum * INV_4PI
  }

  // squared distance from q to triangle f (Ericson, Real-Time Collision Detection)
  function distSqTri(f, qx, qy, qz) {
    const ax = verts[f * 9], ay = verts[f * 9 + 1], az = verts[f * 9 + 2]
    const bx = verts[f * 9 + 3], by = verts[f * 9 + 4], bz = verts[f * 9 + 5]
    const ccx = verts[f * 9 + 6], ccy = verts[f * 9 + 7], ccz = verts[f * 9 + 8]
    const abx = bx - ax, aby = by - ay, abz = bz - az
    const acx = ccx - ax, acy = ccy - ay, acz = ccz - az
    const apx = qx - ax, apy = qy - ay, apz = qz - az
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz
    if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz
    const bpx = qx - bx, bpy = qy - by, bpz = qz - bz
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz
    if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz
    const vc = d1 * d4 - d3 * d2
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); const ex = ax + abx * v - qx, ey = ay + aby * v - qy, ez = az + abz * v - qz; return ex * ex + ey * ey + ez * ez }
    const cpx = qx - ccx, cpy = qy - ccy, cpz = qz - ccz
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz
    if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz
    const vb = d5 * d2 - d1 * d6
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); const ex = ax + acx * w - qx, ey = ay + acy * w - qy, ez = az + acz * w - qz; return ex * ex + ey * ey + ez * ez }
    const va = d3 * d6 - d5 * d4
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); const ex = bx + (ccx - bx) * w - qx, ey = by + (ccy - by) * w - qy, ez = bz + (ccz - bz) * w - qz; return ex * ex + ey * ey + ez * ez }
    const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom
    const ex = ax + abx * v + acx * w - qx, ey = ay + aby * v + acy * w - qy, ez = az + abz * v + acz * w - qz
    return ex * ex + ey * ey + ez * ez
  }

  function aabbDistSq(nd, qx, qy, qz) {
    let dx = 0, dy = 0, dz = 0
    if (qx < nd.minx) dx = nd.minx - qx; else if (qx > nd.maxx) dx = qx - nd.maxx
    if (qy < nd.miny) dy = nd.miny - qy; else if (qy > nd.maxy) dy = qy - nd.maxy
    if (qz < nd.minz) dz = nd.minz - qz; else if (qz > nd.maxz) dz = qz - nd.maxz
    return dx * dx + dy * dy + dz * dz
  }

  const dstack = new Int32Array(512)
  function closestDistSq(qx, qy, qz) {
    let best = Infinity, sp = 0
    dstack[sp++] = root
    while (sp > 0) {
      const nd = nodes[dstack[--sp]]
      if (aabbDistSq(nd, qx, qy, qz) >= best) continue
      if (nd.left < 0) {
        for (let i = nd.start; i < nd.end; i++) { const d = distSqTri(order[i], qx, qy, qz); if (d < best) best = d }
      } else {
        const l = nodes[nd.left], r = nodes[nd.right]
        if (aabbDistSq(l, qx, qy, qz) < aabbDistSq(r, qx, qy, qz)) { dstack[sp++] = nd.right; dstack[sp++] = nd.left }
        else { dstack[sp++] = nd.left; dstack[sp++] = nd.right }
      }
    }
    return best
  }

  return { winding, closestDistSq, triCount }
}

// Pick a voxel edge length scaled to the model's size. This is the resolution
// for an explicit, OPT-IN last-resort repair (see attemptVoxelRepair) that the
// caller already accepted may take a while and shows live progress for — so
// it targets visibly fine output over raw speed, not a fixed time budget. The
// repair flow is also non-dismissable when basic repair fails: the user has
// no faster way out, so it's worth spending the extra time for real quality.
//
// Empirically calibrated against a real 185x185x300mm bolt (diagonal ~398mm),
// measured directly (not extrapolated): edge=2mm -> 121s/181k tris,
// edge=1.5mm -> 334s/321k tris, edge=1mm -> 1169s/717k tris. The cost grows
// roughly with the cube of 1/edgeLength (grid cell count), so small increases
// in detail cost much more time. 1.5mm is the quality tier: nearly double the
// triangle density of 2mm (meaningfully better capture of thread/socket
// detail) while staying in the neighborhood of minutes, not tens of minutes.
export function adaptiveEdgeLength(geometry) {
  geometry.computeBoundingBox()
  const size = new THREE.Vector3()
  geometry.boundingBox.getSize(size)
  const diag = Math.max(1e-6, size.length())

  const edge = diag * 0.00375
  const minEdge = 0.4
  const maxEdge = Math.max(minEdge, diag * 0.03)
  return Math.min(maxEdge, Math.max(minEdge, edge))
}

function manifoldMeshToGeometry(mesh) {
  const positions = new Float32Array(mesh.numVert * 3)
  for (let i = 0; i < mesh.numVert; i++) {
    positions[i * 3] = mesh.vertProperties[i * mesh.numProp]
    positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1]
    positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2]
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1))
  geometry.computeBoundingBox()
  geometry.computeVertexNormals()
  return geometry
}

// Rebuild geometry into a clean watertight manifold. `manifold` is the loaded
// manifold-3d module. `onProgress` (0..1) is reported as the level-set samples
// the grid. Returns a THREE.BufferGeometry, or null if the remesh produced
// nothing usable.
export function voxelRemeshGeometry(geometry, manifold, options = {}) {
  const { winding, closestDistSq } = buildWindingField(geometry)
  const edgeLength = Number(options.edgeLength) > 0
    ? Number(options.edgeLength)
    : adaptiveEdgeLength(geometry)

  geometry.computeBoundingBox()
  const bb = geometry.boundingBox
  const pad = edgeLength * 2
  const bounds = {
    min: [bb.min.x - pad, bb.min.y - pad, bb.min.z - pad],
    max: [bb.max.x + pad, bb.max.y + pad, bb.max.z + pad],
  }

  // Estimate total samples only to drive the progress callback (level-set walks
  // a doubled grid, ~2 samples per cell).
  const span = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]]
  const estimatedSamples = Math.max(1, (span[0] / edgeLength) * (span[1] / edgeLength) * (span[2] / edgeLength) * 2)
  let samples = 0
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null

  const sdf = (p) => {
    if (onProgress) {
      samples++
      if ((samples & 0x3fff) === 0) onProgress(Math.min(0.99, samples / estimatedSamples))
    }
    const inside = winding(p[0], p[1], p[2]) > 0.5
    const d = Math.sqrt(closestDistSq(p[0], p[1], p[2]))
    return inside ? d : -d
  }

  const solid = manifold.Manifold.levelSet(sdf, bounds, edgeLength)
  try {
    if (solid.status() !== 'NoError' || solid.isEmpty()) return null
    const result = manifoldMeshToGeometry(solid.getMesh())
    if (onProgress) onProgress(1)
    return result
  } finally {
    solid.delete?.()
  }
}
