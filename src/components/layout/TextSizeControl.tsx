import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setTextScaleIndex, useTextScale } from '@/lib/textScale'

/** Smaller / reset / larger text, for people who find the default hard to read. Saved in this browser. */
export function TextSizeControl() {
  const { t } = useTranslation()
  const { index, scale, canShrink, canGrow, isDefault } = useTextScale()
  const btn = 'flex h-8 w-9 items-center justify-center rounded-sm text-ink-600 hover:bg-sunken disabled:opacity-40 disabled:hover:bg-transparent'
  return (
    <div role="group" aria-label={t('textSize.label')} className="flex h-9 items-center rounded border border-line bg-surface p-0.5">
      <button type="button" className={btn} disabled={!canShrink} onClick={() => setTextScaleIndex(index - 1)} aria-label={t('textSize.smaller')} title={t('textSize.smaller')}><Minus size={14} /></button>
      <button type="button" className="h-8 min-w-[52px] rounded-sm px-1 text-sm font-medium text-ink-600 hover:bg-sunken" disabled={isDefault} onClick={() => setTextScaleIndex(1)} aria-label={t('textSize.reset')} title={t('textSize.reset')}>{Math.round(scale * 100)}%</button>
      <button type="button" className={btn} disabled={!canGrow} onClick={() => setTextScaleIndex(index + 1)} aria-label={t('textSize.larger')} title={t('textSize.larger')}><Plus size={14} /></button>
    </div>
  )
}
