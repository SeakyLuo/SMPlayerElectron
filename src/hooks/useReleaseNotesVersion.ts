import { useEffect, useRef, useState } from 'react'

import { compareAppVersions } from '../appModel'

interface ReleaseNotesVersionOptions {
  ready: boolean
  lastReleaseNotesVersion: string
}

export function useReleaseNotesVersion({
  ready,
  lastReleaseNotesVersion,
}: ReleaseNotesVersionOptions) {
  const [releaseNotesDialogVersion, setReleaseNotesDialogVersion] = useState('')
  const [releaseNotesChecked, setReleaseNotesChecked] = useState(false)
  const releaseNotesCheckedRef = useRef(false)

  useEffect(() => {
    if (!ready || releaseNotesCheckedRef.current) {
      return
    }

    releaseNotesCheckedRef.current = true
    const api = window.smplayer
    if (!api) {
      setReleaseNotesChecked(true)
      return
    }

    void api.getAppInfo().then((appInfo) => {
      if (
        lastReleaseNotesVersion &&
        compareAppVersions(appInfo.version, lastReleaseNotesVersion) > 0
      ) {
        setReleaseNotesDialogVersion(appInfo.version)
      }
    }).finally(() => {
      setReleaseNotesChecked(true)
    })
  }, [lastReleaseNotesVersion, ready])

  return {
    releaseNotesDialogVersion,
    releaseNotesChecked,
    setReleaseNotesDialogVersion,
  }
}
