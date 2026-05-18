import { execFileSync } from 'node:child_process'

const fontRegistryKeys = [
  'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
  'Registry::HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
]

let cachedSystemFonts: string[] | null = null

export function getSystemFonts() {
  if (cachedSystemFonts) {
    return cachedSystemFonts
  }

  cachedSystemFonts = readSystemFonts()
  return cachedSystemFonts
}

function readSystemFonts() {
  const fontFamilies = new Set<string>()
  const fontNames = process.platform === 'win32'
    ? readWindowsFontNames()
    : process.platform === 'darwin'
      ? readMacFontNames()
      : readLinuxFontNames()

  for (const fontName of fontNames) {
    for (const fontFamilyName of getFontFamilyNames(fontName)) {
      fontFamilies.add(fontFamilyName)
    }
  }

  return Array.from(fontFamilies)
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: 'base' }))
}

function readWindowsFontNames() {
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `
      [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
      $fontNames = foreach ($key in @(${fontRegistryKeys.map((key) => `'${key}'`).join(', ')})) {
        if (Test-Path -LiteralPath $key) {
          (Get-ItemProperty -LiteralPath $key).PSObject.Properties |
            Where-Object { $_.MemberType -eq 'NoteProperty' -and $_.Name -notlike 'PS*' } |
            ForEach-Object { $_.Name }
        }
      }
      $fontNames | Sort-Object -Unique | ConvertTo-Json -Compress
    `], {
      encoding: 'utf8',
      windowsHide: true,
    })

    return parseJsonStringArray(output)
  } catch {
    return []
  }
}

function readMacFontNames() {
  try {
    const output = execFileSync('system_profiler', ['SPFontsDataType', '-json'], {
      encoding: 'utf8',
    })
    const payload = JSON.parse(output) as {
      SPFontsDataType?: Array<{ _name?: string; typefaces?: Array<{ _name?: string }> }>
    }

    return (payload.SPFontsDataType ?? []).flatMap((font) => [
      font._name ?? '',
      ...(font.typefaces ?? []).map((typeface) => typeface._name ?? ''),
    ]).filter(Boolean)
  } catch {
    return []
  }
}

function readLinuxFontNames() {
  try {
    const output = execFileSync('fc-list', [':', 'family'], {
      encoding: 'utf8',
    })

    return output
      .split(/\r?\n/)
      .flatMap((line) => line.split(','))
      .map((name) => name.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function parseJsonStringArray(output: string) {
  const parsed = JSON.parse(output || '[]') as string | string[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

function getFontFamilyNames(fontName: string) {
  const familyName = fontName
    .replace(/\s+\([^)]*\)\s*$/, '')
    .trim()

  return familyName.split(/\s*&\s*/).map((name) => name
    .replace(/\s+(Bold Italic|Light Italic|Medium Italic|SemiBold Italic|Black Italic|Thin|ExtraLight|UltraLight|Light|SemiLight|Regular|Medium|SemiBold|DemiBold|Bold|ExtraBold|UltraBold|Black|Heavy|Italic|Oblique)$/i, '')
    .trim())
}
