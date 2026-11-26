import { Check, FileText, IndianRupee, Package, Percent, Wifi } from 'lucide-react'

/** Pictures of the product, drawn in code so they are sharp on every screen and always match the real app. */

export function DashboardMock() {
  const bars = [30, 55, 38, 70, 48, 92, 62]
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]">
      <div className="flex items-center gap-1.5 border-b border-line bg-sunken px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff6159]" /><span className="h-3 w-3 rounded-full bg-[#ffbd2e]" /><span className="h-3 w-3 rounded-full bg-[#28c940]" />
        <span className="ml-4 rounded-md bg-white px-3 py-1 text-xs text-ink-400">therapidbill.in</span>
      </div>
      <div className="flex">
        <div className="hidden w-36 shrink-0 space-y-1.5 bg-nav p-3 sm:block">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><span className="grid h-6 w-6 place-items-center rounded-md bg-white text-xs text-primary">₹</span>RapidBill</div>
          {['Home', 'New Bill', 'Bills', 'Stock', 'Parties'].map((x, i) => (
            <div key={x} className={`rounded-md px-2.5 py-1.5 text-xs ${i === 0 ? 'bg-white/15 font-semibold text-white' : 'text-white/60'}`}>{x}</div>
          ))}
        </div>
        <div className="min-w-0 flex-1 bg-paper p-4">
          <div className="mb-3 text-sm font-bold text-ink-900">Shree Ganesh Traders</div>
          <div className="grid grid-cols-3 gap-2.5">
            {[{ l: "Today's sales", v: '₹18,450', i: IndianRupee, c: 'bg-primary-soft text-primary' }, { l: 'Bills today', v: '24', i: FileText, c: 'bg-ok-soft text-ok' }, { l: 'GST this month', v: '₹41,200', i: Percent, c: 'bg-warn-soft text-warn' }].map((k) => (
              <div key={k.l} className="rounded-xl border border-line bg-white p-2.5">
                <div className="flex items-center justify-between"><span className="text-[10px] text-ink-600">{k.l}</span><span className={`grid h-5 w-5 place-items-center rounded-md ${k.c}`}><k.i size={11} /></span></div>
                <div className="mt-1.5 text-base font-bold tracking-tight">{k.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 rounded-xl border border-line bg-white p-3">
            <div className="mb-2 text-[11px] font-semibold">Sales this week</div>
            <div className="flex h-24 items-end gap-2">
              {bars.map((h, i) => <div key={i} className={`flex-1 rounded-t-md ${i === 5 ? 'bg-primary' : 'bg-primary/25'}`} style={{ height: `${h}%` }} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PhoneMock({ className = '' }: { className?: string }) {
  const rows = [['Dettol Soap 125g', '4 × ₹52', '₹208'], ['Surf Excel 1kg', '2 × ₹135', '₹270'], ['Parle-G 800g', '5 × ₹60', '₹300']]
  return (
    <div className={`w-[210px] rounded-[2rem] border-[7px] border-slate-900 bg-white shadow-[0_30px_60px_-15px_rgba(15,23,42,0.5)] ${className}`}>
      <div className="mx-auto mt-1.5 h-4 w-16 rounded-full bg-slate-900" />
      <div className="space-y-2.5 p-3.5">
        <div className="flex items-center justify-between"><span className="text-xs font-bold">New Bill</span><span className="flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[9px] font-semibold text-ok"><Wifi size={9} />Offline OK</span></div>
        <div className="rounded-lg bg-sunken px-2.5 py-2 text-[10px] text-ink-600">Customer: <b className="text-ink-900">Mehta Stores</b></div>
        {rows.map((r) => (
          <div key={r[0]} className="flex items-center justify-between border-b border-line pb-1.5">
            <div><div className="text-[11px] font-semibold">{r[0]}</div><div className="text-[9px] text-ink-400">{r[1]}</div></div>
            <div className="text-[11px] font-bold">{r[2]}</div>
          </div>
        ))}
        <div className="flex justify-between text-[10px] text-ink-600"><span>GST 18%</span><span>₹140</span></div>
        <div className="flex items-end justify-between"><span className="text-[10px] text-ink-600">Total</span><span className="text-xl font-extrabold">₹918</span></div>
        <div className="rounded-lg bg-primary py-2 text-center text-[11px] font-bold text-white">Save &amp; Share</div>
      </div>
    </div>
  )
}

export function BillMock() {
  const rows = [['Dettol Soap 125g', '60', '52.00', '18%', '3,120.00'], ['Surf Excel Easy Wash 1kg', '24', '135.00', '18%', '3,240.00'], ['Parle-G Biscuit 800g', '20', '85.00', '5%', '1,700.00'], ['A4 Copier Paper Ream', '5', '295.00', '12%', '1,475.00']]
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.3)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div><div className="text-sm font-bold">Tax Invoice · SI-2627-0042</div><div className="text-xs text-ink-600">Apollo Pharmacy, Koramangala</div></div>
        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">GST ready</span>
      </div>
      <div className="grid grid-cols-[1fr_44px_64px_44px_80px] gap-x-2 bg-sunken px-5 py-2 text-[11px] font-semibold text-ink-600"><span>Item</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">GST</span><span className="text-right">Amount</span></div>
      {rows.map((r) => (
        <div key={r[0]} className="grid grid-cols-[1fr_44px_64px_44px_80px] gap-x-2 border-b border-line px-5 py-2.5 text-xs">
          <span className="truncate font-medium">{r[0]}</span><span className="text-right tabular-nums">{r[1]}</span><span className="text-right tabular-nums">{r[2]}</span><span className="text-right tabular-nums">{r[3]}</span><span className="text-right font-semibold tabular-nums">{r[4]}</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-ok"><Check size={14} />Stock updated automatically</div>
        <div className="text-right"><div className="text-[11px] text-ink-600">Grand total</div><div className="text-2xl font-extrabold tracking-tight">₹10,939.00</div></div>
      </div>
    </div>
  )
}

export function StockMock() {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Package size={16} className="text-primary" />Stock alerts</div>
      {[['Digene Gel Mint 200ml', '0 left', 'bg-danger-soft text-danger'], ['LED Bulb 9W', '4 left', 'bg-warn-soft text-warn'], ['Azithromycin 500mg', '8 left', 'bg-warn-soft text-warn']].map((r) => (
        <div key={r[0]} className="flex items-center justify-between border-t border-line py-2 text-sm"><span>{r[0]}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r[2]}`}>{r[1]}</span></div>
      ))}
    </div>
  )
}
