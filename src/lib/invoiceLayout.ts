/**
 * Column widths for the items table of an invoice.
 *
 * Numbers, codes and HSN must never be cut in two ("14,250.0" / "0"), so every such column gets exactly the width its longest
 * value needs. The description takes everything that is left and wraps onto as many lines as it needs. If the description
 * would get less than a third of the row (many optional columns turned on), the text is made a little smaller first.
 * The same rules are in the web app's `src/lib/invoiceLayout.ts`.
 */
export interface ColSpec {
  head: string
  cells: string[]
  /** The description: takes the rest of the row and wraps. */
  grow?: boolean
  /** May wrap inside its own width (batch / expiry, unit). */
  wrap?: boolean
}
export type PaperSize = 'A4' | 'A5'

const PAGE_MM: Record<PaperSize, number> = { A4: 190, A5: 136 }
const FONTS: Record<PaperSize, number[]> = { A4: [11, 10, 9, 8.5], A5: [9, 8.5, 8, 7.5] }
const PX_PER_MM = 96 / 25.4
/** Widest a character can be, as a share of the font size (monospace digits are about 0.6). */
const CHAR = 0.62
/** Cell padding and border, in px. */
const CHROME = 10
const DESC_MIN = 0.3
/** A wrapping column is never asked to be wider than this many characters. */
const WRAP_CHARS = 9

const longestWord = (s: string) => Math.max(0, ...s.split(/[\s/]+/).map((w) => w.length))

export interface Layout {
  /** Percent of the row for each column, adding up to 100. */
  widths: number[]
  /** Font size of the table, in px. */
  font: number
  /** Even the smallest text did not leave room: let every cell break words instead of overflowing. */
  tight: boolean
}

export function layoutColumns(cols: ColSpec[], paper: PaperSize): Layout {
  const page = PAGE_MM[paper] * PX_PER_MM
  const need = (c: ColSpec, font: number) => {
    const head = longestWord(c.head) * 1.15 // headings are bold
    const chars = c.wrap ? Math.min(WRAP_CHARS, Math.max(head, ...c.cells.map(longestWord))) : Math.max(head, ...c.cells.map((x) => x.length))
    return chars * font * CHAR + CHROME
  }
  let last: Layout | undefined
  for (const font of FONTS[paper]) {
    const px = cols.map((c) => (c.grow ? 0 : need(c, font)))
    const rest = page - px.reduce((a, b) => a + b, 0)
    const widths = px.map((p, i) => (cols[i].grow ? (rest / page) * 100 : (p / page) * 100))
    last = { widths, font, tight: false }
    if (rest / page >= DESC_MIN) return last
  }
  // Nothing fits at a readable size: squeeze the other columns so the description still gets its third, and let words break.
  const fixed = last!.widths.reduce((a, w, i) => a + (cols[i].grow ? 0 : w), 0)
  const k = (100 - DESC_MIN * 100) / fixed
  return { widths: last!.widths.map((w, i) => (cols[i].grow ? DESC_MIN * 100 : w * k)), font: last!.font, tight: true }
}
