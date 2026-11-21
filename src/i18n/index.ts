import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export type Lang = 'en' | 'hi'
export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हिं' },
]
export const NAMESPACES = ['common', 'shortcuts', 'home', 'billing', 'register', 'inventory', 'import', 'parties', 'settings', 'invoice', 'errors', 'auth', 'partyImport'] as const
export type Namespace = (typeof NAMESPACES)[number]

const STORAGE_KEY = 'rapidbill:ui-lang'
const isLang = (v: unknown): v is Lang => v === 'en' || v === 'hi'

// English ships in the main bundle (it is the fallback). Other languages are separate chunks fetched on demand.
const english = import.meta.glob('./locales/en/*.json', { eager: true, import: 'default' }) as Record<string, object>
const others = import.meta.glob(['./locales/*/*.json', '!./locales/en/*.json'], { import: 'default' }) as Record<string, () => Promise<object>>

const nsOf = (path: string) => path.split('/').pop()!.replace('.json', '')

/** Make sure every catalogue for `lng` is registered. Safe to call repeatedly. */
export async function loadLocale(lng: Lang): Promise<void> {
  if (lng === 'en') return
  const jobs = Object.entries(others)
    .filter(([path]) => path.includes(`/locales/${lng}/`))
    .map(async ([path, load]) => {
      const ns = nsOf(path)
      if (!i18n.hasResourceBundle(lng, ns)) i18n.addResourceBundle(lng, ns, await load(), true, true)
    })
  await Promise.all(jobs)
}

export function savedLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (isLang(v)) return v
  } catch { /* storage blocked: fall through */ }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en'
}

export async function setLang(lng: Lang): Promise<void> {
  await loadLocale(lng)
  await i18n.changeLanguage(lng)
  try { localStorage.setItem(STORAGE_KEY, lng) } catch { /* ignore */ }
  document.documentElement.lang = lng
}

/** Call once before first render. `extra` = other languages needed right away (e.g. the invoice print language). */
export async function initI18n(extra: Lang[] = []): Promise<void> {
  const resources: Record<string, Record<string, object>> = { en: {} }
  for (const [path, mod] of Object.entries(english)) resources.en[nsOf(path)] = mod
  const lng = savedLang()
  await i18n.use(initReactI18next).init({
    resources, lng: 'en', fallbackLng: 'en', ns: [...NAMESPACES], defaultNS: 'common',
    interpolation: { escapeValue: false }, returnNull: false,
  })
  await Promise.all([lng, ...extra].map(loadLocale))
  await i18n.changeLanguage(lng)
  document.documentElement.lang = lng
}

export default i18n
