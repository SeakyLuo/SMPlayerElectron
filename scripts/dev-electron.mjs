import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

if (process.platform === 'win32') {
  await prepareWindowsElectron()
  process.env.ELECTRON_OVERRIDE_DIST_PATH = join(root, '.dev-electron')
}

const vite = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

vite.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

async function prepareWindowsElectron() {
  const electronDist = join(root, 'node_modules', 'electron', 'dist')
  const devElectronDist = join(root, '.dev-electron')
  const sourceExe = join(electronDist, 'electron.exe')
  const targetExe = join(devElectronDist, 'electron.exe')
  const iconPath = join(root, 'public', 'app-icon.ico')
  const rceditPath = join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')
  const markerPath = join(devElectronDist, '.smplayer-dev-electron.json')
  const marker = JSON.stringify({
    electronMtime: (await stat(sourceExe)).mtimeMs,
    iconMtime: (await stat(iconPath)).mtimeMs,
    version: 1,
  })

  if (existsSync(targetExe) && existsSync(markerPath)) {
    const currentMarker = await readFile(markerPath, 'utf8')
    if (currentMarker === marker) {
      return
    }
  }

  await rm(devElectronDist, { recursive: true, force: true })
  await mkdir(devElectronDist, { recursive: true })
  await cp(electronDist, devElectronDist, { recursive: true })
  await runRcedit(rceditPath, targetExe, iconPath)
  await writeFile(markerPath, marker)
}

function runRcedit(rceditPath, targetExe, iconPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(rceditPath, [
      targetExe,
      '--set-icon',
      iconPath,
      '--set-version-string',
      'ProductName',
      'Simple Melody Player',
      '--set-version-string',
      'FileDescription',
      'Simple Melody Player',
      '--set-version-string',
      'InternalName',
      'Simple Melody Player',
      '--set-version-string',
      'OriginalFilename',
      'Simple Melody Player.exe',
    ], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(`rcedit exited with code ${code}`))
    })
  })
}
