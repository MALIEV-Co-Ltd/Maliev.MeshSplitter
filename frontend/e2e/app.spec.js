import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_STL = path.resolve(__dirname, '..', '..', 'test-cube.stl')

test.describe('Mesh Split Application', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('page loads with empty state', async ({ page }) => {
    await expect(page.getByText('Drag & drop an STL file or click to browse')).toBeVisible()
    await expect(page.getByText('Parts (0)')).toBeVisible()
    await expect(page.getByText('No parts yet. Upload and split a mesh.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download STLs (ZIP)' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Assembly PDF' })).toBeDisabled()
  })

  test('upload STL file and display metadata', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await page.waitForTimeout(2000)
    await expect(page.getByText('File: test-cube.stl')).toBeVisible()
    await expect(page.getByText('Vertices: 36')).toBeVisible()
    await expect(page.getByText('Faces: 12')).toBeVisible()
    await expect(page.getByText('Watertight:Yes')).toBeVisible()
    await expect(page.getByText('Bounds: 100.0 x 100.0 x 100.0 mm')).toBeVisible()
  })

  test('build volume presets work', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await page.waitForTimeout(2000)

    const xInput = page.getByLabel('X (mm)')
    const yInput = page.getByLabel('Y (mm)')
    const zInput = page.getByLabel('Z (mm)')

    await page.getByRole('button', { name: 'X1C' }).click()
    await expect(xInput).toHaveValue('250')
    await expect(yInput).toHaveValue('250')
    await expect(zInput).toHaveValue('250')

    await page.getByRole('button', { name: 'MK4' }).click()
    await expect(xInput).toHaveValue('250')
    await expect(yInput).toHaveValue('210')
    await expect(zInput).toHaveValue('220')

    await page.getByRole('button', { name: 'V2.4' }).click()
    await expect(xInput).toHaveValue('350')
    await expect(yInput).toHaveValue('350')
    await expect(zInput).toHaveValue('350')
  })

  test('scale workflow updates mesh bounds before splitting', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await expect(page.getByText('Bounds: 100.0 x 100.0 x 100.0 mm')).toBeVisible({ timeout: 10000 })

    await page.getByLabel('Scale factor').fill('2')
    await page.getByRole('button', { name: 'Apply' }).first().click()

    await expect(page.getByText('Bounds: 200.0 x 200.0 x 200.0 mm')).toBeVisible()
    await expect(page.getByText('Current scale 200%.')).toBeVisible()
  })

  test('split mesh with default 1x1x1 grid', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Split' }).click()

    await expect(page.getByText('Parts (1)')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('P01-X0Y0Z0').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download STLs (ZIP)' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Assembly PDF' })).toBeEnabled()
  })

  test('split mesh with custom divisions produces 4 parts', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Edit' }).click()
    await page.waitForTimeout(500)

    await page.locator('input[type="number"]').nth(4).fill('2')
    await page.locator('input[type="number"]').nth(5).fill('2')
    await page.locator('input[type="number"]').nth(6).fill('1')

    await page.getByRole('button', { name: 'Split' }).click()
    await page.waitForTimeout(10000)

    await expect(page.getByText('Parts (4)')).toBeVisible()
    await expect(page.getByText('P04-X1Y1Z0').first()).toBeVisible()
  })

  test('connector workflow keeps parts available for export', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await expect(page.getByText('File: test-cube.stl')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Edit' }).click()
    await page.locator('input[type="number"]').nth(4).fill('2')
    await page.locator('input[type="number"]').nth(5).fill('1')
    await page.locator('input[type="number"]').nth(6).fill('1')
    await page.getByRole('button', { name: 'Split' }).click()
    await expect(page.getByText('Parts (2)')).toBeVisible({ timeout: 15000 })

    await page.getByText('Dowel').click()
    await page.getByRole('button', { name: 'Apply' }).last().click()
    await expect(page.getByText('Connectors applied')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Download STLs (ZIP)' })).toBeEnabled()
  })

  test('download STL zip after split', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Split' }).click()
    await expect(page.getByText('Parts (1)')).toBeVisible({ timeout: 15000 })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download STLs (ZIP)' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.zip')
  })

  test('download assembly PDF after split', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Split' }).click()
    await expect(page.getByText('Parts (1)')).toBeVisible({ timeout: 15000 })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Assembly PDF' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.pdf')
  })

  test('swap STL file clears previous results', async ({ page }) => {
    const fc1 = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc1).setFiles(TEST_STL)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Split' }).click()
    await expect(page.getByText('Parts (1)')).toBeVisible({ timeout: 15000 })

    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]')
      if (input) input.value = ''
    })

    const fc2 = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc2).setFiles(TEST_STL)
    await page.waitForTimeout(5000)

    await expect(page.getByText('Parts (0)')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('No parts yet. Upload and split a mesh.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download STLs (ZIP)' })).toBeDisabled()
  })

})

test.describe('public presentation', () => {
  test('explains the product before login and links to the protected app', async ({ page }) => {
    await page.goto('/tools/mesh-splitter')

    await expect(page.getByText('Split oversized STL files into print-ready, labeled parts.')).toBeVisible()
    await expect(page.getByText('free generations monthly')).toBeVisible()
    await expect(page.getByText('Upload STL')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Launch MeshSplitter' }).first()).toHaveAttribute('href', '/tools/mesh-splitter/app')
  })
})

test.describe('responsive design', () => {
  const viewports = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 1000 },
    { name: '2k', width: 2560, height: 1440 },
    { name: '4k', width: 3840, height: 2160 },
  ]

  for (const viewport of viewports) {
    test(`${viewport.name} has no horizontal overflow and renders canvas`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      await expect(page.getByText('Print-ready mesh splitting')).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
      const canvasBox = await page.locator('.preview-canvas canvas').boundingBox()
      expect(canvasBox?.width).toBeGreaterThan(250)
      expect(canvasBox?.height).toBeGreaterThan(250)
    })
  }
})
