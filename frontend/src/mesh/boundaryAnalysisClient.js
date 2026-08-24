import { analyzeBoundaries } from './boundaryAnalysis'

let revision = 0

export function runBoundaryAnalysis(mesh, options = {}) {
  const currentRevision = ++revision
  if (typeof Worker === 'undefined') return Promise.resolve(analyzeBoundaries(mesh, options))
  const positions = mesh.geometry.attributes.position.array.slice()
  const sourceIndex = mesh.geometry.index?.array
  const indices = sourceIndex ? sourceIndex.slice() : null
  const triangleRegions = mesh.triangleRegions ? mesh.triangleRegions.slice() : null
  const worker = new Worker(new URL('./boundaryAnalysis.worker.js', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      worker.terminate()
      if (data.revision !== currentRevision || currentRevision !== revision) return reject(new Error('Boundary analysis was superseded by a newer mesh revision.'))
      if (data.error) return reject(new Error(data.error))
      resolve(data.candidates)
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'Boundary analysis worker failed.'))
    }
    const transfer = [positions.buffer]
    if (indices) transfer.push(indices.buffer)
    if (triangleRegions) transfer.push(triangleRegions.buffer)
    worker.postMessage({ revision: currentRevision, positions, indices, triangleRegions, options }, transfer)
  })
}
