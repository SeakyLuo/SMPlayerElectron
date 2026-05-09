const localTextCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})

export const LOCAL_TEXT_QUICK_JUMP_KEYS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const LOCAL_TEXT_PINYIN_BOUNDARIES = [
  ['A', '阿'],
  ['B', '芭'],
  ['C', '擦'],
  ['D', '搭'],
  ['E', '蛾'],
  ['F', '发'],
  ['G', '噶'],
  ['H', '哈'],
  ['J', '击'],
  ['K', '喀'],
  ['L', '垃'],
  ['M', '妈'],
  ['N', '拿'],
  ['O', '哦'],
  ['P', '啪'],
  ['Q', '期'],
  ['R', '然'],
  ['S', '撒'],
  ['T', '塌'],
  ['W', '挖'],
  ['X', '昔'],
  ['Y', '压'],
  ['Z', '匝'],
] as const

function getLocalTextSortBucket(value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return 0
  }

  return /^[0-9A-Za-z]/.test(trimmedValue) ? 1 : 2
}

export function compareLocalText(left: string, right: string) {
  const leftBucket = getLocalTextSortBucket(left)
  const rightBucket = getLocalTextSortBucket(right)

  if (leftBucket !== rightBucket) {
    return leftBucket - rightBucket
  }

  return localTextCollator.compare(left, right)
}

export function getLocalTextQuickJumpBucket(value: string) {
  const firstChar = value.trim().charAt(0)
  const normalizedFirstChar = firstChar
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase()

  if (/^[A-Z]$/.test(normalizedFirstChar)) {
    return normalizedFirstChar
  }

  if (!/[\u3400-\u9fff]/.test(firstChar)) {
    return '#'
  }

  for (let index = LOCAL_TEXT_PINYIN_BOUNDARIES.length - 1; index >= 0; index -= 1) {
    const [key, boundary] = LOCAL_TEXT_PINYIN_BOUNDARIES[index]!
    if (localTextCollator.compare(firstChar, boundary) >= 0) {
      return key
    }
  }

  return '#'
}
