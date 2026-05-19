import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const requiredArchitectures = process.argv.slice(2)
const machineByArch = new Map([
  ['ia32', 0x014c],
  ['x64', 0x8664],
  ['arm64', 0xaa64],
])

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const errors = []

for (const arch of requiredArchitectures) {
  const expectedMachine = machineByArch.get(arch)
  const runtimeDir = join(rootDir, 'vendor', 'mpv', arch)
  const mpvPath = join(runtimeDir, 'mpv.exe')

  try {
    const machine = await readPeMachine(mpvPath)
    if (machine !== expectedMachine) {
      errors.push(`${mpvPath} is ${formatMachine(machine)}, expected ${arch}.`)
    }
  } catch (error) {
    errors.push(`${mpvPath}: ${error.message}`)
  }
}

if (errors.length > 0) {
  throw new Error([
    'Windows Store APPX builds require matching mpv runtimes.',
    'Place the Windows mpv files under vendor/mpv/x64, vendor/mpv/ia32, and vendor/mpv/arm64.',
    ...errors,
  ].join('\n'))
}

async function readPeMachine(filePath) {
  const buffer = await readFile(filePath)
  const peHeaderOffset = buffer.readUInt32LE(0x3c)
  const signature = buffer.toString('ascii', peHeaderOffset, peHeaderOffset + 4)

  if (signature !== 'PE\u0000\u0000') {
    throw new Error('not a PE executable')
  }

  return buffer.readUInt16LE(peHeaderOffset + 4)
}

function formatMachine(machine) {
  switch (machine) {
    case 0x014c:
      return 'ia32'
    case 0x8664:
      return 'x64'
    case 0xaa64:
      return 'arm64'
    default:
      return `PE machine 0x${machine.toString(16)}`
  }
}
