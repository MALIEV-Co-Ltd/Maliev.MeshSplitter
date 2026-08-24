import * as THREE from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { rasterizeTexture, sampleTextureColor } from './textureSampling'

const PRIMARY_EXTENSIONS = new Set(['stl', '3mf', 'obj'])
export const MAX_IMPORTED_TRIANGLES = 1_500_000

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

function geometryGroups(geometry, vertexCount) {
  const source = geometry.groups.length
    ? geometry.groups
    : [{ start: 0, count: vertexCount, materialIndex: 0 }]
  return source.map((group) => {
    const start = Math.max(0, Math.floor(Number(group.start) || 0))
    const count = Math.max(0, Math.floor(Number(group.count) || 0))
    return { ...group, start, end: Math.min(vertexCount, start + count) }
  })
}

function meshTriangleCount(object) {
  const geometry = object.geometry
  const vertexCount = geometry.index?.count ?? geometry.attributes.position.count
  return geometryGroups(geometry, vertexCount).reduce(
    (total, group) => total + Math.floor(Math.max(0, group.end - group.start) / 3),
    0,
  )
}

export function assertObjectTriangleBudget(root, maxTriangles = MAX_IMPORTED_TRIANGLES) {
  let triangleCount = 0
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return
    triangleCount += meshTriangleCount(object)
    if (triangleCount > maxTriangles) {
      throw new Error(`This model expands to ${triangleCount.toLocaleString('en-US')} triangles after its components are placed; the local editor supports up to ${maxTriangles.toLocaleString('en-US')}. Remove duplicate build items or simplify the model before loading it.`)
    }
  })
  return triangleCount
}

function normalizeObject(root, { colorsReliable, textureSamplers = new Map() }) {
  root.updateMatrixWorld(true)
  const totalTriangles = assertObjectTriangleBudget(root)
  const positions = new Float32Array(totalTriangles * 9)
  const normals = new Float32Array(totalTriangles * 9)
  const vertexColors = colorsReliable ? new Float32Array(totalTriangles * 9) : null
  const triangleRegions = new Uint32Array(totalTriangles)
  const regionColors = new Map()
  const regionByKey = new Map()
  let triangleOffset = 0
  let vertexOffset = 0
  let hasVertexColors = false

  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()
    geometry.applyMatrix4(object.matrixWorld)
    if (!geometry.attributes.normal) geometry.computeVertexNormals()
    const position = geometry.attributes.position
    const normal = geometry.attributes.normal
    const uv = geometry.attributes.uv
    const groups = geometryGroups(geometry, position.count)

    for (const group of groups) {
      const material = Array.isArray(object.material)
        ? object.material[group.materialIndex || 0]
        : object.material
      const materialHex = materialColor(material)
      const materialName = material?.name || object.name || `material-${group.materialIndex || 0}`
      const texture = textureSamplers.get(materialName)
      for (let vertex = group.start; vertex + 2 < group.end; vertex += 3) {
        let color = materialHex
        let red = material?.color?.r ?? 0.75
        let green = material?.color?.g ?? 0.75
        let blue = material?.color?.b ?? 0.75
        if (colorsReliable && geometry.attributes.color) {
          const attribute = geometry.attributes.color
          red = (attribute.getX(vertex) + attribute.getX(vertex + 1) + attribute.getX(vertex + 2)) / 3
          green = (attribute.getY(vertex) + attribute.getY(vertex + 1) + attribute.getY(vertex + 2)) / 3
          blue = (attribute.getZ(vertex) + attribute.getZ(vertex + 1) + attribute.getZ(vertex + 2)) / 3
          const averaged = new THREE.Color(red, green, blue)
          color = averaged.getHex()
        }
        const key = colorsReliable ? `${materialName}:${materialHex ?? color ?? 'none'}` : materialName
        if (!regionByKey.has(key)) regionByKey.set(key, regionByKey.size)
        const region = regionByKey.get(key)
        if (colorsReliable && color != null) regionColors.set(region, color)
        triangleRegions[triangleOffset] = region
        triangleOffset += 1
        if (colorsReliable && color != null) hasVertexColors = true
        for (let offset = 0; offset < 3; offset += 1) {
          const index = vertex + offset
          let vertexRed = red
          let vertexGreen = green
          let vertexBlue = blue
          if (texture && uv) {
            const sampled = sampleTextureColor(texture, uv.getX(index), uv.getY(index))
            vertexRed = sampled[0] * (material?.color?.r ?? 1)
            vertexGreen = sampled[1] * (material?.color?.g ?? 1)
            vertexBlue = sampled[2] * (material?.color?.b ?? 1)
            hasVertexColors = true
          }
          positions[vertexOffset] = position.getX(index)
          positions[vertexOffset + 1] = position.getY(index)
          positions[vertexOffset + 2] = position.getZ(index)
          normals[vertexOffset] = normal.getX(index)
          normals[vertexOffset + 1] = normal.getY(index)
          normals[vertexOffset + 2] = normal.getZ(index)
          if (vertexColors) {
            vertexColors[vertexOffset] = vertexRed
            vertexColors[vertexOffset + 1] = vertexGreen
            vertexColors[vertexOffset + 2] = vertexBlue
          }
          vertexOffset += 3
        }
      }
    }
    geometry.dispose()
  })

  if (!totalTriangles) throw new Error('The selected model does not contain triangle mesh geometry.')
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  if (hasVertexColors) geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3))
  geometry.computeBoundingBox()
  return {
    geometry,
    triangleRegions,
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

function matchingTexture(reference, textureFiles) {
  const normalized = decodeURIComponent(String(reference || '')).replaceAll('\\', '/').toLowerCase()
  return textureFiles.find((file) => normalized.endsWith(`/${file.name.toLowerCase()}`) || normalized.endsWith(file.name.toLowerCase()))
}

async function importObj(primary, companion, textureFiles) {
  const source = await readFile(primary, 'text')
  const referencedMtl = source.match(/^\s*mtllib\s+(.+)$/im)?.[1]?.trim()
  const loader = new OBJLoader()
  const warnings = []
  if (companion) {
    const materials = new MTLLoader().parse(await readFile(companion, 'text'), '')
    const textureSamplers = new Map()
    for (const [name, info] of Object.entries(materials.materialsInfo || {})) {
      if (info.map_kd) {
        const texture = matchingTexture(info.map_kd, textureFiles)
        if (texture) textureSamplers.set(name, await rasterizeTexture(texture))
        else warnings.push(`MTL texture ${info.map_kd} was not selected; ${name} uses its diffuse color.`)
      }
      delete info.map_kd
      delete info.map_ks
      delete info.map_bump
      delete info.bump
    }
    materials.preload()
    loader.setMaterials(materials)
    const normalized = normalizeObject(loader.parse(source), { colorsReliable: true, textureSamplers })
    return { ...normalized, warnings }
  } else if (referencedMtl) {
    warnings.push(`OBJ references ${referencedMtl}, but no companion MTL file was selected.`)
  }
  const normalized = normalizeObject(loader.parse(source), { colorsReliable: false })
  return { ...normalized, warnings }
}

async function import3mf(file) {
  const buffer = await readFile(file, 'arrayBuffer')
  await assert3mfArchiveBudget(buffer)
  const group = new ThreeMFLoader().parse(buffer)
  return { ...normalizeObject(group, { colorsReliable: true }), warnings: [] }
}

export async function assert3mfArchiveBudget(buffer, maxExpandedBytes = 64 * 1024 * 1024) {
  const { default: JSZip } = await import('jszip')
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
  const textureFiles = files.filter((file) => /^(png|jpe?g|webp|bmp)$/.test(extension(file.name)))
  if (format !== 'obj' && companions.length) throw new Error('MTL companion files can only be used with an OBJ model.')
  if (companions.length > 1) throw new Error('Select at most one MTL companion file.')
  if (textureFiles.length && (format !== 'obj' || companions.length !== 1)) throw new Error('Texture images require one OBJ model and its MTL companion.')
  if (files.length !== primaryFiles.length + companions.length + textureFiles.length) throw new Error('Unsupported companion file. Select OBJ textures as PNG, JPG, WebP, or BMP.')

  const imported = format === 'stl'
    ? await importStl(primary)
    : format === 'obj'
      ? await importObj(primary, companions[0], textureFiles)
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
