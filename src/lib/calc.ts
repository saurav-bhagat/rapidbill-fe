import { pct, type Paise } from './money'

export interface CalcLineInput {
  qty: number
  rate: Paise
  discPct: number
  gstPct: number
}

export interface CalcInput {
  lines: CalcLineInput[]
  /** false => no tax at all (internal challan without tax) */
  taxApplicable: boolean
  sellerState: string
  partyState: string | null
  billDiscount?: { type: 'PCT' | 'AMT'; value: number } // AMT is in paise
  roundOff: boolean
}

export interface CalcLine {
  gross: Paise
  discount: Paise
  /** after line discount and allocated bill discount */
  taxable: Paise
  tax: Paise
  cgst: Paise
  sgst: Paise
  igst: Paise
  total: Paise
}

export interface CalcResult {
  lines: CalcLine[]
  totalQty: number
  itemCount: number
  gross: Paise
  lineDiscount: Paise
  billDiscount: Paise
  taxable: Paise
  cgst: Paise
  sgst: Paise
  igst: Paise
  tax: Paise
  roundOff: Paise
  grandTotal: Paise
  interState: boolean
}

/** Pure voucher maths. Single source of truth for grid, saved snapshot and print. */
export function calcVoucher(input: CalcInput): CalcResult {
  // Unknown party state (cash counter) is treated as intra-state.
  const interState = input.partyState !== null && input.partyState !== input.sellerState

  const base = input.lines.map((l) => {
    const gross = Math.round(l.qty * l.rate)
    const discount = pct(gross, l.discPct)
    return { gross, discount, afterLine: gross - discount }
  })
  const subtotal = base.reduce((s, b) => s + b.afterLine, 0)

  let billDiscount = 0
  if (input.billDiscount && subtotal > 0) {
    billDiscount =
      input.billDiscount.type === 'PCT' ? pct(subtotal, input.billDiscount.value) : input.billDiscount.value
    billDiscount = Math.min(Math.max(billDiscount, 0), subtotal)
  }

  // Allocate bill discount proportionally; remainder lands on the last non-empty line.
  let allocated = 0
  const lastIdx = base.reduce((acc, b, i) => (b.afterLine > 0 ? i : acc), -1)
  const lines: CalcLine[] = base.map((b, i) => {
    let share = 0
    if (billDiscount > 0 && subtotal > 0) {
      share = i === lastIdx ? billDiscount - allocated : Math.round((billDiscount * b.afterLine) / subtotal)
      allocated += share
    }
    const taxable = b.afterLine - share
    const tax = input.taxApplicable ? pct(taxable, input.lines[i].gstPct) : 0
    const cgst = interState ? 0 : Math.floor(tax / 2)
    const sgst = interState ? 0 : tax - cgst
    const igst = interState ? tax : 0
    return { gross: b.gross, discount: b.discount, taxable, tax, cgst, sgst, igst, total: taxable + tax }
  })

  const sum = (f: (l: CalcLine) => number) => lines.reduce((s, l) => s + f(l), 0)
  const taxable = sum((l) => l.taxable)
  const tax = sum((l) => l.tax)
  const exact = taxable + tax
  const rounded = input.roundOff ? Math.round(exact / 100) * 100 : exact

  return {
    lines,
    totalQty: input.lines.reduce((s, l) => s + l.qty, 0),
    itemCount: input.lines.filter((l) => l.qty > 0).length,
    gross: sum((l) => l.gross),
    lineDiscount: sum((l) => l.discount),
    billDiscount,
    taxable,
    cgst: sum((l) => l.cgst),
    sgst: sum((l) => l.sgst),
    igst: sum((l) => l.igst),
    tax,
    roundOff: rounded - exact,
    grandTotal: rounded,
    interState,
  }
}
