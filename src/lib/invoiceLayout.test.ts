import { describe, expect, it } from 'vitest'
import { layoutColumns, type ColSpec } from './invoiceLayout'

const col = (head: string, cells: string[], o: Partial<ColSpec> = {}): ColSpec => ({ head, cells, ...o })
const dense = (): ColSpec[] => [
  col('#', ['1', '2']), col('Description', ['Havells FR PVC insulated copper wire 90 metre coil red colour heavy duty', 'Switch 6A'], { grow: true }),
  col('HSN', ['85011019', '3004']), col('Batch / Exp', ['BATCH-2026-A / 12/28', ''], { wrap: true }), col('Qty', ['12', '1']), col('Unit', ['PCS', 'PCS'], { wrap: true }),
  col('MRP', ['1,500.00', '210.00']), col('Rate', ['1,250.00', '190.00']), col('Disc%', ['5', '-']), col('Taxable', ['14,250.00', '190.00']), col('GST%', ['18%', '12%']), col('Total', ['16,815.00', '212.80']),
]

describe('invoice column layout', () => {
  it('adds up to 100% and keeps at least 30% for the description', () => {
    for (const paper of ['A4', 'A5'] as const) {
      const l = layoutColumns(dense(), paper)
      expect(l.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5)
      expect(l.widths[1]).toBeGreaterThanOrEqual(29.9)
    }
  })
  it('gives each number column room for its longest value, so no number is split', () => {
    const l = layoutColumns(dense(), 'A4')
    const page = 190 * (96 / 25.4)
    const total = (l.widths[11] / 100) * page // "16,815.00" is 9 characters
    expect(total).toBeGreaterThan(9 * l.font * 0.6)
  })
  it('uses the full size text when there is room (few columns)', () => {
    const few = [col('#', ['1']), col('Description', ['Rice'], { grow: true }), col('Qty', ['2']), col('Rate', ['50.00']), col('Total', ['100.00'])]
    const l = layoutColumns(few, 'A4')
    expect(l.font).toBe(11)
    expect(l.widths[1]).toBeGreaterThan(60)
    expect(l.tight).toBe(false)
  })
  it('makes the text smaller before it squeezes the description', () => {
    const l = layoutColumns(dense(), 'A4')
    expect(l.font).toBeLessThan(11)
  })
  it('falls back to breaking words when even the smallest text cannot fit (huge numbers on A5)', () => {
    const wide = dense().map((c) => (c.grow ? c : { ...c, cells: c.cells.map((x) => `${x}1234567890`) }))
    const l = layoutColumns(wide, 'A5')
    expect(l.tight).toBe(true)
    expect(l.widths[1]).toBeCloseTo(30, 5)
    expect(l.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5)
  })
})
