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

// Once a mesh is loaded the dropzone is replaced by a "Replace file" button, so
// swapping the file goes through that button rather than the initial dropzone.
async function replaceStl(page) {
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Replace file' }).click()
  await (await fc).setFiles(TEST_STL)
}

async function setBuildVolume(page, x, y, z) {
  await page.locator('#build-volume-X').fill(String(x))
  await page.locator('#build-volume-Y').fill(String(y))
  await page.locator('#build-volume-Z').fill(String(z))
}

async function selectConnector(page, label) {
  await page.locator('.conn-select-trigger').click()
  await expect(page.locator('[role="listbox"]')).toBeVisible()
  await page.locator('[role="option"]').filter({ hasText: label }).click()
}

async function splitWithExplicitNoConnectors(page) {
  await selectConnector(page, 'None')
  await page.getByRole('button', { name: 'Split' }).click()
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
    await expect(page.getByRole('button', { name: /Download package/ })).toBeDisabled()
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

    async function selectPreset(label) {
      await preset.click()
      await expect(page.locator('.bv-select-menu')).toBeVisible()
      await page.locator('.bv-option').filter({ hasText: label }).click()
    }

    await selectPreset('Bambu Lab X1C / X1 / A1')
    await expect(xInput).toHaveValue('256')
    await expect(yInput).toHaveValue('256')
    await expect(zInput).toHaveValue('250')

    await selectPreset('Prusa MK4 / MK4S')
    await expect(xInput).toHaveValue('250')
    await expect(yInput).toHaveValue('210')
    await expect(zInput).toHaveValue('220')

    await selectPreset('Prusa XL')
    await expect(xInput).toHaveValue('360')
    await expect(yInput).toHaveValue('360')
    await expect(zInput).toHaveValue('360')
  })

  test('scale workflow updates mesh bounds before splitting', async ({ page }) => {
    await uploadTestStl(page)
    const inspector = page.locator('.canvas-inspector')
    await expect(inspector).toContainText('100 × 100 × 100 mm', { timeout: 10000 })

    // Scale is driven by entering a target dimension (presets were removed):
    // doubling the X size on a 100 mm cube scales the whole mesh 2x uniformly.
    await page.locator('#scale-size-x').fill('200')
    await expect(inspector).toContainText('200 × 200 × 200 mm')
    await expect(inspector).toContainText('2.000x')
  })

  test('split mesh with default 1x1x1 grid', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Split' }).click()

    await expect(page.locator('.parts-panel')).toContainText('1 total', { timeout: 15000 })
    await expect(page.getByText('P01-X0Y0Z0').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Download package/ })).toBeEnabled()
  })

  test('split counts are calculated from build volume and cannot be manually edited', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[role="slider"]')).toHaveCount(0)
    // X/Y reserve a 15 mm support margin per side, so the usable footprint of a
    // 50 mm build volume is 20 mm → ceil(100 / 20) = 5 divisions. Z keeps the
    // full 100 mm → 1 division.
    await setBuildVolume(page, 50, 50, 100)
    await expect(page.locator('.col-right .pnl-meta').last()).toContainText('5×5×1')

    await page.getByRole('button', { name: 'Split' }).click()

    await expect(page.locator('.parts-panel')).toContainText('25 total', { timeout: 15000 })
    await expect(page.getByText('P25-X4Y4Z0').first()).toBeVisible()
  })

  test('explicit None connector requires confirmation before splitting', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })

    await splitWithExplicitNoConnectors(page)

    await expect(page.locator('.parts-panel')).toContainText('1 total', { timeout: 15000 })
  })

  test('connector workflow keeps parts available for export', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })
    // 100 mm build volume minus the 30 mm X support margin → 70 mm usable →
    // ceil(100 / 70) = 2 on X; Y/Z stay at 1. A minimal 2-part split.
    await setBuildVolume(page, 100, 200, 200)
    await expect(page.locator('.col-right .pnl-meta').last()).toContainText('2×1×1')
    await selectConnector(page, 'Dowel')
    await page.getByRole('button', { name: 'Split mesh' }).click()
    await expect(page.locator('.parts-panel')).toContainText('2 total', { timeout: 15000 })
    // The split + connector workflow completes and leaves the parts exportable.
    await expect(page.getByRole('button', { name: /Download package/ })).toBeEnabled({ timeout: 15000 })
  })

  test('download package zip after split', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Split' }).click()
    await expect(page.locator('.parts-panel')).toContainText('1 total', { timeout: 15000 })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download package/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.zip')
  })

  test('swap STL file clears previous results', async ({ page }) => {
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Split' }).click()
    await expect(page.locator('.parts-panel')).toContainText('1 total', { timeout: 15000 })

    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]')
      if (input) input.value = ''
    })

    await replaceStl(page)

    await expect(page.locator('.parts-panel')).toContainText('0 total', { timeout: 10000 })
    await expect(page.getByText('No parts yet. Upload and split a mesh.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Download package/ })).toBeDisabled()
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
    // A "Sign in" click from the landing page returns the customer into the app
    // (/tools/mesh-splitter/app), not back to the marketing landing page.
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
      'href',
      'https://shop.maliev.com/customer_authentication/login?return_to=%2Ftools%2Fmesh-splitter%2Fapp',
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

test.describe('mobile layout', () => {
  // Regression: on mobile the parts list and the accordion config share one
  // scroll region (.cols-stack). If the columns are allowed to flex-shrink, the
  // overflow:visible parts rows escape their shrunken box and paint over the
  // accordion below instead of scrolling. Assert no part row overlaps any
  // accordion section.
  test('parts list does not overlap the config accordion', async ({ page }) => {
    // Split into many parts at desktop width (controls are directly visible),
    // then switch to a mobile viewport to exercise the stacked scroll layout.
    await page.goto('/')
    await uploadTestStl(page)
    await expect(page.locator('.canvas-inspector')).toBeVisible({ timeout: 10000 })
    // A small build volume forces many parts — enough to overflow the mobile
    // scroll region, which is the condition that triggers the overlap.
    await setBuildVolume(page, 50, 50, 100)
    await page.getByRole('button', { name: 'Split' }).click()
    await expect.poll(() => page.locator('.pl-row').count(), { timeout: 20000 })
      .toBeGreaterThan(8)

    await page.setViewportSize({ width: 390, height: 844 })
    // Let the layout settle and confirm we're in the mobile (accordion) layout.
    await expect(page.locator('.acc-section').first()).toBeVisible()

    const overlap = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.pl-row')]
      const sections = [...document.querySelectorAll('.acc-section')]
      const intersects = (a, b) =>
        a.left < b.right - 1 && a.right > b.left + 1 &&
        a.top < b.bottom - 1 && a.bottom > b.top + 1
      for (const row of rows) {
        const r = row.getBoundingClientRect()
        for (const sec of sections) {
          const s = sec.getBoundingClientRect()
          if (intersects(r, s)) {
            return { overlap: true, row: row.textContent.trim().slice(0, 20) }
          }
        }
      }
      return { overlap: false }
    })
    expect(overlap.overlap, `part row "${overlap.row}" overlaps the config accordion`).toBe(false)
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
