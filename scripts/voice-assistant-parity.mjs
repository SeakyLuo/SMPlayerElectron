import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tempDir = join(root, 'node_modules', '.tmp', 'voice-assistant-parity')

const sourceFiles = [
  'src/shared/VoiceAssistantHelper.ts',
  'src/shared/VoiceAssistantChineseHelper.ts',
  'src/shared/VoiceAssistantEnglishHelper.ts',
]

await rm(tempDir, { force: true, recursive: true })
await mkdir(tempDir, { recursive: true })

for (const sourceFile of sourceFiles) {
  const sourcePath = join(root, sourceFile)
  const sourceText = await ts.sys.readFile(sourcePath, 'utf8')
  const output = ts.transpileModule(sourceText, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ES2022,
      verbatimModuleSyntax: true,
    },
  }).outputText
    .replaceAll('./VoiceAssistantChineseHelper', './VoiceAssistantChineseHelper.mjs')
    .replaceAll('./VoiceAssistantEnglishHelper', './VoiceAssistantEnglishHelper.mjs')
    .replaceAll('./VoiceAssistantHelper', './VoiceAssistantHelper.mjs')

  await writeFile(join(tempDir, sourceFile.split('/').at(-1).replace('.ts', '.mjs')), output, 'utf8')
}

const { ByArtistRequest, MatchType, VoiceAssistantHelper } = await import(pathToFileURL(join(tempDir, 'VoiceAssistantHelper.mjs')))

const cases = [
  ['en-US', 'play', MatchType.Play],
  ['en-US', 'quick play', MatchType.QuickPlay],
  ['en-US', 'play music', MatchType.PlayMusic, ''],
  ['en-US', 'play artist', MatchType.PlayArtist, ''],
  ['en-US', 'play album', MatchType.PlayAlbum, ''],
  ['en-US', 'play playlist', MatchType.PlayPlaylist, ''],
  ['en-US', 'play folder', MatchType.PlayFolder, ''],
  ['en-US', 'play music Billie Jean', MatchType.PlayMusic, 'Billie Jean'],
  ['en-US', 'play artist Michael Jackson', MatchType.PlayArtist, 'Michael Jackson'],
  ['en-US', 'play album Thriller by Michael Jackson', MatchType.PlayByArtistAndAlbum, { artist: 'Thriller', item: 'Michael Jackson' }],
  ['en-US', 'play Billie Jean by Michael Jackson', MatchType.PlayByArtist, { artist: 'Billie Jean', item: 'Michael Jackson' }],
  ['en-US', 'play music Billie Jean in playlist Favorites', MatchType.PlayMusicInPlaylist, { artist: 'Billie Jean', item: 'playlist Favorites' }],
  ['en-US', 'turn up the volume by 10%', MatchType.ChangeVolume, { turnUp: true, percentage: true, value: 10 }],
  ['en-US', 'search moonlight', MatchType.Search, 'moonlight'],
  ['en-US', 'never mind', MatchType.Nothing],
  ['zh-CN', '播放', MatchType.Play],
  ['zh-CN', '快速播放', MatchType.QuickPlay],
  ['zh-CN', '播放歌曲', MatchType.PlayMusic, ''],
  ['zh-CN', '播放歌手', MatchType.PlayArtist, ''],
  ['zh-CN', '播放专辑', MatchType.PlayAlbum, ''],
  ['zh-CN', '播放歌单', MatchType.PlayPlaylist, ''],
  ['zh-CN', '播放文件夹', MatchType.PlayFolder, ''],
  ['zh-CN', '播放歌曲晴天', MatchType.PlayMusic, '晴天'],
  ['zh-CN', '播放歌手周杰伦', MatchType.PlayArtist, '周杰伦'],
  ['zh-CN', '播放周杰伦的专辑七里香', MatchType.PlayByArtistAndAlbum, { artist: '周杰伦', item: '七里香' }],
  ['zh-CN', '播放周杰伦的歌晴天', MatchType.PlayByArtistAndMusic, { artist: '周杰伦', item: '晴天' }],
  ['zh-CN', '播放专辑七里香中的晴天', MatchType.PlayMusicInAlbum, { artist: '七里香', item: '晴天' }],
  ['zh-CN', '音量调高10%', MatchType.ChangeVolume, { turnUp: true, percentage: true, value: 10 }],
  ['zh-CN', '搜索晴天', MatchType.Search, '晴天'],
  ['zh-CN', '算了', MatchType.Nothing],
]

for (const [language, text, expectedType, expectedParam] of cases) {
  const actual = VoiceAssistantHelper.handle(text, language)
  assert.equal(actual.type, expectedType, `${text} should be ${expectedType}`)

  if (typeof expectedParam === 'string') {
    assert.equal(actual.param, expectedParam, `${text} param`)
  } else if (expectedParam instanceof Object) {
    if (actual.param instanceof ByArtistRequest) {
      assert.equal(actual.param.artist, expectedParam.artist, `${text} artist`)
      assert.equal(actual.param.item, expectedParam.item, `${text} item`)
    } else {
      assert.deepEqual(
        {
          turnUp: actual.param.turnUp,
          percentage: actual.param.percentage,
          value: actual.param.value,
        },
        expectedParam,
        `${text} volume`,
      )
    }
  }
}

console.log(`Voice assistant parity cases passed: ${cases.length}`)
