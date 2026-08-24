import { access, readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { JSDOM } from 'jsdom'
import { importMeshFiles } from '../src/mesh/meshImport.js'
import { analyzeBoundaries } from '../src/mesh/boundaryAnalysis.js'

globalThis.DOMParser = new JSDOM('').window.DOMParser

function localFile(path) {
  return {
    name: basename(path),
    async arrayBuffer() {
      const data = await readFile(path)
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    },
    async text() {
      return readFile(path, 'utf8')
    },
    get size() {
      return 0
    },
  }
}

for (const path of process.argv.slice(2)) {
  const started = performance.now()
  try {
    const selectedFiles = [localFile(path)]
    if (/\.obj$/i.test(path)) {
      const mtlPath = path.replace(/\.obj$/i, '.mtl')
      try {
        await access(mtlPath)
        selectedFiles.push(localFile(mtlPath))
      } catch {
        // The importer records the missing companion warning.
      }
    }
    const imported = await importMeshFiles(selectedFiles)
    let analysisError = null
    let featureCandidates = []
    let colorCandidates = []
    try {
      featureCandidates = analyzeBoundaries(imported, { mode: 'feature', sharpAngleDeg: Number(process.env.SHARP_ANGLE || 45), maxCandidates: 12 })
      colorCandidates = imported.hasColor ? analyzeBoundaries(imported, { mode: 'color', maxCandidates: 12 }) : []
    } catch (error) {
      analysisError = error.message
    }
    const fileStat = await stat(path)
    process.stdout.write(`${JSON.stringify({
      file: basename(path), bytes: fileStat.size, format: imported.format,
      triangles: imported.triangleRegions.length, colorRegions: imported.regionColors.size,
      hasColor: imported.hasColor, featureCandidates: featureCandidates.length,
      colorCandidates: colorCandidates.length, topFeatureLoopVertices: featureCandidates[0]?.loops?.[0]?.length || 0,
      elapsedMs: Math.round(performance.now() - started), warnings: imported.warnings, analysisError,
    })}\n`)
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ file: basename(path), importError: error.message, elapsedMs: Math.round(performance.now() - started) })}\n`)
  }
}
