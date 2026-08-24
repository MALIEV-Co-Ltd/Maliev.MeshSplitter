import * as THREE from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import JSZip from 'jszip'

const PRIMARY_EXTENSIONS = new Set(['stl', '3mf', 'obj'])

function extension(name) {
  return String(name || '').split('.').pop().toLowerCase()
}

function materialColor(material) {
  if (Array.isArray(material)) return materialColor(material[0])
  return material?.color?.isColor ? material.color.getHex() : null
}

function readFile(file, mode) {
  const direct = file?.[mode]
  if (typeof direct === 'function') return direct.call(file)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error(`Unable to read ${file?.name || 'file'}.`))
    reader.onload = () => resolve(reader.result)
    if (mode === 'text') reader.readAsText(file)
    else reader.readAsArrayBuffer(file)
  })
}

function normalizeObject(root, { colorsReliable }) {
  root.updateMatrixWorld(true)
  const positions = []
  const normals = []
  const triangleRegions = []
  const regionColors = new Map()
  const regionByKey = new Map()

  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()
    geometry.applyMatrix4(object.matrixWorld)
    if (!geometry.attributes.normal) geometry.computeVertexNormals()
    const position = geometry.attributes.position
    const normal = geometry.attributes.normal
    const groups = geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count: position.count, materialIndex: 0 }]

    for (const group of groups) {
      const material = Array.isArray(object.material)
        ? object.material[group.materialIndex || 0]
        : object.material
      const materialHex = materialColor(material)
      const materialName = material?.name || object.name || `material-${group.materialIndex || 0}`
      const end = Math.min(position.count, group.start + group.count)
      for (let vertex = group.start; vertex + 2 < end; vertex += 3) {
        let color = materialHex
        if (colorsReliable && geometry.attributes.color) {
          const attribute = geometry.attributes.color
          const averaged = new THREE.Color(
            (attribute.getX(vertex) + attribute.getX(vertex + 1) + attribute.getX(vertex + 2)) / 3,
            (attribute.getY(vertex) + attribute.getY(vertex + 1) + attribute.getY(vertex + 2)) / 3,
            (attribute.getZ(vertex) + attribute.getZ(vertex + 1) + attribute.getZ(vertex + 2)) / 3,
          )
          color = averaged.getHex()
        }
        const key = colorsReliable ? `${materialName}:${color ?? 'none'}` : materialName
        if (!regionByKey.has(key)) regionByKey.set(key, regionByKey.size)
        const region = regionByKey.get(key)
        if (colorsReliable && color != null) regionColors.set(region, color)
        triangleRegions.push(region)
        for (let offset = 0; offset < 3; offset += 1) {
          const index = vertex + offset
          positions.push(position.getX(index), position.getY(index), position.getZ(index))
          normals.push(normal.getX(index), normal.getY(index), normal.getZ(index))
        }
      }
    }
    geometry.dispose()
  })

  if (!positions.length) throw new Error('The selected model does not contain triangle mesh geometry.')
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.computeBoundingBox()
  return {
    geometry,
    triangleRegions: Uint32Array.from(triangleRegions),
    regionColors,
    hasColor: colorsReliable && regionColors.size > 1,
  }
}

async function importStl(file) {
  const geometry = new STLLoader().parse(await readFile(file, 'arrayBuffer'))
  if (!geometry.attributes.normal) geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  return {
    geometry,
    triangleRegions: new Uint32Array(Math.floor(geometry.attributes.position.count / 3)),
    regionColors: new Map(),
    hasColor: false,
    warnings: [],
  }
}

async function importObj(primary, companion) {
  const source = await readFile(primary, 'text')
  const referencedMtl = source.match(/^\s*mtllib\s+(.+)$/im)?.[1]?.trim()
  const loader = new OBJLoader()
  const warnings = []
  if (companion) {
    const materials = new MTLLoader().parse(await readFile(companion, 'text'), '')
    for (const info of Object.values(materials.materialsInfo || {})) {
      delete info.map_kd
      delete info.map_ks
      delete info.map_bump
      delete info.bump
    }
    materials.preload()
    loader.setMaterials(materials)
  } else if (referencedMtl) {
    warnings.push(`OBJ references ${referencedMtl}, but no companion MTL file was selected.`)
  }
  const normalized = normalizeObject(loader.parse(source), { colorsReliable: Boolean(companion) })
  return { ...normalized, warnings }
}

async function import3mf(file) {
  const buffer = await readFile(file, 'arrayBuffer')
  await assert3mfArchiveBudget(buffer)
  const group = new ThreeMFLoader().parse(buffer)
  return { ...normalizeObject(group, { colorsReliable: true }), warnings: [] }
}

export async function assert3mfArchiveBudget(buffer, maxExpandedBytes = 64 * 1024 * 1024) {
  const archive = await JSZip.loadAsync(buffer)
  const expandedBytes = Object.values(archive.files).reduce((total, entry) => total + Number(entry?._data?.uncompressedSize || 0), 0)
  if (expandedBytes > maxExpandedBytes) {
    throw new Error(`This 3MF archive's expanded size is ${Math.round(expandedBytes / 1024 / 1024)} MB. The local editor supports up to ${Math.round(maxExpandedBytes / 1024 / 1024)} MB; simplify or export a model-only 3MF before loading it.`)
  }
  return expandedBytes
}

export async function importMeshFiles(inputFiles) {
  const files = Array.from(inputFiles || [])
  const primaryFiles = files.filter((file) => PRIMARY_EXTENSIONS.has(extension(file.name)))
  if (primaryFiles.length !== 1) throw new Error('Select exactly one STL, 3MF, or OBJ model file.')
  const primary = primaryFiles[0]
  const format = extension(primary.name)
  const companions = files.filter((file) => extension(file.name) === 'mtl')
  if (format !== 'obj' && companions.length) throw new Error('MTL companion files can only be used with an OBJ model.')
  if (companions.length > 1) throw new Error('Select at most one MTL companion file.')

  const imported = format === 'stl'
    ? await importStl(primary)
    : format === 'obj'
      ? await importObj(primary, companions[0])
      : await import3mf(primary)

  const triangleCount = Math.floor(imported.geometry.attributes.position.count / 3)
  if (imported.triangleRegions.length !== triangleCount) {
    imported.geometry.dispose()
    throw new Error('Imported color assignments do not match the model triangles.')
  }
  return {
    ...imported,
    format,
    sourceFiles: files.map((file) => file.name),
  }
}
