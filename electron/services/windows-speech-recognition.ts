import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import type {
  VoiceRecognitionHypothesis,
  VoiceRecognitionResult,
  VoiceRecognitionStateChange,
} from '../../src/shared/contracts'

interface WindowsSpeechRecognitionCallbacks {
  onHypothesis: (hypothesis: VoiceRecognitionHypothesis) => void
  onStateChange: (update: VoiceRecognitionStateChange) => void
}

type WindowsSpeechRecognitionOutput =
  | (VoiceRecognitionHypothesis & { type: 'hypothesis' })
  | { type: 'state'; state: string }
  | (VoiceRecognitionResult & { type?: undefined })

let activeVoiceRecognitionProcess: ChildProcessWithoutNullStreams | null = null

export function cancelWindowsSpeechRecognition() {
  activeVoiceRecognitionProcess?.kill()
  activeVoiceRecognitionProcess = null
}

export function recognizeWindowsSpeech(
  language: string,
  callbacks: WindowsSpeechRecognitionCallbacks,
): Promise<VoiceRecognitionResult> {
  if (process.platform !== 'win32') {
    return Promise.resolve({ text: '', error: 'unsupported-platform' })
  }

  return new Promise((resolve) => {
    cancelWindowsSpeechRecognition()
    const script = getWindowsSpeechRecognitionScript(language)
    const encodedScript = Buffer.from(script, 'utf16le').toString('base64')
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedScript,
    ], {
      windowsHide: true,
    })
    activeVoiceRecognitionProcess = child
    let settled = false
    let stdout = ''
    let stdoutRemainder = ''
    const finish = (result: VoiceRecognitionResult) => {
      if (settled) {
        return
      }

      settled = true
      if (activeVoiceRecognitionProcess === child) {
        activeVoiceRecognitionProcess = null
      }
      resolve(result)
    }
    const emitRecognitionState = (state: string) => {
      let mappedState: VoiceRecognitionStateChange['state'] = 'idle'
      if (state === 'Capturing' || state === 'SoundStarted' || state === 'SpeechDetected') {
        mappedState = 'capturing'
      } else if (state === 'Processing') {
        mappedState = 'processing'
      }

      callbacks.onStateChange({ state: mappedState })
    }
    const handleOutputLine = (line: string) => {
      const output = line.trim()
      if (!output) {
        return
      }

      stdout += `${output}\n`
      try {
        const payload = JSON.parse(output) as WindowsSpeechRecognitionOutput
        if (activeVoiceRecognitionProcess !== child) {
          return
        }

        if (payload.type === 'hypothesis' && payload.text.trim()) {
          callbacks.onHypothesis({ text: payload.text.trim() })
        } else if (payload.type === 'state' && payload.state) {
          emitRecognitionState(payload.state)
        }
      } catch {
        stdout += ''
      }
    }

    const timeout = setTimeout(() => {
      child.kill()
      finish({ text: '', error: 'no-speech' })
    }, 18000)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutRemainder += chunk
      const lines = stdoutRemainder.split(/\r?\n/)
      stdoutRemainder = lines.pop() ?? ''
      lines.forEach(handleOutputLine)
    })
    child.on('error', () => {
      clearTimeout(timeout)
      finish({ text: '', error: 'failed' })
    })
    child.on('close', () => {
      clearTimeout(timeout)
      if (stdoutRemainder) {
        handleOutputLine(stdoutRemainder)
      }
      try {
        const output = stdout.trim().split(/\r?\n/).at(-1) ?? ''
        const result = JSON.parse(output) as VoiceRecognitionResult
        finish({
          text: typeof result.text === 'string' ? result.text : '',
          error: result.error,
        })
      } catch {
        finish({ text: '', error: activeVoiceRecognitionProcess === child ? 'failed' : 'canceled' })
      }
    })
  })
}

function escapePowerShellSingleQuotedString(value: string) {
  return value.replace(/'/g, "''")
}

function getWindowsSpeechRecognitionScript(language: string) {
  const cultureName = language

  return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$cultureName = '${escapePowerShellSingleQuotedString(cultureName)}'
$recognizer = $null

function Write-RecognitionOutput($payload) {
  $json = $payload | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

function Await-WinRtOperation($operation, [Type]$resultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1
  } | Select-Object -First 1
  $task = $method.MakeGenericMethod($resultType).Invoke($null, @($operation))
  return $task.GetAwaiter().GetResult()
}

function Resolve-SpeechLanguage($requestedLanguageTag) {
  [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime] | Out-Null
  $requestedLanguage = [Windows.Globalization.Language]::new($requestedLanguageTag)
  $supportedLanguages = [Windows.Media.SpeechRecognition.SpeechRecognizer]::SupportedTopicLanguages
  $exactLanguage = $supportedLanguages | Where-Object { $_.LanguageTag -eq $requestedLanguage.LanguageTag } | Select-Object -First 1
  if ($null -ne $exactLanguage) {
    return $exactLanguage
  }

  $primaryLanguage = $requestedLanguage.LanguageTag.Split('-')[0]
  $primaryMatch = $supportedLanguages | Where-Object { $_.LanguageTag.StartsWith($primaryLanguage) } | Select-Object -First 1
  if ($null -ne $primaryMatch) {
    return $primaryMatch
  }

  return [Windows.Media.SpeechRecognition.SpeechRecognizer]::SystemSpeechLanguage
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime] | Out-Null
  $recognizerLanguage = Resolve-SpeechLanguage $cultureName
  if ($null -eq $recognizerLanguage) {
    Write-RecognitionOutput @{ text = ''; error = 'unavailable' }
    exit 0
  }

  $recognizer = [Windows.Media.SpeechRecognition.SpeechRecognizer]::new($recognizerLanguage)
  $recognizer.UIOptions.IsReadBackEnabled = $false
  $recognizer.add_HypothesisGenerated({
    param($sender, $eventArgs)
    if ($null -ne $eventArgs -and -not [string]::IsNullOrWhiteSpace($eventArgs.Hypothesis.Text)) {
      Write-RecognitionOutput @{ type = 'hypothesis'; text = $eventArgs.Hypothesis.Text }
    }
  })
  $recognizer.add_StateChanged({
    param($sender, $eventArgs)
    if ($null -ne $eventArgs) {
      Write-RecognitionOutput @{ type = 'state'; state = $eventArgs.State.ToString() }
    }
  })
  $compileResult = Await-WinRtOperation ($recognizer.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
  if ($compileResult.Status -ne [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]::Success) {
    Write-RecognitionOutput @{ text = ''; error = 'unavailable' }
    exit 0
  }

  Write-RecognitionOutput @{ type = 'state'; state = 'Capturing' }
  $result = Await-WinRtOperation ($recognizer.RecognizeWithUIAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])
  if ($null -eq $result) {
    Write-RecognitionOutput @{ text = ''; error = 'no-speech' }
    exit 0
  }
  if ($result.Status -eq [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]::UserCanceled) {
    Write-RecognitionOutput @{ text = ''; error = 'canceled' }
    exit 0
  }
  if ($result.Status -ne [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]::Success) {
    Write-RecognitionOutput @{ text = ''; error = 'failed' }
    exit 0
  }
  if ([string]::IsNullOrWhiteSpace($result.Text)) {
    Write-RecognitionOutput @{ text = ''; error = 'no-speech' }
    exit 0
  }

  Write-RecognitionOutput @{ text = $result.Text }
} catch [System.UnauthorizedAccessException] {
  Write-RecognitionOutput @{ text = ''; error = 'privacy-required' }
} catch {
  if ($_.Exception.Message -like '*speech privacy policy*') {
    Write-RecognitionOutput @{ text = ''; error = 'privacy-required' }
  } else {
    Write-RecognitionOutput @{ text = ''; error = 'failed' }
  }
} finally {
  if ($null -ne $recognizer) {
    $recognizer.Dispose()
  }
}
`
}
