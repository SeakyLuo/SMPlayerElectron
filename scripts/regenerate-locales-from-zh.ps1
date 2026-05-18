$ErrorActionPreference = 'Stop'

$sourcePath = 'src/shared/locales/zh-CN.ts'
$source = Get-Content -Raw -Path $sourcePath
$matches = [regex]::Matches($source, "(?m)^\s+'([^']+)':\s+'((?:\\.|[^'])*)',")
$entries = @()
function Decode-TsString([string]$value) {
  $jsonBody = $value.Replace("\'", "'").Replace('"', '\"')
  return ConvertFrom-Json -InputObject "`"$jsonBody`""
}
foreach ($match in $matches) {
  $key = $match.Groups[1].Value
  $value = Decode-TsString $match.Groups[2].Value
  $entries += [pscustomobject]@{ Key = $key; Value = $value }
}

$targets = @(
  @{ Locale='fr'; Export='fr'; Tl='fr' },
  @{ Locale='ru'; Export='ru'; Tl='ru' },
  @{ Locale='ja'; Export='ja'; Tl='ja' },
  @{ Locale='de'; Export='de'; Tl='de' },
  @{ Locale='pt-BR'; Export='ptBR'; Tl='pt' },
  @{ Locale='es'; Export='es'; Tl='es' },
  @{ Locale='it'; Export='it'; Tl='it' },
  @{ Locale='zh-Hant'; Export='zhHant'; Tl='zh-TW' },
  @{ Locale='nl'; Export='nl'; Tl='nl' },
  @{ Locale='cs'; Export='cs'; Tl='cs' },
  @{ Locale='uk'; Export='uk'; Tl='uk' },
  @{ Locale='sv'; Export='sv'; Tl='sv' },
  @{ Locale='id'; Export='id'; Tl='id' }
)

$protectedNames = @('Simple Melody Player', 'SMPlayer', 'Electron', 'UWP', 'Windows', 'Toast', 'LRC', 'lrc', 'ID3', 'webp', 'bmp')
$delimiter = '|||'
$cacheVersion = 'music-zh-v2'
$cachePath = '.codex/zh-translation-cache.json'
$cache = @{}
if (Test-Path $cachePath) {
  $rawCache = Get-Content -Raw -Path $cachePath | ConvertFrom-Json
  foreach ($prop in $rawCache.PSObject.Properties) { $cache[$prop.Name] = [string]$prop.Value }
}

function Add-Token([string]$original, [System.Collections.Generic.List[object]]$tokens) {
  $token = "ZX$($tokens.Count)XZ"
  $tokens.Add(@($token, $original)) | Out-Null
  return $token
}

function Protect-Text([string]$value) {
  $tokens = [System.Collections.Generic.List[object]]::new()
  $text = [regex]::Replace($value, '\{[a-zA-Z][a-zA-Z0-9]*\}', { param($m) Add-Token $m.Value $tokens })
  foreach ($name in $script:protectedNames) {
    $escaped = [regex]::Escape($name)
    $text = [regex]::Replace($text, $escaped, { param($m) Add-Token $m.Value $tokens })
  }
  return [pscustomobject]@{ Text = $text; Tokens = $tokens }
}

function Restore-Text([string]$value, $tokens) {
  $text = $value
  foreach ($pair in $tokens) {
    $token = [string]$pair[0]
    $original = [string]$pair[1]
    $text = $text.Replace($token, $original).Replace($token.ToLowerInvariant(), $original)
  }
  $text = $text -replace '\s+([,.!?;:])', '$1'
  $text = $text -replace '\{\s+', '{'
  $text = $text -replace '\s+\}', '}'
  return $text.Trim()
}

function Escape-Ts([string]$value) {
  return $value.Replace('\', '\\').Replace("'", "\'").Replace("`r", '').Replace("`n", '\n')
}

function Get-Translation([string]$query, [string]$tl) {
  $cacheKey = "$script:cacheVersion`:$tl`:$query"
  if ($script:cache.ContainsKey($cacheKey)) { return $script:cache[$cacheKey] }
  $encoded = [uri]::EscapeDataString($query)
  $uri = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=$tl&dt=t&q=$encoded"
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri $uri -TimeoutSec 45
      $translated = ($response[0] | ForEach-Object { $_[0] }) -join ''
      if ($translated.Length -gt 0) {
        $script:cache[$cacheKey] = $translated
        return $translated
      }
      throw 'empty response'
    } catch {
      if ($attempt -eq 5) { throw }
      Start-Sleep -Milliseconds (700 * $attempt)
    }
  }
}

function Save-Cache {
  $object = [ordered]@{}
  foreach ($key in $script:cache.Keys) { $object[$key] = $script:cache[$key] }
  $object | ConvertTo-Json -Depth 3 | Set-Content -Path $script:cachePath -Encoding UTF8
}

foreach ($target in $targets) {
  $locale = $target.Locale
  $tl = $target.Tl
  Write-Host "Translating $locale from zh-CN..."
  $translated = @{}
  $batch = @()
  $batchLength = 0
  $batches = @()
  foreach ($entry in $entries) {
    $protected = Protect-Text $entry.Value
    $item = [pscustomobject]@{ Key=$entry.Key; Value=$entry.Value; Protected=$protected }
    $length = $protected.Text.Length + 12
    if ($batch.Count -gt 0 -and ($batchLength + $length) -gt 1800) {
      $batches += ,@($batch)
      $batch = @()
      $batchLength = 0
    }
    $batch += $item
    $batchLength += $length
  }
  if ($batch.Count -gt 0) { $batches += ,@($batch) }

  for ($i = 0; $i -lt $batches.Count; $i++) {
    $current = $batches[$i]
    $query = ($current | ForEach-Object { $_.Protected.Text }) -join "`n$delimiter`n"
    $result = Get-Translation $query $tl
    $parts = [regex]::Split($result, '\s*\|\|\|\s*')
    if ($parts.Count -ne $current.Count) {
      $parts = @()
      foreach ($item in $current) {
        $parts += Get-Translation $item.Protected.Text $tl
        Start-Sleep -Milliseconds 120
      }
    }
    for ($j = 0; $j -lt $current.Count; $j++) {
      $translated[$current[$j].Key] = Restore-Text $parts[$j] $current[$j].Protected.Tokens
    }
    if ((($i + 1) % 10) -eq 0) {
      Save-Cache
      Write-Host "$locale $($i + 1)/$($batches.Count)"
    }
    Start-Sleep -Milliseconds 120
  }

  if ($locale -eq 'ja' -or $locale -eq 'zh-Hant') { $translated['common.artistSeparator'] = [string][char]0x3001 }
  if ($locale -eq 'zh-Hant') { $translated['common.comma'] = [string][char]0xFF0C }

  $lines = @()
  if ($locale -ne 'en-US') {
    $lines += "import type { enUS } from './en-US'"
    $lines += ''
  }
  $lines += "export const $($target.Export) = {"
  foreach ($entry in $entries) {
    $lines += "    '$($entry.Key)': '$(Escape-Ts $translated[$entry.Key])',"
  }
  if ($locale -eq 'en-US') {
    $lines += "} satisfies Record<string, string>"
  } else {
    $lines += "} satisfies Partial<Record<keyof typeof enUS, string>>"
  }
  Set-Content -Path "src/shared/locales/$locale.ts" -Value ($lines -join "`n") -Encoding UTF8
  Save-Cache
}
