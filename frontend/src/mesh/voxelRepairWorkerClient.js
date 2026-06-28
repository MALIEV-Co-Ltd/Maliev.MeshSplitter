import * as THREE from 'three'

// Main-thread client for the voxel remesh repair worker (see
// voxelRemesh.worker.js). The remesh can take anywhere from several seconds
// to a few minutes on a badly non-manifold mesh; running it in a worker keeps
// the tab responsive and lets progress update live, which a same-thread call
// to Manifold.levelSet cannot do (it's one long synchronous call — nothing
// repaints until it returns).
//
// `signal` (an AbortSignal) cancels the repair by terminating the worker;
// the returned promise then rejects with an AbortError.
export function runVoxelRepairInWorker(geometry, { edgeLength, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const worker = new Worker(new URL('./voxelRemesh.worker.js', import.meta.url), { type: 'module' })
    let settled = false

    const cleanup = () => {
      worker.terminate()
    }
    const settle = (fn) => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }

    const onAbort = () => settle(() => reject(new DOMException('Aborted', 'AbortError')))
    signal?.addEventListener('abort', onAbort, { once: true })

    worker.onmessage = (event) => {
      const { type } = event.data
      if (type === 'progress') {
        onProgress?.(event.data.progress)
        return
      }
      if (type === 'done') {
        settle(() => {
          if (!event.data.positions) {
            resolve(null)
            return
          }
          const result = new THREE.BufferGeometry()
          result.setAttribute('position', new THREE.BufferAttribute(event.data.positions, 3))
          result.setIndex(new THREE.BufferAttribute(event.data.indices, 1))
          result.computeBoundingBox()
          result.computeVertexNormals()
          resolve(result)
        })
        return
      }
      if (type === 'error') {
        settle(() => reject(new Error(event.data.message)))
      }
    }
    worker.onerror = (err) => {
      settle(() => reject(err?.error || new Error(err?.message || 'Voxel repair worker failed')))
    }

    const pos = geometry.attributes.position
    const positions = pos.array instanceof Float32Array ? pos.array.slice() : Float32Array.from(pos.array)
    const idx = geometry.index ? geometry.index.array : Uint32Array.from({ length: pos.count }, (_, i) => i)
    const indices = idx instanceof Uint32Array ? idx.slice() : Uint32Array.from(idx)

    worker.postMessage({ positions, indices, edgeLength }, [positions.buffer, indices.buffer])
  })
}
