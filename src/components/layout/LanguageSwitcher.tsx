import { useTranslation } from 'react-i18next'
import { LANGS, setLang } from '@/i18n'

/** Two-option switch for the screen language. Saved in this browser; the invoice print language is a separate setting. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  return (
    <div role="group" aria-label={t('language.label')} className="flex h-8 items-center rounded border border-line bg-surface p-0.5">
      {LANGS.map((l) => {
        const on = i18n.language === l.code
        return (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            aria-pressed={on}
            title={l.label}
            onClick={() => void setLang(l.code)}
            className={`h-6 min-w-[32px] rounded-sm px-2 text-sm font-medium ${on ? 'bg-primary text-white' : 'text-ink-600 hover:bg-sunken'}`}
          >
            {l.short}
          </button>
        )
      })}
    </div>
  )
}
