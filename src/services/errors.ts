import en from '@/i18n/locales/en/errors.json'

export type ErrorKey = keyof typeof en
export type ErrorParams = Record<string, string | number>

/** English text for an error key. The UI translates by key; this is the fallback message and what tests/logs see. */
export function englishError(key: ErrorKey, params: ErrorParams = {}): string {
  return en[key].replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String(params[k] ?? ''))
}

/** An error the UI can show in any language: `key` + `params` index the `errors` catalogue. */
export class AppError extends Error {
  constructor(public key: ErrorKey, public params: ErrorParams = {}) {
    super(englishError(key, params))
    this.name = 'AppError'
  }
}
