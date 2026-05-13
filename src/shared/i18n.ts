import type { PreferredLanguage } from './contracts'
import { enUS } from './locales/en-US'
import { zhCN } from './locales/zh-CN'

export type Locale = 'en-US' | 'zh-CN'
export type TranslationValues = Record<string, string | number>
export type Translator = (key: string, values?: TranslationValues) => string

const translations: Record<Locale, Record<string, string>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
}

export function resolveLocale(
  preferredLanguage: PreferredLanguage,
  systemLanguage = typeof navigator === 'undefined' ? 'en-US' : navigator.language,
): Locale {
  if (preferredLanguage !== 'system') {
    return preferredLanguage
  }

  if (systemLanguage.toLocaleLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en-US'
}

export function createTranslator(
  preferredLanguage: PreferredLanguage,
  systemLanguage?: string,
): Translator {
  const locale = resolveLocale(preferredLanguage, systemLanguage)
  const dictionary = translations[locale]

  return (key, values) => formatMessage(dictionary[key] ?? key, values)
}

export function formatMessage(message: string, values?: TranslationValues) {
  if (!values) {
    return message
  }

  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    message,
  )
}
