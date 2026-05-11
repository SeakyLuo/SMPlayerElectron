import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { Translator } from '../shared/i18n'
import { Icon } from './icons'

export interface VoiceAssistantResponse {
  message: string
  shouldContinue: boolean
}

export interface VoiceAssistantFlyoutHandle {
  open: () => void
  close: () => void
}

type VoiceAssistantState = 'idle' | 'capturing' | 'processing'

interface VoiceAssistantFlyoutProps {
  t: Translator
  voiceLanguage: string
  onVoiceCommand: (text: string) => Promise<VoiceAssistantResponse>
  getVoiceHint: () => string
  onOpenChange: (open: boolean) => void
}

export const VoiceAssistantFlyout = forwardRef<VoiceAssistantFlyoutHandle, VoiceAssistantFlyoutProps>(function VoiceAssistantFlyout({
  t,
  voiceLanguage,
  onVoiceCommand,
  getVoiceHint,
  onOpenChange,
}, ref) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<VoiceAssistantState>('idle')
  const [showHelpLink, setShowHelpLink] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const restartTimerRef = useRef<number | null>(null)
  const recognitionSessionRef = useRef(0)
  const listeningRef = useRef(false)
  const showProgress = state === 'processing'

  const clearCloseTimer = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const clearRestartTimer = () => {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }

  const close = () => {
    listeningRef.current = false
    recognitionSessionRef.current += 1
    clearCloseTimer()
    clearRestartTimer()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    speechRecognitionRef.current?.stop()
    speechRecognitionRef.current = null
    setOpen(false)
    setState('idle')
    setShowHelpLink(false)
  }

  const speak = (message: string, ended: () => void) => {
    if (!('speechSynthesis' in window)) {
      ended()
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.lang = voiceLanguage
    utterance.onend = ended
    window.speechSynthesis.speak(utterance)
  }

  const scheduleRecognitionRestart = (sessionId: number) => {
    clearRestartTimer()
    restartTimerRef.current = window.setTimeout(() => {
      if (listeningRef.current && recognitionSessionRef.current === sessionId) {
        startRecognition(false, sessionId)
      }
    }, 250)
  }

  const startRecognition = (showHint: boolean, sessionId = recognitionSessionRef.current) => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      listeningRef.current = false
      setText(t('voiceAssistant.unavailable'))
      setShowHelpLink(false)
      return
    }

    clearRestartTimer()
    const recognition = new SpeechRecognition()
    speechRecognitionRef.current = recognition
    let shouldRestartOnEnd = true
    recognition.lang = voiceLanguage
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => {
      if (speechRecognitionRef.current === recognition && recognitionSessionRef.current === sessionId) {
        setState('capturing')
      }
    }
    recognition.onsoundstart = () => {
      if (speechRecognitionRef.current === recognition && recognitionSessionRef.current === sessionId) {
        setState('capturing')
      }
    }
    recognition.onspeechend = () => {
      if (speechRecognitionRef.current === recognition && recognitionSessionRef.current === sessionId) {
        setState('processing')
      }
    }
    recognition.onerror = (event) => {
      if (speechRecognitionRef.current !== recognition || recognitionSessionRef.current !== sessionId) {
        return
      }

      setState('idle')
      if (event.error === 'aborted') {
        shouldRestartOnEnd = false
        return
      }

      if (event.error === 'no-speech') {
        return
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        listeningRef.current = false
        shouldRestartOnEnd = false
        setText(t('voiceAssistant.privacyRequired'))
        setShowHelpLink(false)
        return
      }

      shouldRestartOnEnd = true
    }
    recognition.onend = () => {
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null
      }
      if (recognitionSessionRef.current !== sessionId) {
        return
      }
      if (listeningRef.current && shouldRestartOnEnd) {
        setState('idle')
        scheduleRecognitionRestart(sessionId)
        return
      }
      setState((current) => current === 'processing' ? current : 'idle')
    }
    recognition.onresult = (event) => {
      if (speechRecognitionRef.current !== recognition || recognitionSessionRef.current !== sessionId) {
        return
      }

      shouldRestartOnEnd = false
      const transcript = event.results[event.resultIndex][0].transcript.trim()
      if (!transcript) {
        setState('idle')
        scheduleRecognitionRestart(sessionId)
        return
      }

      setText(transcript)
      setShowHelpLink(false)
      setState('idle')
      void onVoiceCommand(transcript).then(({ message, shouldContinue }) => {
        if (recognitionSessionRef.current !== sessionId) {
          return
        }

        if (shouldContinue) {
          speak(message, () => {
            scheduleRecognitionRestart(sessionId)
          })
          return
        }

        listeningRef.current = false
        if (message === t('voiceAssistant.help')) {
          setHelpOpen(true)
        } else if (message && message !== t('voiceAssistant.executed')) {
          speak(message, () => {})
        }

        closeTimerRef.current = window.setTimeout(close, 5000)
      })
    }
    recognition.addEventListener('nomatch', () => {
      if (speechRecognitionRef.current !== recognition || recognitionSessionRef.current !== sessionId) {
        return
      }

      setState('idle')
      shouldRestartOnEnd = true
    })

    if (showHint) {
      setText(getVoiceHint())
      setShowHelpLink(true)
    }
    setState('capturing')
    recognition.start()
  }

  const openFlyout = () => {
    recognitionSessionRef.current += 1
    listeningRef.current = true
    clearCloseTimer()
    clearRestartTimer()
    setOpen(true)
    startRecognition(true, recognitionSessionRef.current)
  }

  const openHelp = () => {
    setHelpOpen(true)
  }

  useImperativeHandle(ref, () => ({
    open: openFlyout,
    close,
  }))

  useEffect(() => {
    onOpenChange(open)
  }, [onOpenChange, open])

  useEffect(() => () => {
    listeningRef.current = false
    recognitionSessionRef.current += 1
    clearCloseTimer()
    clearRestartTimer()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    speechRecognitionRef.current?.stop()
  }, [])

  return (
    <>
      {open ? (
        <>
          <button className="voice-assistant-dismiss-layer" type="button" aria-label={t('common.close')} onClick={close} />
          <div className={`voice-assistant-popover is-${state}`} role="status">
            <div className="voice-assistant-copy">
              {showProgress ? null : (
                <>
                  <span>{text}</span>
                  {showHelpLink ? (
                    <button
                      type="button"
                      className="voice-assistant-help-button"
                      onClick={openHelp}
                      title={t('voiceAssistant.getHelp')}
                    >
                      {t('voiceAssistant.getHelp')}
                    </button>
                  ) : null}
                </>
              )}
            </div>
            {showProgress ? <div className="voice-assistant-progress" aria-hidden="true" /> : null}
          </div>
        </>
      ) : null}
      {helpOpen ? createPortal(
        <div className="settings-modal-backdrop" role="presentation">
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="voice-assistant-help-title">
            <header>
              <h2 id="voice-assistant-help-title">{t('voiceAssistant.helpTitle')}</h2>
              <button type="button" onClick={() => setHelpOpen(false)} aria-label={t('common.close')} title={t('common.close')}>
                <Icon name="arrowLeft" className="dialog-back-icon" />
                <Icon name="close" className="dialog-close-icon" />
              </button>
              <span className="dialog-titlebar-title">{t('app.shell')}</span>
            </header>
            <div className="release-notes-list">
              <section className="release-note-version">
                <h3>{t('voiceAssistant.supportedCommands')}</h3>
                <ol>
                  <li>{`${t('voiceAssistant.command.play')} ${t('voiceAssistant.command.play1')}`}</li>
                  <li>{t('voiceAssistant.command.play2')}</li>
                  <li>{t('voiceAssistant.command.play3')}</li>
                  <li>{`${t('voiceAssistant.command.playControl')} ${t('voiceAssistant.command.playControl1')}`}</li>
                  <li>{`${t('voiceAssistant.command.volume')} ${t('voiceAssistant.command.volume1')}`}</li>
                  <li>{t('voiceAssistant.command.volume2')}</li>
                  <li>{`${t('voiceAssistant.command.search')} ${t('voiceAssistant.command.search1')}`}</li>
                  <li>{`${t('voiceAssistant.command.help')} ${t('voiceAssistant.command.help1')}`}</li>
                </ol>
              </section>
              <section className="release-note-version">
                <h3>{t('voiceAssistant.notice')}</h3>
                <ol>
                  <li>{t('voiceAssistant.noticeSmartness')}</li>
                  <li>{t('voiceAssistant.noticeCommandIntro')}</li>
                  <li>{t('voiceAssistant.noticeExample')}</li>
                </ol>
              </section>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  )
})
