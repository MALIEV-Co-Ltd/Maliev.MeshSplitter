import * as THREE from 'three'

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function compactSignature(keys) {
  let hash = 2166136261
  for (const key of keys) {
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
  }
  return (hash >>> 0).toString(36)
}

function buildTopology(geometry) {
  const position = geometry.attributes.position
  if (!position) throw new Error('Boundary analysis requires a position attribute.')
  geometry.computeBoundingBox()
  const size = new THREE.Vector3()
  geometry.boundingBox.getSize(size)
  const tolerance = Math.max(1e-6, size.length() * 1e-7)
  const vertexByKey = new Map()
  const vertices = []
  const sourceToWelded = new Uint32Array(position.count)
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) / tolerance)}:${Math.round(position.getY(i) / tolerance)}:${Math.round(position.getZ(i) / tolerance)}`
    let welded = vertexByKey.get(key)
    if (welded == null) {
      welded = vertices.length
      vertexByKey.set(key, welded)
      vertices.push(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)))
    }
    sourceToWelded[i] = welded
  }
  const sourceIndex = geometry.index?.array
  const faceCount = sourceIndex ? sourceIndex.length / 3 : position.count / 3
  const faces = []
  const edges = new Map()
  for (let face = 0; face < faceCount; face++) {
    const ids = [0, 1, 2].map((offset) => sourceToWelded[sourceIndex ? sourceIndex[face * 3 + offset] : face * 3 + offset])
    const a = vertices[ids[0]], b = vertices[ids[1]], c = vertices[ids[2]]
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).normalize()
    faces.push({ ids, normal })
    for (let i = 0; i < 3; i++) {
      const key = edgeKey(ids[i], ids[(i + 1) % 3])
      if (!edges.has(key)) edges.set(key, { key, a: Math.min(ids[i], ids[(i + 1) % 3]), b: Math.max(ids[i], ids[(i + 1) % 3]), faces: [] })
      edges.get(key).faces.push(face)
    }
  }
  return { vertices, faces, edges, size }
}

function selectedEdges(topology, mesh, options) {
  const mode = options.mode || 'feature'
  const threshold = THREE.MathUtils.degToRad(Number(options.sharpAngleDeg ?? 45))
  const regions = mesh.triangleRegions
  const selected = []
  for (const edge of topology.edges.values()) {
    if (edge.faces.length !== 2) continue
    const [a, b] = edge.faces
    if (mode === 'color') {
      if (!regions || regions[a] === regions[b]) continue
      selected.push({ ...edge, regionPair: [regions[a], regions[b]].sort((x, y) => x - y) })
    } else {
      const angle = Math.acos(THREE.MathUtils.clamp(topology.faces[a].normal.dot(topology.faces[b].normal), -1, 1))
      if (angle + 1e-8 < threshold) continue
      selected.push({ ...edge, angle })
    }
  }
  return selected
}

function closedLoops(edges) {
  const adjacency = new Map()
  for (const edge of edges) {
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, [])
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, [])
    adjacency.get(edge.a).push(edge)
    adjacency.get(edge.b).push(edge)
  }
  const visited = new Set()
  const loops = []
  for (const startEdge of edges) {
    if (visited.has(startEdge.key)) continue
    const componentEdges = []
    const queue = [startEdge]
    const componentKeys = new Set()
    while (queue.length) {
      const edge = queue.pop()
      if (componentKeys.has(edge.key)) continue
      componentKeys.add(edge.key)
      componentEdges.push(edge)
      for (const vertex of [edge.a, edge.b]) {
        for (const neighbor of adjacency.get(vertex) || []) if (!componentKeys.has(neighbor.key)) queue.push(neighbor)
      }
    }
    componentEdges.forEach((edge) => visited.add(edge.key))
    const componentVertices = new Set(componentEdges.flatMap((edge) => [edge.a, edge.b]))
    if ([...componentVertices].some((vertex) => (adjacency.get(vertex) || []).filter((edge) => componentKeys.has(edge.key)).length !== 2)) continue
    const first = Math.min(...componentVertices)
    const ordered = [first]
    let previous = null
    let current = first
    do {
      const nextEdge = (adjacency.get(current) || [])
        .filter((edge) => componentKeys.has(edge.key))
        .find((edge) => edge.key !== previous)
      if (!nextEdge) break
      previous = nextEdge.key
      current = nextEdge.a === current ? nextEdge.b : nextEdge.a
      if (current !== first) ordered.push(current)
    } while (current !== first && ordered.length <= componentVertices.size)
    if (current === first && ordered.length === componentVertices.size) loops.push({ vertices: ordered, edges: componentEdges })
  }
  return loops
}

function facePartitions(topology, barrierKeys) {
  const faceNeighbors = Array.from({ length: topology.faces.length }, () => [])
  for (const edge of topology.edges.values()) {
    if (edge.faces.length !== 2 || barrierKeys.has(edge.key)) continue
    faceNeighbors[edge.faces[0]].push(edge.faces[1])
    faceNeighbors[edge.faces[1]].push(edge.faces[0])
  }
  const seen = new Uint8Array(topology.faces.length)
  const components = []
  for (let start = 0; start < topology.faces.length; start++) {
    if (seen[start]) continue
    const component = []
    const queue = [start]
    seen[start] = 1
    while (queue.length) {
      const face = queue.pop()
      component.push(face)
      for (const next of faceNeighbors[face]) if (!seen[next]) { seen[next] = 1; queue.push(next) }
    }
    components.push(component.sort((a, b) => a - b))
  }
  return components
}

function loopPlane(points) {
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length)
  const normal = new THREE.Vector3()
  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    normal.x += (current.y - next.y) * (current.z + next.z)
    normal.y += (current.z - next.z) * (current.x + next.x)
    normal.z += (current.x - next.x) * (current.y + next.y)
  }
  normal.normalize()
  const planarityError = Math.max(...points.map((point) => Math.abs(normal.dot(new THREE.Vector3().subVectors(point, center)))))
  return { origin: center.toArray(), normal: normal.toArray(), planarityError }
}

export function analyzeBoundaries(mesh, options = {}) {
  const faceCount = mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3
  const maxAnalysisFaces = Math.max(10_000, Number(options.maxAnalysisFaces || 400_000))
  if (faceCount > maxAnalysisFaces) {
    throw new Error(`Boundary analysis supports up to ${maxAnalysisFaces.toLocaleString()} triangles. Simplify this ${Math.round(faceCount).toLocaleString()}-triangle mesh before feature analysis.`)
  }
  const topology = buildTopology(mesh.geometry)
  const candidates = []
  for (const loop of closedLoops(selectedEdges(topology, mesh, options))) {
    const defaultMinLoopVertices = (options.mode || 'feature') === 'color' ? 4 : 6
    if (loop.vertices.length < Math.max(4, Number(options.minLoopVertices || defaultMinLoopVertices))) continue
    const barrier = new Set(loop.edges.map((edge) => edge.key))
    const sideFaces = facePartitions(topology, barrier)
    if (sideFaces.length !== 2 || sideFaces.some((side) => side.length === 0)) continue
    const points = loop.vertices.map((vertex) => topology.vertices[vertex].clone())
    const plane = loopPlane(points)
    const balance = Math.min(...sideFaces.map((side) => side.length)) / Math.max(...sideFaces.map((side) => side.length))
    const edgeKeys = loop.edges.map((edge) => edge.key).sort()
    const edgeSignature = compactSignature(edgeKeys)
    const regionPair = options.mode === 'color' ? loop.edges[0].regionPair : undefined
    const sharpness = options.mode === 'feature'
      ? loop.edges.reduce((sum, edge) => sum + edge.angle, 0) / loop.edges.length / Math.PI
      : 1
    candidates.push({
      id: `${options.mode || 'feature'}-${edgeSignature}`,
      mode: options.mode || 'feature',
      score: sharpness * 0.65 + balance * 0.35,
      loops: [points.map((point) => point.toArray())],
      loopVertexIds: [loop.vertices],
      sideFaces,
      plane: { origin: plane.origin, normal: plane.normal },
      planarityError: plane.planarityError,
      method: 'topology',
      metrics: { balance, sharpness, regionPair },
    })
  }
  return candidates
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, Number(options.maxCandidates || 12)))
}
