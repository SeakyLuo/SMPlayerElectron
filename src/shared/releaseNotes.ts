export interface ReleaseNoteEntry {
  version: string
  items: string[]
}

type ReleaseNoteText = {
  en: string
  zh: string
}

const text = {
  modernUi: {
    en: 'Changed to a more modern UI.',
    zh: '改成了更加现代的 UI。',
  },
  nightMode: {
    en: 'Added night mode settings, including automatic switching by time.',
    zh: '新增夜间模式设置，支持按时间自动切换。',
  },
  removedNotificationLyrics: {
    en: 'Removed lyrics in system notifications because the Electron version cannot update Windows notifications continuously like the original UWP toast.',
    zh: '移除了系统通知中的歌词显示，因为 Electron 版本无法像原 UWP Toast 那样持续更新 Windows 通知。',
  },
  tilesUnsupported: {
    en: 'Start menu tiles are no longer supported in this version.',
    zh: '当前版本不再支持开始菜单磁贴。',
  },
  bugFixes: {
    en: 'Bug fixes and various improvements.',
    zh: '问题修复和优化。',
  },
  switchLanguageSupported: {
    en: 'You can switch to another language in the settings now!',
    zh: '你可以切换语言了',
  },
  improvedVoiceAssistant: {
    en: 'Voice assistant is improved a little.',
    zh: '稍微优化了语音助手',
  },
  addSeeAlbumArtToFullPage: {
    en: 'You can see album art in the Immersive mode.',
    zh: '你可以在沉浸模式中查看专辑插图了。',
  },
  crashFixes: {
    en: 'Fixed some problems that caused crashes.',
    zh: '修复了一些闪退问题。',
  },
  bugFixForImportData: {
    en: 'Fix the bug that Import Data is unavailable.',
    zh: '修复了导入数据不可用的问题。',
  },
  addPointerOverButtonsToMusicList: {
    en: 'Add some buttons to the music list item.',
    zh: '增加了一些音乐列表的快捷操作按钮',
  },
  bugFixForPlayInTheFlyoutMenu: {
    en: "Fix a bug that Play button in the right-click menu doesn't play.",
    zh: '修复了右键菜单中播放按钮不播放的问题',
  },
  lazyContent: {
    en: "Guess what's new! Just some minor updates and I am too lazy to write them down, haha.",
    zh: '猜猜我更新了啥~就是些小改动，懒得详细写了~',
  },
  supportOgg: {
    en: 'Add play support for ogg file.',
    zh: '支持播放ogg格式的音乐文件。',
  },
  cancel5SecondsMovePrev: {
    en: 'When clicking the Previous button, it moves to the previous music directly, instead of moving the current music to its very beginning when it has been played for more than 5 seconds.',
    zh: '点击播放前一首时，已经播放超过5秒的歌曲不会再重头播放了',
  },
  lyricsCanBeSavedLater: {
    en: 'Improve the experience for saving lyrics and avoid the current music from being cut off playing when saving its lyrics.',
    zh: '优化了保存歌词的体验，避免保存正在播放歌曲的歌词时切换歌曲',
  },
  locateMusicBugFix: {
    en: '(Hopefully!) Fix a problem that current music cannot be located correctly.',
    zh: '（但愿）修复了列表项目过多时无法定位当前音乐的问题',
  },
  loopModeMovePrevNextChange: {
    en: 'In the Repeat One mode, clicking Previous and Next will move to the corresponding music instead of staying the repeated one.',
    zh: '单曲循环模式时，点击上一首和下一首会切换到其他歌曲了',
  },
  recentPlayedNotShow: {
    en: 'Fix a problem that causes Recent Played list not showing its content.',
    zh: '修复最近播放列表不展示的问题',
  },
  addAuthorizeOtherFolder: {
    en: 'Add "Authorize other folder" in the Settings page.',
    zh: '在设置页面增加了“授权其他文件夹”的功能',
  },
  bugFixesMovingFolderNotMovingAllFiles: {
    en: 'Fixed a bug that moving a folder does not moving its all sub items.',
    zh: '修复了移动文件夹时没有移动全部文件夹子项目的问题',
  },
  bugFixForNowPlayingPlaylist: {
    en: 'Fix some bugs of the Now Playing playlist.',
    zh: '修复了正在播放列表的一些问题',
  },
  bugFixForResumeFile: {
    en: 'Fix a bug that files cannot be resumed if it is hidden',
    zh: '修复了无法恢复文件展示的问题',
  },
  bugFixForSelectingPlayedNowPlayingMusic: {
    en: 'Fix a bug that played music in the Now Playing cannot be clicked.',
    zh: '修复了无法点击正在播放列表无法点击播放过的歌曲的问题',
  },
  notificationLyricsSource: {
    en: 'You can choose a default lyrics source option or switch lyrics source for notifications. Lyrics may come from the Internet, lrc file, or the music file itself.',
    zh: '你可以选择通知中歌词默认的来源，也可以直接在通知中切换。歌词来源包括网络歌词、lrc文件歌词、音乐文件本身的歌词。',
  },
  useHideFolder: {
    en: 'You can now hide a folder or a file in the local page by right-clicking one and select "Hide Folder" or "Hide File". The hidden file or hidden folder and its content will not display in SMPlayer. You can resume it in the local page.',
    zh: '你现在可以隐藏文件夹或者音乐文件了，在本地页面的右键菜单中选择“隐藏文件夹”或者“隐藏文件”，该文件夹或文件将不会出现在简音播放器中。你可以通过本地页面恢复它。',
  },
  useFilenameInsteadOfMusicName: {
    en: 'A new setting is added which allows you to use filename instead of music name when loading a music file.',
    zh: '设置页面添加了开关，支持加载歌曲时使用文件名称而非音乐名称',
  },
  localPageDisplayWhenHoverButton: {
    en: 'Add some buttons to the list mode of Local Page.',
    zh: '本地页面的列表模式增加了一些按钮。',
  },
  bugFixForLyrics: {
    en: 'Fix a problem that lyrics cannot be displayed.',
    zh: '修复了歌词无法展示的问题',
  },
  updateDialogWithItemClick: {
    en: 'New music files in the update result can now be clicked and played.',
    zh: '更新详情里的音乐支持点击播放了',
  },
  fixDuplicateMusicWhenReAdded: {
    en: 'Fix a bug that causes extra duplicate music file when deleting a music file and then adding it back.',
    zh: '修复了音乐被删除又添加后，出现重复音乐的问题',
  },
  systemLog: {
    en: 'You can see some system logs and send it to the developer.',
    zh: '可以在设置页面查看系统日志并反馈给开发者',
  },
  fixPlaylistControlNoUpdate: {
    en: 'Fix a problem that Playlist Control does not update real time.',
    zh: '修复播放列表控件没有实时更新的问题',
  },
  fixSettingsPageCrash: {
    en: 'Fix a crash when entering Settings page.',
    zh: '修复了进入设置页面闪退的问题',
  },
  movePreferenceSettings: {
    en: 'Preference Settings has been move to the Settings page.',
    zh: '偏好设置被移动到了设置页面',
  },
  nowPlayingSupportsMultiSelect: {
    en: 'Now Playing page supports multi-select.',
    zh: '正在播放页面支持多选了',
  },
  unableToAddNewMusic: {
    en: 'Fix a bug that new music file cannot be added.',
    zh: '修复了无法添加新音乐文件的问题',
  },
  fixFolderSortMakesFolderInvisible: {
    en: 'Fix a bug that makes a folder invisible after sorting it.',
    zh: '修复了文件夹排序会导致文件夹不可见的问题',
  },
  fixSearchCrash: {
    en: 'Fix a crash when searching.',
    zh: '修复了搜索时的闪退问题',
  },
  fixCrashOfRefreshingDirectory: {
    en: 'Fix the crash when refreshing directory.',
    zh: '修复了本地页面更新目录的闪退问题',
  },
  improveLocalPageDropdown: {
    en: 'Improved the animation when click the dropdown button in local page.',
    zh: '优化了本地页面路径下拉菜单的动画效果',
  },
  fixSearchResultPageSort: {
    en: 'Fix the bug that sort does not work in Search Detail Page.',
    zh: '修复了搜索详情页面的排序问题',
  },
  fixPreferenceSettingsCrash: {
    en: 'Fix the crash when going to the Preference Page.',
    zh: '修复了进入偏好设置页面会闪退的问题',
  },
  supportsOtherMusicFormat: {
    en: 'Supports more music format including flac, alac, aac, wma.',
    zh: '支持了更多格式的音乐文件：flac, aac, alac, wma',
  },
  redesignLocalPagePathBox: {
    en: 'Resigned the interaction of Local Page.',
    zh: '重新设计了本地页面的路径交互',
  },
  adjustAlbumGroupingLogic: {
    en: 'Adjust the logic of grouping albums to their names only.',
    zh: '调整了专辑页面的分组策略，现在只按照专辑名称进行分组了',
  },
  incompatibleTile: {
    en: '【Important】If you have pinned some playlists to the start menu before, you need to pin them again as they are incompatible from now on.',
    zh: '【重要】如果你之前固定了一些播放列表磁贴到开始菜单，请重新固定一次，之前的磁贴从此以后不再兼容。',
  },
  improvedLocalPageDragAndDrop: {
    en: 'You can now drag and drop items in the Local Page to any other folder or directory.',
    zh: '增强了本地页面的拖拽功能，可以把文件、文件夹拖动到其它文件夹或者路径下了。',
  },
  updateFolderResult: {
    en: 'You can see the detailed result of refreshing directory.',
    zh: '更新目录支持查看更新结果的详情了',
  },
  preferenceSettingsDislikedAndDoNotAppear: {
    en: 'Now supports Do-Not-Appear and Dislike for Preference Settings, and fixed some bugs.',
    zh: '优化了偏好设置（支持不喜欢、不出现）并修复了几个问题。',
  },
  fixedPreferenceSettings: {
    en: 'Fix the bug that preference settings are not working.',
    zh: '修复了偏好设置不起作用的问题',
  },
  improvedLocalManagement: {
    en: 'You can now add/delete folder, move music file in SMPlayer.',
    zh: '增强了本地文件管理功能，支持在播放器中新增删除文件夹、移动歌曲至其他文件夹等。',
  },
  bugFixesForAddingPlaylistWhenNone: {
    en: 'Fixed some bugs. The app no longer crashes when you try to add a playlist with no playlists.',
    zh: '修复了一些问题，比如当没有播放列表时无法创建播放列表。',
  },
  importantNoteDataStructureChanged: {
    en: '【Important Note !!!】Data structure has changed! If you backed up before, please back up again.',
    zh: '【重要！！！】数据结构有变化。如果之前备份过数据文件，请重新导出！',
  },
  voiceAssistantImprovements2: {
    en: 'Minor improvements have made to Voice Assistant.',
    zh: '语音助手进行了一些小优化~',
  },
  preferenceSettingsPreferenceLevelAdded: {
    en: 'You can now set the probability of preferred items in Preference Settings',
    zh: '偏好设置支持选择偏好项目出现的概率。',
  },
  showInExplorerBugFix: {
    en: '【Bug Fix】When you click "Show In Explorer" or "Multi-Select" on a folder, the app no longer crashes; Albums page now shows correct albums.',
    zh: '【问题修复】修复了在文件夹上点击“在本地显示”时造成的闪退问题；修复了“本地”页面无法多选的问题；修复了专辑页面不包含全部专辑的问题。',
  },
  settingsCheckBoxChanged: {
    en: '【Improvements】Some check boxes in the Settings page are changed to toggle switches.',
    zh: '【体验优化】优化了设置页面的一些控件展示，搜索历史页面增加了“移除”按钮',
  },
  preferenceSettingsAdded: {
    en: '【New Feature!!!】Preference Settings is added to the Now Playing page. Items the Preference List will have a high posibility of being played.',
    zh: '【新功能！】“正在播放”页面中添加了偏好设置，处于偏好列表中的项目会有更高的概率被随机播放。',
  },
  voiceAssistantImprovements: {
    en: '【Improvements】Voice assistant is a little little little bit smarter, and now supports some new commands. Check out Settings page for more information.',
    zh: '【体验优化】语音助手不仅更智能了一点点点，还支持更多命令了！请到设置页面查看其详情。',
  },
  voiceAssistant: {
    en: 'You can now play music via voice assistant. Notice: you can only say "play music/artist/album/folder/playlist".',
    zh: '现在可以通过语音助手来播放歌曲。注意：目前仅支持说“播放歌曲/歌手/专辑/文件夹/播放列表”。',
  },
  showLyricsInNotifications: {
    en: 'Now lyrics can be displayed in notifications.',
    zh: '现已支持在通知中显示歌词。',
  },
  importLyrics: {
    en: 'Supports importing lyrics from a txt/lrc/mp3 file.',
    zh: '支持从txt、lrc、mp3文件中导入歌词。',
  },
  nowPlayingHighlight: {
    en: 'Fix a highlighting problem when Now Playing playlist has duplicate songs.',
    zh: '修复了正在播放重名歌曲的高亮问题。',
  },
  playNext: {
    en: '"Play Next" has been added to the right-click menu, while "Move to top" is removed.',
    zh: '右键菜单添加了“下一首播放”，移除了“移到最前”。',
  },
  feedbackViaEmail: {
    en: 'Now you can share you feedbacks via email!',
    zh: '现在可以通过邮件提供反馈和建议~',
  },
  bugFixesDragAndDrop: {
    en: 'Drag-and-drop seems to work perfectly.',
    zh: '修复音乐拖拽的问题。',
  },
  playWithSmplayer: {
    en: 'Now supports play music with SMPlayer.',
    zh: '支持用简音播放器播放音乐文件。',
  },
  improveSearchPage: {
    en: 'Search page is improved.',
    zh: '优化了搜索页面。',
  },
  showCount: {
    en: 'Some pages now shows the number of items in a collection.',
    zh: '部分页面会显示列表项总数了。',
  },
  introduceReleaseNotes: {
    en: 'Release Notes dialog is introduced. You can find it in the Settings page.',
    zh: '添加了更新日志，你可以在设置页面再次查看。',
  },
  improveMultiSelect: {
    en: 'Improved multi-select.',
    zh: '优化了多选。',
  },
  createNewPlaylistButtonMoved: {
    en: 'In the Playlist page, the Create New Playlist button is moved to the dropdown list, and the Add To button is removed.',
    zh: '播放列表界面的“创建新的播放列表”已经移到了下拉菜单，“添加到”按钮被移除了。',
  },
  searchPageAddAllToButton: {
    en: 'Search page now has an AddAllTo button.',
    zh: '搜索页面有了“添加全部到”按钮。',
  },
  sortByDateAdded: {
    en: 'Sort by date added.',
    zh: '通过添加日期搜索。',
  },
  openWithSmplayer: {
    en: 'Now supports open music with SMPlayer.',
    zh: '支持用简音播放器打开音乐文件。',
  },
  supportsMultiSelect: {
    en: 'Now supports multi-select.',
    zh: '现已支持多选。',
  },
} satisfies Record<string, ReleaseNoteText>

const releaseNoteDefinitions: Array<{ version: string; items: Array<keyof typeof text> }> = [
  { version: '3.0.0', items: ['modernUi', 'nightMode', 'removedNotificationLyrics', 'tilesUnsupported'] },
  { version: '2.10.3', items: ['bugFixes'] },
  { version: '2.10.1', items: ['switchLanguageSupported', 'improvedVoiceAssistant'] },
  { version: '2.9.15', items: ['addSeeAlbumArtToFullPage', 'crashFixes'] },
  { version: '2.9.14', items: ['bugFixForImportData', 'crashFixes', 'bugFixes'] },
  { version: '2.9.11', items: ['crashFixes'] },
  { version: '2.9.8', items: ['bugFixForImportData', 'crashFixes'] },
  { version: '2.9.6', items: ['crashFixes'] },
  { version: '2.9.2', items: ['crashFixes'] },
  { version: '2.9.0', items: ['addPointerOverButtonsToMusicList', 'bugFixForPlayInTheFlyoutMenu'] },
  { version: '2.8.21', items: ['lazyContent'] },
  { version: '2.8.20', items: ['supportOgg'] },
  { version: '2.8.18', items: ['cancel5SecondsMovePrev', 'lyricsCanBeSavedLater', 'locateMusicBugFix'] },
  { version: '2.8.15', items: ['loopModeMovePrevNextChange', 'recentPlayedNotShow', 'bugFixes'] },
  { version: '2.8.13', items: ['addAuthorizeOtherFolder'] },
  { version: '2.8.11', items: ['bugFixes'] },
  { version: '2.8.8', items: ['bugFixesMovingFolderNotMovingAllFiles'] },
  { version: '2.8.6', items: ['bugFixForNowPlayingPlaylist'] },
  { version: '2.8.5', items: ['bugFixForResumeFile', 'bugFixForSelectingPlayedNowPlayingMusic'] },
  { version: '2.8.0', items: ['notificationLyricsSource', 'useHideFolder', 'bugFixes'] },
  { version: '2.7.11', items: ['useFilenameInsteadOfMusicName'] },
  { version: '2.7.6', items: ['bugFixes'] },
  { version: '2.7.4', items: ['localPageDisplayWhenHoverButton'] },
  { version: '2.7.3', items: ['bugFixForLyrics'] },
  { version: '2.7.1', items: ['bugFixes'] },
  { version: '2.7.0', items: ['updateDialogWithItemClick', 'fixDuplicateMusicWhenReAdded'] },
  { version: '2.6.19', items: ['systemLog'] },
  { version: '2.6.18', items: ['fixPlaylistControlNoUpdate'] },
  { version: '2.6.17', items: ['fixSettingsPageCrash'] },
  { version: '2.6.15', items: ['movePreferenceSettings', 'nowPlayingSupportsMultiSelect', 'bugFixes'] },
  { version: '2.6.11', items: ['unableToAddNewMusic', 'fixFolderSortMakesFolderInvisible', 'fixSearchCrash'] },
  { version: '2.6.7', items: ['fixCrashOfRefreshingDirectory', 'improveLocalPageDropdown'] },
  { version: '2.6.6', items: ['bugFixes'] },
  { version: '2.6.1', items: ['fixSearchResultPageSort', 'fixPreferenceSettingsCrash', 'supportsOtherMusicFormat'] },
  { version: '2.6.0', items: ['redesignLocalPagePathBox', 'adjustAlbumGroupingLogic', 'incompatibleTile', 'improvedLocalPageDragAndDrop', 'updateFolderResult'] },
  { version: '2.5.8', items: ['preferenceSettingsDislikedAndDoNotAppear'] },
  { version: '2.5.6', items: ['fixedPreferenceSettings'] },
  { version: '2.5.5', items: ['improvedLocalManagement', 'bugFixesForAddingPlaylistWhenNone', 'importantNoteDataStructureChanged'] },
  { version: '2.5.2', items: ['voiceAssistantImprovements2', 'preferenceSettingsPreferenceLevelAdded'] },
  { version: '2.5.1', items: ['showInExplorerBugFix', 'settingsCheckBoxChanged', 'preferenceSettingsAdded', 'voiceAssistantImprovements'] },
  { version: '2.5.0', items: ['voiceAssistant'] },
  { version: '2.4.6', items: ['showLyricsInNotifications', 'importLyrics', 'nowPlayingHighlight'] },
  { version: '2.4.5', items: ['playNext', 'feedbackViaEmail', 'bugFixesDragAndDrop', 'playWithSmplayer'] },
  { version: '2.4.4', items: ['improveSearchPage', 'showCount', 'bugFixes'] },
  { version: '2.4.3', items: ['introduceReleaseNotes', 'improveMultiSelect', 'createNewPlaylistButtonMoved', 'searchPageAddAllToButton', 'sortByDateAdded', 'bugFixes'] },
  { version: 'History Updates', items: ['openWithSmplayer', 'supportsMultiSelect'] },
]

export function getReleaseNotes(language: 'en' | 'zh'): ReleaseNoteEntry[] {
  return releaseNoteDefinitions.map((entry) => ({
    version: entry.version,
    items: entry.items.map((key) => text[key][language]),
  }))
}
