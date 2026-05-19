import { readFileSync } from 'node:fs'

const localeFiles = [
  'src/shared/locales/en-US.json',
  'src/shared/locales/zh-CN.json',
  'src/shared/locales/fr.json',
  'src/shared/locales/ru.json',
  'src/shared/locales/ja.json',
  'src/shared/locales/de.json',
  'src/shared/locales/pt-BR.json',
  'src/shared/locales/es.json',
  'src/shared/locales/it.json',
  'src/shared/locales/zh-Hant.json',
  'src/shared/locales/nl.json',
  'src/shared/locales/cs.json',
  'src/shared/locales/uk.json',
  'src/shared/locales/sv.json',
  'src/shared/locales/id.json',
]

const dictionaries = new Map(localeFiles.map((file) => [file, readDictionary(file)]))
const source = dictionaries.get('src/shared/locales/zh-CN.json')
const sourceKeys = Object.keys(source)
const failures = []

for (const [file, dictionary] of dictionaries) {
  const rawSource = readFileSync(file, 'utf8')
  const keys = Object.keys(dictionary)
  const missing = sourceKeys.filter((key) => !(key in dictionary))
  const extra = keys.filter((key) => !(key in source))

  if (missing.length > 0) {
    failures.push(`${file} is missing keys: ${missing.join(', ')}`)
  }

  if (extra.length > 0) {
    failures.push(`${file} has unknown keys: ${extra.join(', ')}`)
  }

  if (/\\u[0-9a-fA-F]{4}/.test(rawSource)) {
    failures.push(`${file} contains escaped unicode text`)
  }

  for (const key of sourceKeys) {
    if (!(key in dictionary)) {
      continue
    }

    if (dictionary[key].length === 0) {
      failures.push(`${file} has empty translation at ${key}`)
    }

    const sourcePlaceholders = getPlaceholders(source[key])
    const targetPlaceholders = getPlaceholders(dictionary[key])
    if (sourcePlaceholders.join('|') !== targetPlaceholders.join('|')) {
      failures.push(`${file} has placeholder mismatch at ${key}: expected ${sourcePlaceholders.join(', ') || 'none'}, got ${targetPlaceholders.join(', ') || 'none'}`)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`i18n check passed: ${sourceKeys.length} keys across ${localeFiles.length} locales`)

function readDictionary(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function getPlaceholders(value) {
  return [...value.matchAll(/\{[a-zA-Z][a-zA-Z0-9]*\}/g)].map((match) => match[0]).sort()
}
