import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { Translator } from '../shared/i18n'
import { PopupDialog } from './PopupDialog'

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
  className?: string
}

export const VoiceAssistantFlyout = forwardRef<VoiceAssistantFlyoutHandle, VoiceAssistantFlyoutProps>(function VoiceAssistantFlyout({
  t,
  voiceLanguage,
  onVoiceCommand,
  getVoiceHint,
  onOpenChange,
  className,
}, ref) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<VoiceAssistantState>('idle')
  const [showHelpLink, setShowHelpLink] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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
    void window.smplayer!.cancelSpeechRecognition()
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
        void startRecognition(false, sessionId)
      }
    }, 250)
  }

  const startRecognition = async (showHint: boolean, sessionId = recognitionSessionRef.current) => {
    clearRestartTimer()
    if (showHint) {
      setText(getVoiceHint())
      setShowHelpLink(true)
    }

    setState('idle')
    const result = await window.smplayer!.recognizeSpeech(voiceLanguage)
    if (recognitionSessionRef.current !== sessionId || !listeningRef.current) {
      return
    }

    const transcript = result.text.trim()
    if (!transcript) {
      if (result.error === 'no-speech') {
        setState('idle')
        scheduleRecognitionRestart(sessionId)
        return
      }

      listeningRef.current = false
      setState('idle')
      setShowHelpLink(false)
      if (result.error === 'canceled') {
        close()
      } else if (result.error === 'unsupported-platform' || result.error === 'unavailable') {
        setText(t('voiceAssistant.unavailable'))
      } else if (result.error === 'privacy-required') {
        setText(t('voiceAssistant.privacyRequired'))
      } else if (result.error === 'audio-capture') {
        setText(t('voiceAssistant.audioCaptureFailed'))
      } else {
        setText(t('voiceAssistant.recognitionUnavailable'))
      }
      return
    }

    setText(transcript)
    setShowHelpLink(false)
    setState('processing')
    const { message, shouldContinue } = await onVoiceCommand(transcript)
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
    if (message === t('voiceAssistant.canceled')) {
      close()
      return
    }

    if (message === t('voiceAssistant.help')) {
      setHelpOpen(true)
    } else if (message && message !== t('voiceAssistant.executed')) {
      speak(message, () => {})
    }

    closeTimerRef.current = window.setTimeout(close, 5000)
  }

  const openFlyout = () => {
    recognitionSessionRef.current += 1
    listeningRef.current = true
    clearCloseTimer()
    clearRestartTimer()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    void window.smplayer!.cancelSpeechRecognition()
    setOpen(true)
    setState('idle')
    void startRecognition(true, recognitionSessionRef.current)
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

  useEffect(() => window.smplayer!.onVoiceRecognitionHypothesis((hypothesis) => {
    if (!listeningRef.current) {
      return
    }

    const transcript = hypothesis.text.trim()
    if (transcript) {
      setState('capturing')
      setText(transcript)
      setShowHelpLink(false)
    }
  }), [])

  useEffect(() => window.smplayer!.onVoiceRecognitionStateChange((update) => {
    if (listeningRef.current) {
      setState(update.state)
    }
  }), [])

  useEffect(() => () => {
    listeningRef.current = false
    recognitionSessionRef.current += 1
    clearCloseTimer()
    clearRestartTimer()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    void window.smplayer!.cancelSpeechRecognition()
  }, [])

  return (
    <>
      {open ? createPortal(
        <>
          <button className="voice-assistant-dismiss-layer" type="button" aria-label={t('common.close')} onPointerDown={close} />
          <div
            className={['voice-assistant-popover', `is-${state}`, className].filter(Boolean).join(' ')}
            role="status"
            onPointerDown={(event) => {
              if (!(event.target as HTMLElement).closest('.voice-assistant-help-button')) {
                close()
              }
            }}
          >
            {state === 'capturing' ? <span className="voice-assistant-ripples" aria-hidden="true" /> : null}
            <div className="voice-assistant-copy">
              {showProgress ? <span className="voice-assistant-spinner" aria-hidden="true" /> : null}
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
            </div>
          </div>
        </>,
        document.body,
      ) : null}
      {helpOpen ? (
        <PopupDialog
          t={t}
          overlayClassName="music-dialog-overlay VoiceAssistantHelpDialogOverlay"
          className="voice-assistant-help-dialog ContentDialog VoiceAssistantHelpDialog"
          navClassName="music-dialog-pivot VoiceAssistantHelpDialogPivot"
          navLabel={t('voiceAssistant.helpTitle')}
          ariaLabelledBy="voice-assistant-help-title"
          onClose={() => setHelpOpen(false)}
          navChildren={(
            <h2 id="voice-assistant-help-title" className="popup-dialog-title">{t('voiceAssistant.helpTitle')}</h2>
          )}
        >
            <div className="song-dialog-body release-notes-list">
              <section className="release-note-version">
                <h3>{t('voiceAssistant.supportedCommands')}</h3>
                <div className="voice-assistant-command-rows">
                  <span>{t('voiceAssistant.command.play')}</span>
                  <p>{t('voiceAssistant.command.play1')}</p>
                  <span />
                  <p>{t('voiceAssistant.command.play2')}</p>
                  <span />
                  <p>{t('voiceAssistant.command.play3')}</p>
                  <span>{t('voiceAssistant.command.playControl')}</span>
                  <p>{t('voiceAssistant.command.playControl1')}</p>
                  <span>{t('voiceAssistant.command.volume')}</span>
                  <p>{t('voiceAssistant.command.volume1')}</p>
                  <span />
                  <p>{t('voiceAssistant.command.volume2')}</p>
                  <span>{t('voiceAssistant.command.search')}</span>
                  <p>{t('voiceAssistant.command.search1')}</p>
                  <span>{t('voiceAssistant.command.help')}</span>
                  <p>{t('voiceAssistant.command.help1')}</p>
                </div>
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
        </PopupDialog>
      ) : null}
    </>
  )
})
