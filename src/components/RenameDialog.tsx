import type { LibraryPlaylist } from '../shared/contracts'
import type { Translator } from '../shared/i18n'
import { InputDialog } from './InputDialog'

export function RenameDialog({
  t,
  playlists,
  title = t('playlists.createNew'),
  defaultName,
  onCancel,
  onConfirm,
}: {
  t: Translator
  playlists: LibraryPlaylist[]
  title?: string
  defaultName: string
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  return (
    <InputDialog
      t={t}
      title={title}
      defaultValue={defaultName}
      placeholder={t('playlists.namePlaceholder')}
      validate={(name) => validatePlaylistName(name, playlists, t)}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

function validatePlaylistName(name: string, playlists: LibraryPlaylist[], t: Translator) {
  if (!name) {
    return t('playlists.nameEmpty')
  }

  if (name.length > 50) {
    return t('playlists.nameTooLong')
  }

  if (playlists.some((playlist) => playlist.name === name)) {
    return t('playlists.nameUsed')
  }

  if (name.includes('+++++') || name.includes('{0}') || name.includes('{1}')) {
    return t('playlists.nameSpecial')
  }

  return ''
}
