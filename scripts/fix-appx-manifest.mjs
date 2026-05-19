import { readFile, writeFile } from 'node:fs/promises'

export default async function fixAppxManifest(context) {
  const manifestPath = typeof context === 'string' ? context : context.manifestPath
  let manifest = await readFile(manifestPath, 'utf8')

  manifest = manifest.replace(
    'xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"',
    [
      'xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"',
      '   xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"',
    ].join('\n'),
  )
  manifest = manifest.replace(
    'xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">',
    'xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"\n   IgnorableNamespaces="uap uap3 desktop rescap">',
  )
  manifest = manifest.replace(
    '<uap:Capability Name="musicLibrary"/>',
    '<uap3:Capability Name="backgroundMediaPlayback"/>\n  <uap:Capability Name="musicLibrary"/>',
  )

  await writeFile(manifestPath, manifest)
}
