import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

function getPackagedAssetPath(assetName: string) {
  return app.isPackaged
    ? join(process.resourcesPath, 'assets', assetName)
    : join(app.getAppPath(), 'src/assets', assetName)
}

export function getAppIconPath() {
  const iconFileName = process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png'
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'assets', iconFileName)
    : join(app.getAppPath(), 'public', iconFileName)

  if (existsSync(iconPath)) {
    return iconPath
  }

  const fallbackPath = app.isPackaged
    ? join(process.resourcesPath, 'assets', 'app-icon.png')
    : join(app.getAppPath(), 'public', 'app-icon.png')

  return existsSync(fallbackPath) ? fallbackPath : getPackagedAssetPath('hero.png')
}
