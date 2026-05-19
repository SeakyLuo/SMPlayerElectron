import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const releaseDir = resolve(rootDir, 'release')
const inputDir = resolve(releaseDir, 'appxbundle-input')
const packageJson = (await import('../package.json', { with: { type: 'json' } })).default

const appxFiles = (await readdir(releaseDir))
  .filter((name) => name.endsWith('.appx'))
  .sort()

if (appxFiles.length === 0) {
  throw new Error('No .appx package found in release. Run npm run dist:win:store first.')
}

const bundleName = `${packageJson.build.productName}-${packageJson.version}-win.appxbundle`
const bundlePath = resolve(releaseDir, bundleName)
const makeAppxPath = await findMakeAppx()

if (!inputDir.startsWith(`${releaseDir}\\`)) {
  throw new Error(`Refusing to clean outside release: ${inputDir}`)
}

await rm(inputDir, { recursive: true, force: true })
await mkdir(inputDir, { recursive: true })

for (const appxFile of appxFiles) {
  await copyFile(resolve(releaseDir, appxFile), join(inputDir, basename(appxFile)))
}

const result = spawnSync(makeAppxPath, ['bundle', '/d', inputDir, '/p', bundlePath, '/o'], {
  cwd: rootDir,
  stdio: 'inherit',
  windowsHide: true,
})

if (result.status !== 0) {
  throw new Error(`makeappx bundle failed with exit code ${result.status}`)
}

console.log(`Created ${bundlePath}`)

async function findMakeAppx() {
  const candidates = [
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin',
    'C:\\Program Files\\Windows Kits\\10\\bin',
  ]
  const makeAppxFiles = []

  for (const candidate of candidates) {
    try {
      await collectMakeAppxFiles(candidate, makeAppxFiles)
    } catch {
      // Windows SDK is optional on developer machines.
    }
  }

  makeAppxFiles.sort().reverse()
  const makeAppxPath = makeAppxFiles.find((path) => path.endsWith('\\x64\\makeappx.exe'))
  if (!makeAppxPath) {
    throw new Error('makeappx.exe was not found. Install Windows 10/11 SDK first.')
  }

  return makeAppxPath
}

async function collectMakeAppxFiles(directory, output) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      await collectMakeAppxFiles(entryPath, output)
      continue
    }

    if (entry.name.toLowerCase() === 'makeappx.exe') {
      output.push(entryPath)
    }
  }
}
