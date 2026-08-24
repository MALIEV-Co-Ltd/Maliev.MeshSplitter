import { test, expect } from '@playwright/test'
import JSZip from 'jszip'
import * as THREE from 'three'

async function coloredBox3mf() {
  const geometry = new THREE.BoxGeometry(20, 12, 10, 2, 1, 1).toNonIndexed()
  const positions = geometry.getAttribute('position')
  const vertices = []
  const triangles = []

  for (let i = 0; i < positions.count; i += 1) {
    vertices.push(`<vertex x="${positions.getX(i)}" y="${positions.getY(i)}" z="${positions.getZ(i)}"/>`)
  }
  for (let i = 0; i < positions.count; i += 3) {
    const centerX = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3
    triangles.push(`<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}" pid="1" p1="${centerX < 0 ? 0 : 1}"/>`)
  }
  geometry.dispose()

  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
  zip.file('3D/3dmodel.model', `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1"><base name="red" displaycolor="#FF0000"/><base name="blue" displaycolor="#0000FF"/></basematerials>
    <object id="2" type="model" pid="1" pindex="0"><mesh>
      <vertices>${vertices.join('')}</vertices>
      <triangles>${triangles.join('')}</triangles>
    </mesh></object>
  </resources>
  <build><item objectid="2"/></build>
</model>`)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

test('splits a colored 3MF boundary with auto-sized PLA square-taper alignment keys', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('mesh-file-input').setInputFiles({
    name: 'colored-box.3mf',
    mimeType: 'model/3mf',
    buffer: await coloredBox3mf(),
  })

  await expect(page.locator('.canvas-inspector')).toContainText('colored-box.3mf', { timeout: 15000 })
  await page.getByText('Color', { exact: true }).click()

  const boundaries = page.getByRole('listbox', { name: 'Detected boundaries' })
  await expect(boundaries).toBeVisible({ timeout: 15000 })
  await expect(boundaries.getByRole('button').first()).toContainText('Boundary 1')
  await expect(page.getByText('Size alignment key automatically')).toBeVisible()
  await expect(page.locator('.conn-select-trigger')).toContainText('Square taper')

  await page.getByRole('button', { name: 'Split mesh' }).click()

  await expect(page.locator('.parts-panel')).toContainText('3 total', { timeout: 20000 })
  await expect(page.locator('.parts-panel')).toContainText('Key x1')
  await expect(page.locator('.parts-panel')).toContainText('6 × 3 × 5 mm')
  await expect(page.getByRole('button', { name: /Download package/ })).toBeEnabled()
})

test('asks for an optional MTL after selecting an OBJ and loads both files', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('mesh-file-input').setInputFiles({
    name: 'painted-tetra.obj',
    mimeType: 'text/plain',
    buffer: Buffer.from([
      'mtllib painted-tetra.mtl',
      'v 0 0 0', 'v 10 0 0', 'v 0 10 0', 'v 0 0 10',
      'usemtl painted',
      'f 1 3 2', 'f 1 2 4', 'f 2 3 4', 'f 3 1 4',
    ].join('\n')),
  })

  const prompt = page.getByRole('dialog', { name: 'Does this OBJ have material files?' })
  await expect(prompt).toContainText('painted-tetra.obj')
  const chooser = page.waitForEvent('filechooser')
  await prompt.getByRole('button', { name: 'Add MTL / textures' }).click()
  await (await chooser).setFiles({
    name: 'painted-tetra.mtl',
    mimeType: 'text/plain',
    buffer: Buffer.from('newmtl painted\nKd 0.1 0.6 0.9'),
  })

  await expect(page.locator('.canvas-inspector')).toContainText('painted-tetra.obj', { timeout: 15000 })
})

test('loads an OBJ diffuse texture into preview vertex colors', async ({ page }) => {
  await page.goto('/')
  const sampled = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const context = canvas.getContext('2d')
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 2, 2)
    const texture = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const obj = new File([[
      'mtllib figure.mtl',
      'v 0 0 0', 'v 10 0 0', 'v 0 10 0',
      'vt 0 0', 'vt 1 0', 'vt 0 1',
      'usemtl painted', 'f 1/1 2/2 3/3',
    ].join('\n')], 'figure.obj', { type: 'text/plain' })
    const mtl = new File(['newmtl painted\nKd 1 1 1\nmap_Kd texture.png'], 'figure.mtl', { type: 'text/plain' })
    const png = new File([texture], 'texture.png', { type: 'image/png' })
    const { importMeshFiles } = await import('/src/mesh/meshImport.js')
    const imported = await importMeshFiles([obj, mtl, png])
    const colors = imported.geometry.attributes.color
    return { red: colors.getX(0), green: colors.getY(0), blue: colors.getZ(0), sources: imported.sourceFiles }
  })

  expect(sampled.sources).toEqual(['figure.obj', 'figure.mtl', 'texture.png'])
  expect(sampled.red).toBeGreaterThan(0.95)
  expect(sampled.green).toBeLessThan(0.01)
  expect(sampled.blue).toBeLessThan(0.01)
})
