import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_STL = path.resolve(__dirname, '..', '..', 'test-cube.stl')

async function uploadTestStl(page) {
  const fc = page.waitForEvent('filechooser')
  await page.getByText('Drag & drop an STL file or click to browse').click()
  await (await fc).setFiles(TEST_STL)
}

async function setBuildVolume(page, x, y, z) {
  await page.locator('#build-volume-X').fill(String(x))
  await page.locator('#build-volume-Y').fill(String(y))
  await page.locator('#build-volume-Z').fill(String(z))
}

async function confirmSplitWithoutConnectors(page) {
  await expect(page.getByText('No connector selected')).toBeVisible()
  await page.getByRole('button', { name: 'Split without connectors' }).click()
}

test.describe('Mesh Split Application', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('page loads with empty state', async ({ page }) => {
    await expect(page.locator('.app-logo-link')).toHaveAttribute('href', 'https://shop.maliev.com/')
    await expect(page.getByText('Drag & drop an STL file or click to browse')).toBeVisible()
    await expect(page.locator('.parts-panel')).toContainText('0 total')
    await expect(page.getByText('No parts yet. Upload and split a mesh.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download package (STL + PDF ZIP)' })).toBeDisabled()
  })

  test('upload STL file and display metadata', async ({ page }) => {
    await uploadTestStl(page)
    const inspector = page.locator('.canvas-inspector')
    await expect(inspector).toBeVisible({ timeout: 10000 })
    await expect(inspector).toContainText('test-cube.stl')
    await expect(inspector).toContainText('36')
    await expect(inspector).toContainText('12')
    await expect(inspector).toContainText('Watertight')
    await expect(inspector).toContainText('100 × 100 × 100 mm')
    await expect(page.locator('.col-left')).not.toContainText('Vertices')
  })

  test('build volume presets work', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })

    const preset = page.locator('#build-volume-preset')
    const xInput = page.locator('#build-volume-X')
    const yInput = page.locator('#build-volume-Y')
    const zInput = page.locator('#build-volume-Z')

    await preset.selectOption('bambu-x1c')
    await expect(xInput).toHaveValue('256')
    await expect(yInput).toHaveValue('256')
    await expect(zInput).toHaveValue('256')

    await preset.selectOption('prusa-mk4')
    await expect(xInput).toHaveValue('250')
    await expect(yInput).toHaveValue('210')
    await expect(zInput).toHaveValue('220')

    await preset.selectOption('snapmaker-x1e')
    await expect(xInput).toHaveValue('360')
    await expect(yInput).toHaveValue('360')
    await expect(zInput).toHaveValue('360')
  })

  test('scale workflow updates mesh bounds before splitting', async ({ page }) => {
    await uploadTestStl(page)
    const inspector = page.locator('.canvas-inspector')
    await expect(inspector).toContainText('100 × 100 × 100 mm', { timeout: 10000 })

    await page.getByRole('button', { name: '200%' }).click()
    await expect(inspector).toContainText('200 × 200 × 200 mm')
    await expect(inspector).toContainText('2.000x')
  })

  test('split mesh with default 1x1x1 grid', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Split' }).click()
    await confirmSplitWithoutConnectors(page)

    await expect(page.locator('.parts-panel')).toContainText('1 total', { timeout: 15000 })
    await expect(page.getByText('P01-X0Y0Z0').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download package (STL + PDF ZIP)' })).toBeEnabled()
  })

  test('split counts are calculated from build volume and cannot be manually edited', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[role="slider"]')).toHaveCount(0)
    await setBuildVolume(page, 50, 50, 100)
    await expect(page.locator('.col-right .pnl-meta').last()).toContainText('2×2×1')

    await page.getByRole('button', { name: 'Split' }).click()
    await confirmSplitWithoutConnectors(page)

    await expect(page.locator('.parts-panel')).toContainText('4 total', { timeout: 15000 })
    await expect(page.getByText('P04-X1Y1Z0').first()).toBeVisible()
  })

  test('connector workflow keeps parts available for export', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })
    await setBuildVolume(page, 50, 100, 100)
    await expect(page.locator('.col-right .pnl-meta').last()).toContainText('2×1×1')
    await page.locator('.conn-select-trigger').click()
    await expect(page.locator('[role="listbox"]')).toBeVisible()
    await page.locator('[role="option"]').filter({ hasText: 'Dowel' }).click()
    await page.getByRole('button', { name: 'Split mesh' }).click()
    await expect(page.locator('.parts-panel')).toContainText('2 total', { timeout: 15000 })
    await expect(page.getByText('Connectors applied')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Download package (STL + PDF ZIP)' })).toBeEnabled()
  })

  test('download package zip after split', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Split' }).click()
    await confirmSplitWithoutConnectors(page)
    await expect(page.locator('.parts-panel')).toContainText('1 total', { timeout: 15000 })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download package (STL + PDF ZIP)' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.zip')
  })

  test('swap STL file clears previous results', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Split' }).click()
    await confirmSplitWithoutConnectors(page)
    await expect(page.locator('.parts-panel')).toContainText('1 total', { timeout: 15000 })

    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]')
      if (input) input.value = ''
    })

    await uploadTestStl(page)

    await expect(page.locator('.parts-panel')).toContainText('0 total', { timeout: 10000 })
    await expect(page.getByText('No parts yet. Upload and split a mesh.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download package (STL + PDF ZIP)' })).toBeDisabled()
  })

})

test.describe('public presentation', () => {
  test('explains the product before login and links to the protected app', async ({ page }) => {
    await page.goto('/tools/mesh-splitter')

    await expect(page.getByText('Split oversized STL files into print-ready, labeled parts.')).toBeVisible()
    await expect(page.getByText('free exports monthly')).toBeVisible()
    await expect(page.locator('.splitter-visual img')).toBeVisible()
    await expect(page.locator('.splitter-visual img')).toHaveAttribute('src', /mesh-splitter-hero/)
    await expect(page.locator('#pricing')).toBeVisible()
    await expect(page.locator('#pricing')).toContainText('Start free, then buy export credits only when needed.')
    await expect(page.locator('#pricing')).toContainText('Starter Credit Pack')
    await expect(page.locator('#pricing')).toContainText('Maker Credit Pack')
    await expect(page.locator('#pricing')).toContainText('Best value')
    await expect(page.locator('#pricing').evaluate((pricing) => {
      const workflow = document.querySelector('#how-it-works')
      return Boolean(workflow && pricing.compareDocumentPosition(workflow) & Node.DOCUMENT_POSITION_FOLLOWING)
    })).resolves.toBe(true)
    await expect(page.locator('.lnd-logo')).toHaveAttribute('href', 'https://shop.maliev.com/')
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
      'href',
      'https://shop.maliev.com/account/login?return_to=%2Ftools%2Fmesh-splitter&return_url=%2Ftools%2Fmesh-splitter',
    )
    await expect(page.getByRole('link', { name: 'Launch MeshSplitter' }).first()).toHaveAttribute('href', '/tools/mesh-splitter/app')
  })

  test('renders Thai landing copy when requested', async ({ page }) => {
    await page.goto('/tools/mesh-splitter?lang=th')

    await expect(page.getByText('แยกไฟล์ STL ขนาดใหญ่เป็นชิ้นงานพร้อมพิมพ์และมีป้ายกำกับ')).toBeVisible()
    await expect(page.getByRole('link', { name: 'เปิด MeshSplitter' }).first()).toBeVisible()
    await expect(page.locator('#pricing')).toContainText('เริ่มใช้ฟรี แล้วซื้อเครดิตเมื่อจำเป็นต้องส่งออกเพิ่ม')
    await expect(page.locator('#pricing')).toContainText('คุ้มที่สุด')
    await expect(page.getByRole('button', { name: 'EN' })).toBeVisible()
  })

  test('mobile landing header and pricing do not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tools/mesh-splitter')

    await expect(page.getByText('Split oversized STL files into print-ready, labeled parts.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Launch MeshSplitter' }).first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    const headerBox = await page.locator('.lnd-header').boundingBox()
    expect(headerBox?.width).toBeLessThanOrEqual(390)
    await page.locator('#pricing').scrollIntoViewIfNeeded()
    await expect(page.locator('#pricing')).toContainText('Starter Credit Pack')
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
      await expect(page.locator('.app-shell')).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
      const canvasBox = await page.locator('.preview-canvas canvas').boundingBox()
      expect(canvasBox?.width).toBeGreaterThan(250)
      expect(canvasBox?.height).toBeGreaterThan(250)
    })
  }
})
