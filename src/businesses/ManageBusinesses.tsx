import { useEffect, useState } from 'react'
import { Check, Pencil, Palette, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/session'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { errorText } from '@/lib/errors'
import { stateName } from '@/lib/gst'
import { longDate } from '@/license/format'
import { toast } from '@/store/toast'
import { patchBusiness } from './api'
import { BusinessAvatar } from './BusinessAvatar'
import { openBusiness } from './BusinessSwitcher'
import { BUSINESS_COLOR, colorOf, useBusinesses, type BusinessRow } from './store'

/** Every business of the person, with the things an owner changes about one: its name and its colour. */
export function ManageBusinesses() {
  const { t } = useTranslation('business')
  const { t: tr } = useTranslation()
  const { list, load, setAddOpen } = useBusinesses()
  const [rename, setRename] = useState<BusinessRow>()
  const [colour, setColour] = useState<BusinessRow>()
  useEffect(() => { void load() }, [load])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">{t('manage.title')}</h2>
          <p className="text-ink-600">{t('manage.sub')}</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>{t('add.title')}</Button>
      </div>

      <ul className="space-y-3" aria-label={t('manage.title')}>
        {list.map((b) => (
          <li key={b.id} className="rounded-xl border border-line bg-surface p-4" style={{ borderLeft: `4px solid ${colorOf(b.color)}` }}>
            <div className="flex flex-wrap items-center gap-4">
              <BusinessAvatar name={b.name} color={b.color} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-lg font-medium">{b.name}</span>
                  {b.current && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">{t('manage.open')}</span>}
                </div>
                <p className="text-sm text-ink-600">{[b.stateCode ? stateName(b.stateCode) : '', t(`role.${b.role}`), b.createdAt ? t('manage.created', { date: longDate(b.createdAt) }) : ''].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {b.role === 'OWNER' && <Button icon={<Pencil size={14} />} onClick={() => setRename(b)} aria-label={`${t('manage.rename')}: ${b.name}`}>{t('manage.rename')}</Button>}
                {b.role === 'OWNER' && <Button icon={<Palette size={14} />} onClick={() => setColour(b)} aria-label={`${t('manage.colour')}: ${b.name}`}>{t('manage.colour')}</Button>}
                {!b.current && <Button variant="primary" onClick={() => void openBusiness(b, tr)} aria-label={`${t('manage.openAction')}: ${b.name}`}>{t('manage.openAction')}</Button>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {rename && <RenameDialog b={rename} onClose={() => setRename(undefined)} />}
      {colour && <ColourDialog b={colour} onClose={() => setColour(undefined)} />}
    </div>
  )
}

const afterChange = async (id: string, name?: string) => {
  await useBusinesses.getState().load()
  if (name && useAuth.getState().workspace?.id === id) useAuth.setState((s) => ({ workspace: s.workspace ? { ...s.workspace, name } : s.workspace }))
}

function RenameDialog({ b, onClose }: { b: BusinessRow; onClose: () => void }) {
  const { t } = useTranslation('business')
  const { t: tr } = useTranslation()
  const [name, setName] = useState(b.name)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    try { await patchBusiness(b.id, { name: n }); await afterChange(b.id, n); toast.success(t('manage.renamed')); onClose() }
    catch (e) { toast.error(errorText(tr, e)); setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={t('manage.rename')} width="420px" footer={<><Button onClick={onClose}>{t('add.cancel')}</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={() => void save()}>{t('manage.save')}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label={t('add.name')}><Input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
      </form>
    </Modal>
  )
}

function ColourDialog({ b, onClose }: { b: BusinessRow; onClose: () => void }) {
  const { t } = useTranslation('business')
  const { t: tr } = useTranslation()
  const [busy, setBusy] = useState(false)
  const pick = async (key: string) => {
    if (busy) return
    setBusy(true)
    try { await patchBusiness(b.id, { color: key }); await afterChange(b.id); onClose() }
    catch (e) { toast.error(errorText(tr, e)); setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={t('manage.colour')} width="420px">
      <div role="radiogroup" aria-label={t('manage.colour')} className="grid grid-cols-4 gap-3">
        {Object.keys(BUSINESS_COLOR).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={b.color === k} aria-label={t(`colours.${k}`)} disabled={busy} onClick={() => void pick(k)}
            className={`flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs ${b.color === k ? 'border-primary ring-2 ring-primary' : 'border-line hover:bg-sunken'}`}>
            <span className="grid h-7 w-7 place-items-center rounded-md text-white" style={{ background: BUSINESS_COLOR[k] }}>{b.color === k && <Check size={16} />}</span>
            {t(`colours.${k}`)}
          </button>
        ))}
      </div>
    </Modal>
  )
}
