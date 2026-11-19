import { Trans, useTranslation } from 'react-i18next'
import { SHORTCUTS, CURRENT_PHASE } from '@/lib/shortcuts'
import { useUI } from '@/store/ui'
import { Modal } from '../ui/Modal'
import { Keycap } from '../ui/Keycap'

const GROUPS = ['Navigate', 'Billing', 'Lists', 'Dialogs'] as const

export function ShortcutsOverlay() {
  const { t } = useTranslation('shortcuts')
  const { shortcutsOpen, setShortcutsOpen } = useUI()
  return (
    <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title={t('title')} width="620px">
      <p className="mb-4 text-sm text-ink-600">
        <Trans t={t} i18nKey="intro" components={{ k: <Keycap combo="mod+s" className="mx-1" /> }} />
      </p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {GROUPS.map((g) => (
          <section key={g}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">{t(`group.${g}`)}</h3>
            <ul className="space-y-1">
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <li key={s.id} className={`flex items-start justify-between gap-3 ${s.phase > CURRENT_PHASE ? 'opacity-45' : ''}`}>
                  <span className="text-base">{t(`desc.${s.id}`)}</span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <Keycap combo={s.combo} />
                    {s.alt?.map((a) => <Keycap key={a} combo={a} />)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
