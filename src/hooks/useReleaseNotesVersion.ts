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
  const releaseNotesCheckedRef = useRef(false)

  useEffect(() => {
    if (!ready || releaseNotesCheckedRef.current) {
      return
    }

    releaseNotesCheckedRef.current = true
    void window.smplayer?.getAppInfo().then((appInfo) => {
      if (
        lastReleaseNotesVersion &&
        compareAppVersions(appInfo.version, lastReleaseNotesVersion) > 0
      ) {
        setReleaseNotesDialogVersion(appInfo.version)
      }
    })
  }, [lastReleaseNotesVersion, ready])

  return {
    releaseNotesDialogVersion,
    setReleaseNotesDialogVersion,
  }
}
