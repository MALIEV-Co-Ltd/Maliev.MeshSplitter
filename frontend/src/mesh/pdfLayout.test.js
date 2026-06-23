import { describe, it, expect } from 'vitest'
import { jsPDF } from 'jspdf'
import { PACKET_TEXT_LAYOUT } from './meshProcessor'

// jsPDF re-wraps any line wider than its column's maxWidth, spilling a hidden
// extra line that overlaps the next row / icon / card border. Each hand-broken
// packet line must therefore measure within its column at the layout font size.
describe('packet page-1 copy fits its columns', () => {
  const pdf = new jsPDF()
  pdf.setFont('helvetica', 'normal')

  for (const block of PACKET_TEXT_LAYOUT) {
    it(`${block.label}: every line fits within ${block.maxWidth}mm`, () => {
      pdf.setFontSize(block.fontSize)
      for (const line of block.lines) {
        const width = pdf.getTextWidth(line)
        expect(width, `"${line}" (${width.toFixed(1)}mm)`).toBeLessThanOrEqual(block.maxWidth)
      }
    })
  }
})
