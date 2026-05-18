import type { PreferredLanguage } from './contracts'
import { cs } from './locales/cs'
import { de } from './locales/de'
import { enUS } from './locales/en-US'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { id } from './locales/id'
import { it } from './locales/it'
import { ja } from './locales/ja'
import { nl } from './locales/nl'
import { ptBR } from './locales/pt-BR'
import { ru } from './locales/ru'
import { sv } from './locales/sv'
import { uk } from './locales/uk'
import { zhHant } from './locales/zh-Hant'
import { zhCN } from './locales/zh-CN'

export const supportedLocales = [
  'en-US',
  'zh-CN',
  'fr',
  'ru',
  'ja',
  'de',
  'pt-BR',
  'es',
  'it',
  'zh-Hant',
  'nl',
  'cs',
  'uk',
  'sv',
  'id',
] as const

export type Locale = typeof supportedLocales[number]
export type TranslationValues = Record<string, string | number>
export type Translator = (key: string, values?: TranslationValues) => string

const translations: Record<Locale, Partial<Record<string, string>>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  fr,
  ru,
  ja,
  de,
  'pt-BR': ptBR,
  es,
  it,
  'zh-Hant': zhHant,
  nl,
  cs,
  uk,
  sv,
  id,
}

export function resolveLocale(
  preferredLanguage: PreferredLanguage,
  systemLanguage = typeof navigator === 'undefined' ? 'en-US' : navigator.language,
): Locale {
  if (preferredLanguage !== 'system') {
    return preferredLanguage
  }

  const normalizedLanguage = systemLanguage.toLocaleLowerCase()
  if (
    normalizedLanguage.startsWith('zh-hant') ||
    normalizedLanguage.startsWith('zh-tw') ||
    normalizedLanguage.startsWith('zh-hk') ||
    normalizedLanguage.startsWith('zh-mo')
  ) {
    return 'zh-Hant'
  }

  if (normalizedLanguage.startsWith('zh')) {
    return 'zh-CN'
  }

  if (normalizedLanguage.startsWith('pt')) {
    return 'pt-BR'
  }

  const language = normalizedLanguage.split('-')[0]
  switch (language) {
    case 'fr':
    case 'ru':
    case 'ja':
    case 'de':
    case 'es':
    case 'it':
    case 'nl':
    case 'cs':
    case 'uk':
    case 'sv':
    case 'id':
      return language
  }

  return 'en-US'
}

export function resolveVoiceAssistantLocale(preferredLanguage: PreferredLanguage) {
  switch (resolveLocale(preferredLanguage)) {
    case 'zh-Hant':
      return 'zh-TW'
    case 'zh-CN':
      return 'zh-CN'
    case 'fr':
      return 'fr-FR'
    case 'ru':
      return 'ru-RU'
    case 'ja':
      return 'ja-JP'
    case 'de':
      return 'de-DE'
    case 'pt-BR':
      return 'pt-BR'
    case 'es':
      return 'es-ES'
    case 'it':
      return 'it-IT'
    case 'nl':
      return 'nl-NL'
    case 'cs':
      return 'cs-CZ'
    case 'uk':
      return 'uk-UA'
    case 'sv':
      return 'sv-SE'
    case 'id':
      return 'id-ID'
    default:
      return 'en-US'
  }
}

export function createTranslator(
  preferredLanguage: PreferredLanguage,
  systemLanguage?: string,
): Translator {
  const locale = resolveLocale(preferredLanguage, systemLanguage)
  const baseDictionary = locale === 'zh-Hant' ? zhCN : enUS
  const dictionary: Record<string, string> = { ...baseDictionary, ...translations[locale] }

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
