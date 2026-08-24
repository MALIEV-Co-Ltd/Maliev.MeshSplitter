import * as THREE from 'three'

export const MAX_BOUNDARY_ANALYSIS_TRIANGLES = 1_500_000

export function assertBoundaryAnalysisBudget(faceCount, requestedLimit = MAX_BOUNDARY_ANALYSIS_TRIANGLES) {
  const maxAnalysisFaces = Math.min(MAX_BOUNDARY_ANALYSIS_TRIANGLES, Math.max(10_000, Number(requestedLimit)))
  if (faceCount > maxAnalysisFaces) throw new Error(`Boundary analysis supports up to ${maxAnalysisFaces.toLocaleString()} triangles. Simplify this ${Math.round(faceCount).toLocaleString()}-triangle mesh before feature analysis.`)
  return faceCount
}

const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`

function compactSignature(keys) {
  let hash = 2166136261
  for (const key of keys) for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}

function radixPass(order, output, values, shift, signed = false) {
  const counts = new Uint32Array(65536)
  for (let i = 0; i < order.length; i++) {
    const value = signed ? (values[order[i]] ^ -2147483648) : values[order[i]]
    counts[(value >>> shift) & 0xffff]++
  }
  let offset = 0
  for (let i = 0; i < counts.length; i++) { const count = counts[i]; counts[i] = offset; offset += count }
  for (let i = 0; i < order.length; i++) {
    const index = order[i]
    const value = signed ? (values[index] ^ -2147483648) : values[index]
    output[counts[(value >>> shift) & 0xffff]++] = index
  }
}

function radixSort(order, fields) {
  let source = order
  let target = new Uint32Array(order.length)
  for (const { values, signed = false } of fields) for (const shift of [0, 16]) {
    radixPass(source, target, values, shift, signed)
    const swap = source; source = target; target = swap
  }
  return source
}

function weldVertices(position, tolerance) {
  const count = position.count
  const qx = new Int32Array(count), qy = new Int32Array(count), qz = new Int32Array(count)
  const order = new Uint32Array(count)
  for (let i = 0; i < count; i++) {
    qx[i] = Math.round(position.getX(i) / tolerance)
    qy[i] = Math.round(position.getY(i) / tolerance)
    qz[i] = Math.round(position.getZ(i) / tolerance)
    order[i] = i
  }
  const sorted = radixSort(order, [{ values: qz, signed: true }, { values: qy, signed: true }, { values: qx, signed: true }])
  const sourceToWelded = new Uint32Array(count)
  const vertices = new Float32Array(count * 3)
  let vertexCount = 0, previous = -1
  for (let i = 0; i < sorted.length; i++) {
    const source = sorted[i]
    if (previous < 0 || qx[source] !== qx[previous] || qy[source] !== qy[previous] || qz[source] !== qz[previous]) {
      vertices[vertexCount * 3] = position.getX(source)
      vertices[vertexCount * 3 + 1] = position.getY(source)
      vertices[vertexCount * 3 + 2] = position.getZ(source)
      vertexCount++
      previous = source
    }
    sourceToWelded[source] = vertexCount - 1
  }
  return { sourceToWelded, vertices: vertices.subarray(0, vertexCount * 3) }
}

function addNeighbor(neighbors, degrees, face, neighbor) {
  const degree = degrees[face]
  if (degree < 3) { neighbors[face * 3 + degree] = neighbor; degrees[face] = degree + 1 }
}

function buildTopology(geometry, mesh, options) {
  const position = geometry.attributes.position
  if (!position) throw new Error('Boundary analysis requires a position attribute.')
  geometry.computeBoundingBox()
  const size = new THREE.Vector3()
  geometry.boundingBox.getSize(size)
  const { sourceToWelded, vertices } = weldVertices(position, Math.max(1e-6, size.length() * 1e-7))
  const sourceIndex = geometry.index?.array
  const faceCount = sourceIndex ? sourceIndex.length / 3 : position.count / 3
  const faceVertices = new Uint32Array(faceCount * 3)
  const faceNormals = new Float32Array(faceCount * 3)
  const edgeCount = faceCount * 3
  const edgeA = new Uint32Array(edgeCount), edgeB = new Uint32Array(edgeCount), edgeFace = new Uint32Array(edgeCount)
  for (let face = 0; face < faceCount; face++) {
    for (let corner = 0; corner < 3; corner++) faceVertices[face * 3 + corner] = sourceToWelded[sourceIndex ? sourceIndex[face * 3 + corner] : face * 3 + corner]
    const ia = faceVertices[face * 3] * 3, ib = faceVertices[face * 3 + 1] * 3, ic = faceVertices[face * 3 + 2] * 3
    const abx = vertices[ib] - vertices[ia], aby = vertices[ib + 1] - vertices[ia + 1], abz = vertices[ib + 2] - vertices[ia + 2]
    const acx = vertices[ic] - vertices[ia], acy = vertices[ic + 1] - vertices[ia + 1], acz = vertices[ic + 2] - vertices[ia + 2]
    let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx
    const length = Math.hypot(nx, ny, nz) || 1
    nx /= length; ny /= length; nz /= length
    faceNormals[face * 3] = nx; faceNormals[face * 3 + 1] = ny; faceNormals[face * 3 + 2] = nz
    for (let corner = 0; corner < 3; corner++) {
      const first = faceVertices[face * 3 + corner], second = faceVertices[face * 3 + ((corner + 1) % 3)], edge = face * 3 + corner
      edgeA[edge] = Math.min(first, second); edgeB[edge] = Math.max(first, second); edgeFace[edge] = face
    }
  }
  const order = new Uint32Array(edgeCount)
  for (let i = 0; i < edgeCount; i++) order[i] = i
  const sortedEdges = radixSort(order, [{ values: edgeB }, { values: edgeA }])
  const neighbors = new Int32Array(faceCount * 3); neighbors.fill(-1)
  const degrees = new Uint8Array(faceCount), selected = []
  const mode = options.mode || 'feature', threshold = THREE.MathUtils.degToRad(Number(options.sharpAngleDeg ?? 45)), regions = mesh.triangleRegions
  for (let start = 0; start < sortedEdges.length;) {
    const firstEdge = sortedEdges[start]
    let end = start + 1
    while (end < sortedEdges.length && edgeA[sortedEdges[end]] === edgeA[firstEdge] && edgeB[sortedEdges[end]] === edgeB[firstEdge]) end++
    if (end - start === 2) {
      const face1 = edgeFace[sortedEdges[start]], face2 = edgeFace[sortedEdges[start + 1]]
      addNeighbor(neighbors, degrees, face1, face2); addNeighbor(neighbors, degrees, face2, face1)
      const edge = { key: edgeKey(edgeA[firstEdge], edgeB[firstEdge]), a: edgeA[firstEdge], b: edgeB[firstEdge], face1, face2 }
      if (mode === 'color') {
        if (regions && regions[face1] !== regions[face2]) { edge.regionPair = [regions[face1], regions[face2]].sort((a, b) => a - b); selected.push(edge) }
      } else {
        const a = face1 * 3, b = face2 * 3
        const dot = faceNormals[a] * faceNormals[b] + faceNormals[a + 1] * faceNormals[b + 1] + faceNormals[a + 2] * faceNormals[b + 2]
        const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1))
        if (angle + 1e-8 >= threshold) selected.push({ ...edge, angle })
      }
    }
    start = end
  }
  return { vertices, faceCount, neighbors, degrees, selected }
}

function closedLoops(edges) {
  const adjacency = new Map()
  for (const edge of edges) {
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, [])
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, [])
    adjacency.get(edge.a).push(edge); adjacency.get(edge.b).push(edge)
  }
  const visited = new Set(), loops = []
  for (const startEdge of edges) {
    if (visited.has(startEdge.key)) continue
    const componentEdges = [], queue = [startEdge], componentKeys = new Set()
    while (queue.length) {
      const edge = queue.pop()
      if (componentKeys.has(edge.key)) continue
      componentKeys.add(edge.key); componentEdges.push(edge)
      for (const vertex of [edge.a, edge.b]) for (const neighbor of adjacency.get(vertex) || []) if (!componentKeys.has(neighbor.key)) queue.push(neighbor)
    }
    componentEdges.forEach((edge) => visited.add(edge.key))
    const componentVertices = new Set(componentEdges.flatMap((edge) => [edge.a, edge.b]))
    if ([...componentVertices].some((vertex) => (adjacency.get(vertex) || []).filter((edge) => componentKeys.has(edge.key)).length !== 2)) continue
    let first = Infinity
    for (const vertex of componentVertices) if (vertex < first) first = vertex
    const ordered = [first]
    let previous = null, current = first
    do {
      const nextEdge = (adjacency.get(current) || []).filter((edge) => componentKeys.has(edge.key)).find((edge) => edge.key !== previous)
      if (!nextEdge) break
      previous = nextEdge.key; current = nextEdge.a === current ? nextEdge.b : nextEdge.a
      if (current !== first) ordered.push(current)
    } while (current !== first && ordered.length <= componentVertices.size)
    if (current === first && ordered.length === componentVertices.size) loops.push({ vertices: ordered, edges: componentEdges })
  }
  return loops
}

function facePartitions(topology, barrierEdges) {
  const blocked = new Uint8Array(topology.neighbors.length)
  for (const edge of barrierEdges) {
    for (const [face, neighbor] of [[edge.face1, edge.face2], [edge.face2, edge.face1]]) {
      for (let i = 0; i < topology.degrees[face]; i++) {
        if (topology.neighbors[face * 3 + i] === neighbor) blocked[face * 3 + i] = 1
      }
    }
  }
  const seen = new Uint8Array(topology.faceCount), queue = new Uint32Array(topology.faceCount), collected = new Uint32Array(topology.faceCount), components = []
  for (let start = 0; start < topology.faceCount; start++) {
    if (seen[start]) continue
    let read = 0, write = 1, count = 0
    queue[0] = start; seen[start] = 1
    while (read < write) {
      const face = queue[read++]; collected[count++] = face
      for (let i = 0; i < topology.degrees[face]; i++) {
        const next = topology.neighbors[face * 3 + i]
        if (next >= 0 && !seen[next] && !blocked[face * 3 + i]) { seen[next] = 1; queue[write++] = next }
      }
    }
    components.push(collected.slice(0, count))
    if (components.length > 2) return components
  }
  return components
}

function loopPlane(points) {
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length), normal = new THREE.Vector3()
  for (let i = 0; i < points.length; i++) {
    const current = points[i], next = points[(i + 1) % points.length]
    normal.x += (current.y - next.y) * (current.z + next.z)
    normal.y += (current.z - next.z) * (current.x + next.x)
    normal.z += (current.x - next.x) * (current.y + next.y)
  }
  normal.normalize()
  let planarityError = 0
  for (const point of points) {
    const distance = Math.abs(normal.x * (point.x - center.x) + normal.y * (point.y - center.y) + normal.z * (point.z - center.z))
    planarityError = Math.max(planarityError, distance)
  }
  return { origin: center.toArray(), normal: normal.toArray(), planarityError }
}

export function analyzeBoundaries(mesh, options = {}) {
  const faceCount = mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3
  assertBoundaryAnalysisBudget(faceCount, options.maxAnalysisFaces ?? MAX_BOUNDARY_ANALYSIS_TRIANGLES)
  const topology = buildTopology(mesh.geometry, mesh, options), maxCandidates = Math.max(1, Number(options.maxCandidates || 12))
  const defaultMinLoopVertices = (options.mode || 'feature') === 'color' ? 4 : 6
  const loops = closedLoops(topology.selected).filter((loop) => loop.vertices.length >= Math.max(4, Number(options.minLoopVertices || defaultMinLoopVertices))).sort((a, b) => b.edges.length - a.edges.length)
  const candidates = []
  for (const loop of loops) {
    const sideFaces = facePartitions(topology, loop.edges)
    if (sideFaces.length !== 2 || sideFaces.some((side) => side.length === 0)) continue
    const points = loop.vertices.map((vertex) => new THREE.Vector3(topology.vertices[vertex * 3], topology.vertices[vertex * 3 + 1], topology.vertices[vertex * 3 + 2]))
    const plane = loopPlane(points), balance = Math.min(...sideFaces.map((side) => side.length)) / Math.max(...sideFaces.map((side) => side.length))
    const edgeKeys = loop.edges.map((edge) => edge.key).sort(), edgeSignature = compactSignature(edgeKeys)
    const regionPair = options.mode === 'color' ? loop.edges[0].regionPair : undefined
    const sharpness = options.mode === 'feature' ? loop.edges.reduce((sum, edge) => sum + edge.angle, 0) / loop.edges.length / Math.PI : 1
    candidates.push({ id: `${options.mode || 'feature'}-${edgeSignature}`, mode: options.mode || 'feature', score: sharpness * 0.65 + balance * 0.35, loops: [points.map((point) => point.toArray())], loopVertexIds: [loop.vertices], sideFaces, plane: { origin: plane.origin, normal: plane.normal }, planarityError: plane.planarityError, method: 'topology', metrics: { balance, sharpness, regionPair } })
    if (candidates.length >= maxCandidates * 2) break
  }
  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, maxCandidates)
}
