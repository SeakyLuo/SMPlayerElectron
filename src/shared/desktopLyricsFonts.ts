const systemDesktopLyricsFont = '"Segoe UI", system-ui, sans-serif'

function quoteFontFamily(fontFamily: string) {
  return `"${fontFamily.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

export function getDesktopLyricsFontCss(fontFamily: string) {
  if (fontFamily === 'system') {
    return systemDesktopLyricsFont
  }

  return `${quoteFontFamily(fontFamily)}, ${systemDesktopLyricsFont}`
}
