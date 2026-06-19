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

    const xInput = page.locator('input[type="number"]').nth(0)
    const yInput = page.locator('input[type="number"]').nth(1)
    const zInput = page.locator('input[type="number"]').nth(2)

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

  test('split mesh with default 1x1x1 grid', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Split' }).click()
    await page.waitForTimeout(3000)

    await expect(page.getByText('Parts (1)')).toBeVisible()
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

    await page.locator('input[type="number"]').nth(3).fill('2')
    await page.locator('input[type="number"]').nth(4).fill('2')
    await page.locator('input[type="number"]').nth(5).fill('1')

    await page.getByRole('button', { name: 'Split' }).click()
    await page.waitForTimeout(10000)

    await expect(page.getByText('Parts (4)')).toBeVisible()
  })

  test('download STL zip after split', async ({ page }) => {
    const fc = page.waitForEvent('filechooser')
    await page.getByText('Drag & drop an STL file or click to browse').click()
    await (await fc).setFiles(TEST_STL)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Split' }).click()
    await page.waitForTimeout(3000)

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
    await page.waitForTimeout(3000)

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
    await page.waitForTimeout(3000)
    await expect(page.getByText('Parts (1)')).toBeVisible()

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
