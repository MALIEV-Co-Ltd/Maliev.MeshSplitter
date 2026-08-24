import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import * as THREE from 'three'
import * as MeshImport from './meshImport'
import { assert3mfArchiveBudget, importMeshFiles } from './meshImport'
import { sampleTextureColor } from './textureSampling'

function file(name, contents, type = 'application/octet-stream') {
  return new File([contents], name, { type })
}

const ASCII_STL = `solid triangle
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 10 0 0
    vertex 0 10 0
  endloop
endfacet
endsolid triangle`

const TWO_MATERIAL_OBJ = `mtllib colors.mtl
o plate
v 0 0 0
v 10 0 0
v 0 10 0
v 10 10 0
usemtl red
f 1 2 3
usemtl green
f 2 4 3`

const TWO_MATERIAL_MTL = `newmtl red
Kd 1 0 0
newmtl green
Kd 0 1 0`

async function colored3mf() {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`)
  zip.file('3D/3dmodel.model', `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1"><base name="red" displaycolor="#FF0000"/><base name="green" displaycolor="#00FF00"/></basematerials>
    <object id="2" type="model" pid="1" pindex="0"><mesh>
      <vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="10" y="10" z="0"/></vertices>
      <triangles><triangle v1="0" v2="1" v3="2" pid="1" p1="0"/><triangle v1="1" v2="3" v3="2" pid="1" p1="1"/></triangles>
    </mesh></object>
  </resources>
  <build><item objectid="2"/></build>
</model>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('importMeshFiles', () => {
  it('samples an MTL texture in UV space so preview vertex colors match the image', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ])

    expect(sampleTextureColor({ data: pixels, width: 2, height: 2 }, 0.25, 0.75)).toEqual([1, 0, 0])
    expect(sampleTextureColor({ data: pixels, width: 2, height: 2 }, 0.75, 0.75)).toEqual([0, 1, 0])
  })

  it('keeps STL compatible while explicitly reporting that it has no color boundary data', async () => {
    const imported = await importMeshFiles([file('part.stl', ASCII_STL, 'model/stl')])

    expect(imported.format).toBe('stl')
    expect(imported.geometry.attributes.position.count).toBe(3)
    expect([...imported.triangleRegions]).toEqual([0])
    expect(imported.hasColor).toBe(false)
    expect(imported.warnings).toEqual([])
  })

  it('preserves OBJ material regions and MTL diffuse colors for boundary analysis', async () => {
    const imported = await importMeshFiles([
      file('figure.obj', TWO_MATERIAL_OBJ, 'text/plain'),
      file('colors.mtl', TWO_MATERIAL_MTL, 'text/plain'),
    ])

    expect(imported.format).toBe('obj')
    expect(imported.geometry.attributes.position.count).toBe(6)
    expect([...imported.triangleRegions]).toEqual([0, 1])
    expect(imported.regionColors.get(0)).toBe(0xff0000)
    expect(imported.regionColors.get(1)).toBe(0x00ff00)
    expect(imported.hasColor).toBe(true)
    expect(imported.sourceFiles).toEqual(['figure.obj', 'colors.mtl'])
  })

  it('loads OBJ without MTL but warns that material colors are unavailable', async () => {
    const imported = await importMeshFiles([file('figure.obj', TWO_MATERIAL_OBJ, 'text/plain')])

    expect(imported.format).toBe('obj')
    expect(imported.hasColor).toBe(false)
    expect(imported.warnings).toContain('OBJ references colors.mtl, but no companion MTL file was selected.')
  })

  it('preserves 3MF base-material regions entirely in-browser', async () => {
    const imported = await importMeshFiles([file('colored.3mf', await colored3mf(), 'model/3mf')])

    expect(imported.format).toBe('3mf')
    expect([...imported.triangleRegions]).toEqual([0, 1])
    expect([...imported.regionColors.values()].sort((a, b) => a - b)).toEqual([0x00ff00, 0xff0000])
    expect(imported.hasColor).toBe(true)
    expect(imported.geometry.attributes.color).toBeDefined()
    expect(new THREE.Color().fromBufferAttribute(imported.geometry.attributes.color, 0).getHex()).toBe(0xff0000)
    expect(new THREE.Color().fromBufferAttribute(imported.geometry.attributes.color, 3).getHex()).toBe(0x00ff00)
  })

  it('rejects a 3MF archive whose expanded XML would exhaust browser memory', async () => {
    await expect(assert3mfArchiveBudget(await colored3mf(), 100)).rejects.toThrow('expanded size')
  })

  it('accepts exactly 1,500,000 instanced triangles and rejects 1,500,001 before allocation', () => {
    const sharedGeometry = new THREE.BufferGeometry()
    sharedGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ], 3))
    const acceptedRoot = new THREE.Group()
    const acceptedGeometry = sharedGeometry.clone()
    acceptedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(1_500_000 * 3), 1))
    acceptedRoot.add(new THREE.Mesh(acceptedGeometry))
    expect(() => MeshImport.assertObjectTriangleBudget(acceptedRoot)).not.toThrow()

    const oversizedRoot = new THREE.Group()
    sharedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(1_500_001 * 3), 1))
    oversizedRoot.add(new THREE.Mesh(sharedGeometry))
    expect(() => MeshImport.assertObjectTriangleBudget(oversizedRoot)).toThrow(
      'expands to 1,500,001 triangles after its components are placed; the local editor supports up to 1,500,000',
    )
  })

  it('rejects ambiguous primary model selections instead of guessing', async () => {
    await expect(importMeshFiles([
      file('one.stl', ASCII_STL),
      file('two.obj', TWO_MATERIAL_OBJ),
    ])).rejects.toThrow('Select exactly one STL, 3MF, or OBJ model file')
  })
})
