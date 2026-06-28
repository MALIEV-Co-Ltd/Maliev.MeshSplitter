// Web Worker entry point for the voxel remesh repair. Manifold.levelSet is one
// long synchronous call from JS's point of view — the only way to keep the UI
// responsive and report live progress while it runs is to run it on a
// separate thread. This file is intentionally self-contained (its own wasm
// loader) rather than importing meshProcessor.js, so the worker bundle stays
// small and isn't coupled to that module's unrelated exports.
import * as THREE from 'three'
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url'
import { voxelRemeshGeometry } from './voxelRemesh.js'

let manifoldModulePromise
async function getManifoldModule() {
  if (!manifoldModulePromise) {
    manifoldModulePromise = import('manifold-3d').then(async (mod) => {
      const response = await fetch(manifoldWasmUrl)
      if (!response.ok) {
        throw new Error(`Unable to load the geometry engine (${response.status})`)
      }
      const wasmBinary = new Uint8Array(await response.arrayBuffer())
      const api = await mod.default({
        locateFile: () => manifoldWasmUrl,
        wasmBinary,
      })
      api.setup()
      return api
    })
  }
  return manifoldModulePromise
}

self.onmessage = async (event) => {
  const { positions, indices, edgeLength } = event.data
  try {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))

    const manifold = await getManifoldModule()
    const result = voxelRemeshGeometry(geometry, manifold, {
      edgeLength,
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    })

    if (!result) {
      self.postMessage({ type: 'done', positions: null, indices: null })
      return
    }

    const outPositions = result.attributes.position.array
    const outIndices = result.index.array
    self.postMessage(
      { type: 'done', positions: outPositions, indices: outIndices },
      [outPositions.buffer, outIndices.buffer],
    )
  } catch (e) {
    self.postMessage({ type: 'error', message: e?.message || String(e) })
  }
}
