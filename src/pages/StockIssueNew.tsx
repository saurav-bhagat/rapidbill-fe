import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom'
import { blankRow, billableRows, parseBillDiscount, parseDisc, parseQty, parseRate, repriceRows, rowStatus, rupeesText, usageByItem, type Row } from '@/lib/billing'
import { calcVoucher, type CalcLine } from '@/lib/calc'
import { formatAmount, formatINR, todayISO } from '@/lib/format'
import { stateName } from '@/lib/gst'
import { useHotkey } from '@/lib/hotkeys'
import { useAsync } from '@/lib/useAsync'
import { BillingError, services, type Item, type PaymentStatus, type Party, type Voucher, type VoucherMode } from '@/services'
import { toast } from '@/store/toast'
import { errorText } from '@/lib/errors'
import { BillingGrid, type GridHandle } from '@/components/billing/BillingGrid'
import { PartyCombobox } from '@/components/billing/PartyCombobox'
import { RowContext } from '@/components/billing/RowContext'
import { TotalsFooter } from '@/components/billing/TotalsFooter'
import { ItemFormDrawer } from '@/components/inventory/ItemFormDrawer'
import { PartyFormDrawer } from '@/components/parties/PartyFormDrawer'
import { PrintPreviewModal } from '@/components/print/PrintPreviewModal'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Segmented } from '@/components/ui/Segmented'

const input = 'h-8 rounded border border-line bg-surface px-2 text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

/** New voucher, or (editId) edit an existing one, or (?from=id) duplicate one. */
export function StockIssueNew({ editId }: { editId?: string }) {
  const { t } = useTranslation('billing')
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const fromId = editId ? undefined : sp.get('from') ?? undefined
  const sourceId = editId ?? fromId
  const { data: source, loading: sourceLoading } = useAsync(() => (sourceId ? services.vouchers.get(sourceId) : Promise.resolve(undefined)), [sourceId])
  const { data: rawItems = [], reload: reloadItems } = useAsync(() => services.items.list())
  const items = useMemo<Item[]>(() => {
    // while editing, the old version's quantities are about to be put back, so they count as available
    if (!editId || !source) return rawItems
    const back = new Map<string, number>()
    source.lines.forEach((l) => back.set(l.itemId, (back.get(l.itemId) ?? 0) + l.qty))
    return rawItems.map((i) => (back.has(i.id) ? { ...i, currentStock: i.currentStock + back.get(i.id)! } : i))
  }, [rawItems, source, editId])
  const { data: parties = [], reload: reloadParties } = useAsync(() => services.parties.list())
  const { data: settings } = useAsync(() => services.settings.get())

  const [rows, setRows] = useState<Row[]>(() => [blankRow()])
  const [date, setDate] = useState(todayISO())
  const [number, setNumber] = useState('')
  const [numberTouched, setNumberTouched] = useState(false)
  const [mode, setMode] = useState<VoucherMode>('TAX_INVOICE')
  const [taxYes, setTaxYes] = useState(true)
  const [basis, setBasis] = useState<'SALE' | 'COST'>('SALE')
  const [partyId, setPartyId] = useState<string | null>(null)
  const [remarks, setRemarks] = useState('')
  const [billDisc, setBillDisc] = useState('')
  const [roundOff, setRoundOff] = useState(true)
  const [payment, setPayment] = useState<PaymentStatus>('PAID_CASH')
  const [active, setActive] = useState(0)
  const [flash, setFlash] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<Voucher>()
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; name: string; row: number }>({ open: false, name: '', row: 0 })
  const [partyDrawer, setPartyDrawer] = useState<{ open: boolean }>({ open: false })
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [baseline, setBaseline] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const hydratedFor = useRef<string | undefined>(undefined)
  const leaving = useRef(false)

  const grid = useRef<GridHandle>(null)
  const partyInput = useRef<HTMLInputElement>(null)
  const billDiscInput = useRef<HTMLInputElement>(null)
  const dateInput = useRef<HTMLInputElement>(null)
  const flashTimer = useRef<number>(0)
  const savingRef = useRef(false)
  const ready = !!settings

  const showFlash = useCallback((m: string) => {
    setFlash(m)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(''), 3500)
  }, [])

  // ---- first-load defaults from settings
  useEffect(() => {
    if (!settings || sourceId) return
    setMode(settings.defaultTaxMode)
    setPayment(settings.defaultTaxMode === 'CHALLAN' ? 'INTERNAL' : 'PAID_CASH')
    setRoundOff(settings.roundOffDefault)
    setTimeout(() => partyInput.current?.focus(), 0)
  }, [settings, sourceId])

  // ---- keep the auto voucher number fresh (until the user types their own)
  // The number lookup can finish after the bill being edited has loaded; its answer must never replace that bill's own number.
  const keepNumber = useRef(false)
  keepNumber.current = numberTouched || !!editId
  const refreshNumber = useCallback(async (d: string) => { const n = await services.billing.nextNumber(d); if (!keepNumber.current) setNumber(n) }, [])
  useEffect(() => { if (!numberTouched && !editId && /^\d{4}-\d{2}-\d{2}$/.test(date)) refreshNumber(date) }, [date, numberTouched, editId, refreshNumber, saved])

  // ---- edit / duplicate: fill the form from an existing voucher, once
  useEffect(() => {
    if (!sourceId || !source || !settings || hydratedFor.current === sourceId || rawItems.length === 0) return
    hydratedFor.current = sourceId
    setHydrated(true)
    const missing = source.lines.filter((l) => !items.some((i) => i.id === l.itemId)).length
    const filled: Row[] = source.lines.flatMap((l) => {
      const item = items.find((i) => i.id === l.itemId)
      return item ? [{ ...blankRow(), item, qty: String(l.qty), rate: rupeesText(l.rate), disc: l.discPct ? String(l.discPct) : '', rateTouched: true }] : []
    })
    const bdText = source.billDiscount ? (source.billDiscount.type === 'PCT' ? `${source.billDiscount.value}%` : rupeesText(source.billDiscount.value)) : ''
    setRows([...filled, blankRow()])
    setMode(source.mode); setTaxYes(source.taxApplicable); setBasis(source.rateBasis)
    setPartyId(source.partyId && parties.some((p) => p.id === source.partyId) ? source.partyId : null)
    setRemarks(source.remarks); setBillDisc(bdText); setPayment(source.payment)
    setRoundOff(source.totals.roundOff !== 0 ? true : settings.roundOffDefault)
    if (editId) { setDate(source.date); setNumber(source.number); setNumberTouched(true) }
    else { setDate(todayISO()); setNumberTouched(false) }
    const over = filled.filter((r) => r.item && parseQty(r.qty)! > r.item.currentStock).length
    if (missing) showFlash(t('flash.skipped', { count: missing }))
    else if (over) showFlash(t('flash.exceedCurrent', { count: over }))
  }, [sourceId, source, settings, rawItems.length, items, parties, editId, showFlash, t])

  const party: Party | undefined = parties.find((p) => p.id === partyId)
  const gstOn = settings?.gstEnabled !== false
  const effTax = gstOn && (mode === 'TAX_INVOICE' ? true : taxYes)

  // ---- totals: one pure function drives the grid, the footer and the saved snapshot
  const billable = useMemo(() => billableRows(rows), [rows])
  const bd = parseBillDiscount(billDisc)
  const calc = useMemo(
    () => calcVoucher({
      lines: billable.map((r) => ({ qty: parseQty(r.qty)!, rate: parseRate(r.rate) ?? 0, discPct: parseDisc(r.disc) ?? 0, gstPct: r.item.gstPercent })),
      taxApplicable: effTax, sellerState: settings?.stateCode ?? '29', partyState: party?.stateCode ?? null,
      billDiscount: bd && bd !== 'invalid' ? bd : undefined, roundOff,
    }),
    [billable, effTax, settings?.stateCode, party?.stateCode, bd, roundOff],
  )
  const lineCalc = useMemo(() => {
    const byKey = new Map<string, CalcLine>()
    billable.forEach((r, n) => byKey.set(r.key, calc.lines[n]))
    return rows.map((r) => byKey.get(r.key))
  }, [rows, billable, calc])

  const signature = JSON.stringify([rows.map((r) => [r.item?.id, r.qty, r.rate, r.disc]), partyId, remarks, billDisc, payment, mode, taxYes, basis, date, number, roundOff])
  // in edit mode the voucher is only "dirty" once it differs from what was loaded
  // runs in the render *after* the form was filled, so the signature already reflects the loaded voucher
  useEffect(() => { if (editId && hydrated && !baseline) setBaseline(signature) }, [editId, hydrated, signature, baseline])
  const dirty = editId
    ? !!baseline && signature !== baseline
    : rows.some((r) => r.item || r.query) || !!partyId || !!remarks.trim() || !!billDisc.trim()

  // ---- unsaved-work guards
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const resetForm = useCallback((focus = true) => {
    setRows([blankRow()]); setPartyId(null); setRemarks(''); setBillDisc(''); setNumberTouched(false)
    setDate(todayISO()); setActive(0); setFlash('')
    setPayment(mode === 'CHALLAN' ? 'INTERNAL' : 'PAID_CASH')
    refreshNumber(todayISO()) // the effect below won't re-run when the date didn't change, so refresh explicitly
    if (focus) setTimeout(() => partyInput.current?.focus(), 0)
  }, [mode, refreshNumber])

  // ---- header handlers
  const changeMode = (m: VoucherMode) => {
    setMode(m)
    if (m === 'TAX_INVOICE') { setBasis('SALE'); setRows((rs) => repriceRows(rs, 'SALE')); setPayment((p) => (p === 'INTERNAL' ? 'PAID_CASH' : p)) }
    else setPayment((p) => (p === 'PAID_CASH' ? 'INTERNAL' : p))
  }
  const changeBasis = (b: 'SALE' | 'COST') => { setBasis(b); setRows((rs) => repriceRows(rs, b)) }

  const firstBlank = () => Math.max(0, rows.findIndex((r) => !r.item))
  const goGrid = () => grid.current?.focusCell(firstBlank(), 'item')

  const removeRow = (i: number) => {
    if (!rows[i]) return
    const next = rows.filter((_, n) => n !== i)
    if (next.length === 0 || next[next.length - 1].item) next.push(blankRow())
    setRows(next)
    grid.current?.focusCell(Math.min(i, next.length - 1), 'item')
  }

  // ---- save
  const save = async (kind: 'print' | 'new') => {
    if (savingRef.current) return
    const bad = rows.findIndex((r) => r.item && parseQty(r.qty) === null)
    if (bad >= 0) { showFlash(t('flash.rowQty', { n: bad + 1 })); return grid.current?.focusCell(bad, 'qty') }
    if (billable.length === 0) { showFlash(t('flash.addItem')); return goGrid() }
    const badRate = billable.find((r) => parseRate(r.rate) === null)
    if (badRate) { showFlash(t('flash.badRate')); return grid.current?.focusCell(rows.indexOf(badRate), 'rate') }
    const badDisc = billable.find((r) => parseDisc(r.disc) === null)
    if (badDisc) { showFlash(t('flash.badDisc')); return grid.current?.focusCell(rows.indexOf(badDisc), 'disc') }
    if (bd === 'invalid') { showFlash(t('flash.badBillDisc')); return billDiscInput.current?.focus() }
    if (payment === 'CREDIT' && !partyId) { showFlash(t('flash.creditParty')); return partyInput.current?.focus() }

    savingRef.current = true
    setSaving(true)
    try {
      const payload = {
        number: numberTouched ? number : undefined, date, mode, taxApplicable: effTax, rateBasis: basis, partyId, remarks,
        lines: billable.map((r) => ({ itemId: r.item.id, qty: parseQty(r.qty)!, rate: parseRate(r.rate)!, discPct: parseDisc(r.disc)! })),
        billDiscount: bd, roundOff, payment,
      }
      const v = editId ? await services.billing.update(editId, payload) : await services.billing.save(payload)
      reloadItems(); reloadParties()
      if (editId) {
        leaving.current = true
        if (kind === 'print') setSaved(v)
        else { toast.success(t('toast.updated', { number: v.number, amount: formatAmount(v.totals.grandTotal) })); navigate('/issues') }
        return
      }
      resetForm(kind === 'new')
      if (fromId) setSp({}, { replace: true }) // leave duplicate mode
      if (kind === 'new') toast.success(t('toast.saved', { number: v.number, amount: formatAmount(v.totals.grandTotal) }))
      else setSaved(v)
    } catch (err) {
      if (err instanceof BillingError && err.code === 'STOCK') {
        showFlash(errorText(t, err))
        const s = err.shortages[0]
        const idx = rows.findIndex((r) => r.item?.id === s?.itemId)
        if (idx >= 0) grid.current?.focusCell(idx, 'qty')
      } else if (err instanceof BillingError && err.code === 'DUPLICATE_NUMBER') {
        showFlash(errorText(t, err))
      } else toast.error(errorText(t, err, t('toast.saveFailed')))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // ---- hotkeys (billing scope; paused automatically while a drawer/dialog is open)
  useHotkey('mod+s', () => save('print'), { scope: 'billing' })
  useHotkey('mod+w', () => save('print'), { scope: 'billing' })
  useHotkey('f10', () => save('print'), { scope: 'billing' })
  useHotkey('mod+enter', () => save('new'), { scope: 'billing' })
  useHotkey('f2', () => setQuickAdd({ open: true, name: rows[active]?.item ? '' : rows[active]?.query ?? '', row: active }), { scope: 'billing' })
  useHotkey('f4', () => billDiscInput.current?.focus(), { scope: 'billing' })
  useHotkey('alt+delete', () => removeRow(active), { scope: 'billing' })
  useHotkey('escape', () => {
    // an open picker owns Esc
    if (document.activeElement?.getAttribute('aria-expanded') === 'true') return false
    if (dirty) setConfirmDiscard(true)
    else return false
  }, { scope: 'billing' })

  const usage = usageByItem(rows)
  const overCount = rows.filter((r) => rowStatus(r, usage).shortBy).length

  if (!ready || (sourceId && sourceLoading)) return <div className="p-6 text-ink-400">{t('loading')}</div>
  if (sourceId && !source) return <div className="p-6 text-ink-600">{t('notFound')}</div>

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-3">
      {sourceId && source && (
        <div className="shrink-0 rounded-md border border-line bg-warn-soft px-4 py-2 text-sm text-warn">
          {editId
            ? <Trans t={t} i18nKey="banner.editing" values={{ number: source.number }} components={{ num: <span className="font-mono font-medium" /> }} />
            : <Trans t={t} i18nKey="banner.copied" values={{ number: source.number }} components={{ num: <span className="font-mono font-medium" /> }} />}
        </div>
      )}
      {/* ---- header */}
      <section className="shrink-0 rounded-md border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">{t('header.voucherNo')}</span>
            <input
              value={number}
              onChange={(e) => { setNumber(e.target.value); setNumberTouched(true) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); dateInput.current?.focus() } }}
              className={`${input} w-40 font-mono`}
              aria-label={t('header.voucherNumber')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">{t('header.issueDate')}</span>
            <input
              ref={dateInput}
              type="date"
              value={date}
              max="2099-12-31"
              onChange={(e) => e.target.value && setDate(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); partyInput.current?.focus() } }}
              className={`${input} w-40 font-mono`}
              aria-label={t('header.issueDate')}
            />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-ink-600">{t('header.voucherType')}</span>
            <Segmented label={t('header.voucherType')} value={mode} onChange={changeMode} options={[{ value: 'TAX_INVOICE', label: gstOn ? t('header.taxInvoiceGst') : t('header.invoice') }, { value: 'CHALLAN', label: t('header.challan') }]} />
          </div>
          {mode === 'CHALLAN' && (
            <>
              {gstOn && <div>
                <span className="mb-1 block text-sm font-medium text-ink-600">{t('header.tax')}</span>
                <Segmented label={t('header.tax')} value={taxYes ? 'YES' : 'NO'} onChange={(v) => setTaxYes(v === 'YES')} options={[{ value: 'YES', label: t('header.yes') }, { value: 'NO', label: t('header.no') }]} />
              </div>}
              <div>
                <span className="mb-1 block text-sm font-medium text-ink-600">{t('header.issueAt')}</span>
                <Segmented label={t('header.rateBasis')} value={basis} onChange={changeBasis} options={[{ value: 'SALE', label: t('header.saleRate') }, { value: 'COST', label: t('header.costRate') }]} />
              </div>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="w-[26rem]">
            <span className="mb-1 block text-sm font-medium text-ink-600">{t('header.partyRecipient')}</span>
            <PartyCombobox
              parties={parties}
              value={partyId}
              onChange={setPartyId}
              onNew={() => setPartyDrawer({ open: true })}
              onDone={goGrid}
              inputRef={partyInput}
            />
          </div>
          <div className="flex h-8 items-center gap-2 text-sm text-ink-600">
            {party ? (
              <>
                {gstOn && <><span className="font-mono">{party.gstin || t('header.unregistered')}</span><span>·</span><span>{stateName(party.stateCode)}</span></>}
                {gstOn && <Badge tone={calc.interState ? 'warn' : 'ok'}>{!effTax ? t('header.noTax') : calc.interState ? t('header.interState') : t('header.intraState')}</Badge>}
                {party.balance !== 0 && <span>{t('header.balance')} <span className="font-mono text-ink-900">{formatINR(Math.abs(party.balance))} {party.balance > 0 ? t('header.dr') : t('header.cr')}</span></span>}
              </>
            ) : <span className="text-ink-400">{t('header.counterSale')}</span>}
          </div>
          <label className="block min-w-[14rem] flex-1">
            <span className="mb-1 block text-sm font-medium text-ink-600">{t('header.remarksLabel')}</span>
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goGrid() } }}
              placeholder={t('header.remarksPlaceholder')}
              className={`${input} w-full`}
              aria-label={t('header.remarks')}
            />
          </label>
        </div>
      </section>

      {/* ---- grid */}
      <BillingGrid
        ref={grid}
        rows={rows}
        setRows={setRows}
        items={items}
        basis={basis}
        blockOverIssue={false}
        taxApplicable={effTax}
        showGst={gstOn}
        lineCalc={lineCalc}
        onActive={setActive}
        onRemove={removeRow}
        onMessage={showFlash}
      />
      <RowContext row={rows[active]} flash={flash || (overCount ? t('flash.exceedAvailable', { count: overCount }) : '')} />

      <TotalsFooter
        ref={billDiscInput}
        calc={calc}
        taxApplicable={effTax}
        gstEnabled={gstOn}
        billDisc={billDisc}
        onBillDisc={setBillDisc}
        onBillDiscEnter={() => grid.current?.focusCell(Math.max(0, rows.length - 1), 'item')}
        billDiscInvalid={bd === 'invalid'}
        roundOff={roundOff}
        onRoundOff={setRoundOff}
        payment={payment}
        onPayment={setPayment}
        saving={saving}
        onSavePrint={() => save('print')}
        onSaveNew={() => save('new')}
        onDiscard={() => (dirty ? setConfirmDiscard(true) : undefined)}
      />

      {/* ---- overlays */}
      <ItemFormDrawer
        open={quickAdd.open}
        initialName={quickAdd.name}
        existingItems={items}
        onClose={() => setQuickAdd((q) => ({ ...q, open: false }))}
        onSaved={(item) => {
          setQuickAdd((q) => ({ ...q, open: false }))
          reloadItems()
          const r = rows[quickAdd.row]
          if (r && !r.item) grid.current?.pickItem(quickAdd.row, item)
          else toast.info(t('toast.itemAdded', { name: item.name }))
        }}
      />
      <PartyFormDrawer
        open={partyDrawer.open}
        existing={parties}
        defaultState={settings.stateCode}
        onClose={() => { setPartyDrawer({ open: false }); partyInput.current?.focus() }}
        onSaved={(p) => { setPartyDrawer({ open: false }); reloadParties(); setPartyId(p.id); goGrid() }}
      />
      <PrintPreviewModal
        voucher={saved}
        settings={settings}
        banner={saved ? t('print.saved', { number: saved.number }) : undefined}
        closeLabel={editId ? t('print.backToRegister') : t('print.newVoucher')}
        onClose={() => { setSaved(undefined); if (editId) navigate('/issues'); else setTimeout(() => partyInput.current?.focus(), 0) }}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title={editId ? t('discard.titleEdit') : t('discard.titleNew')}
        confirmLabel={t('discard.confirm')}
        danger
        onConfirm={() => { setConfirmDiscard(false); if (editId) { leaving.current = true; navigate('/issues') } else resetForm() }}
        onCancel={() => setConfirmDiscard(false)}
      >
        {editId ? t('discard.bodyEdit') : t('discard.bodyNew')}
      </ConfirmDialog>
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('leave.title')}
        confirmLabel={t('leave.confirm')}
        danger
        onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
        onCancel={() => blocker.state === 'blocked' && blocker.reset()}
      >
        {t('leave.body')}
      </ConfirmDialog>
    </div>
  )
}
