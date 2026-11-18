import type { EngineInterface, Register, Timer } from 'claude-code'

// 한 걸음(한 칸 이동)마다 걸리는 시간
const TICK_MS = 150
// 터미널 기본색을 뜻하는 값 (투명처럼 쓰임)
const DEFAULT = 0x01000000
// 새끼 오리 수 기본값 (/duck 0 ~ /duck 3 으로 바꿀 수 있음)
const DEFAULT_BABIES = 3

const PALETTE: Record<string, number> = {
  Y: 0xffd23f, // 엄마 몸통
  W: 0xe6a800, // 엄마 날개
  B: 0xfff1a8, // 새끼 몸통 (연노랑)
  O: 0xff8c1a, // 부리, 발
  K: 0x1a1a1a, // 눈
  // 계절 옷·날씨 (chat-theme 팔레트를 따라감)
  P: 0xf7a8c4, // 벚꽃잎
  Q: 0xfbd3e1, // 연한 벚꽃잎
  D: 0xc2577f, // 벚꽃 꽃심
  T: 0x3fa7e0, // 튜브 파랑
  H: 0xf4f4f4, // 튜브 흰 줄, 선글라스 반짝
  G: 0x262626, // 선글라스
  R: 0xd9453b, // 가을 목도리
  N: 0xb5835a, // 베레모
  S: 0xe8eef2, // 눈, 털모자 테두리
  I: 0xa8d8f0, // 털모자, 얼음빛 눈
}

type Size = 'm' | 'l'
type Frames = { width: number; frames: string[][] }
// height: 모든 프레임의 줄 수(픽셀, 짝수). gap: 오리 사이 간격(칸)
type Family = { height: number; gap: number; mom: Frames; baby: Frames }

// 머리 쪽 몇 줄을 한 칸 뒤로 젖혀서 좌우로 흔들리는 느낌
const tilt = (rows: string[], headRows: number) =>
  rows.map((row, i) => (i < headRows ? row.slice(1) + '.' : row))
const blanks = (n: number, width: number) => Array<string>(n).fill('.'.repeat(width))

// ── M: 12픽셀 높이 (예전 L) ──────────────────────────────
const M_BODY = [
  '......YYY...',
  '.....YYYYY..',
  '.....YYKYOO.',
  '.....YYYYOO.',
  'Y...YYYYY...',
  'YYYYYYYYYY..',
  'YYYWWWWYYY..',
  '.YYYYYYYYY..',
  '..YYYYYYY...',
]
const M: Family = {
  height: 12,
  gap: 2,
  mom: {
    width: 12,
    frames: [
      [...blanks(2, 12), ...M_BODY, '...OO..O....'],
      [...blanks(1, 12), ...tilt(M_BODY, 4), '....O...O...', '....O...OO..'],
    ],
  },
  baby: {
    width: 6,
    frames: [
      [...blanks(6, 6), '...BB.', '...BKO', 'B.BBB.', 'BBBBB.', '.BBB..', '.O.O..'],
      [...blanks(6, 6), '..BB..', '..BKO.', 'B.BBB.', 'BBBBB.', '.BBB..', '..OO..'],
    ],
  },
}

// ── L: 16픽셀 높이, 더 세밀하게 ───────────────────────────
const L_BODY = [
  '.........YYYY...',
  '........YYYYYY..',
  '........YYYYKYOO',
  '........YYYYYYOO',
  '.........YYYYY..',
  'Y.......YYYYY...',
  'YY....YYYYYYY...',
  'YYYYYYYYYYYYYY..',
  'YYYYWWWWWYYYYY..',
  '.YYYYWWWWYYYYY..',
  '..YYYYYYYYYYY...',
  '....YYYYYYYY....',
]
const L: Family = {
  height: 16,
  gap: 2,
  mom: {
    width: 16,
    frames: [
      [...blanks(2, 16), ...L_BODY, '.....O....O.....', '....OO...OO.....'],
      [...blanks(1, 16), ...tilt(L_BODY, 5), '......O...O.....', '......O...O.....', '......O...OO....'],
    ],
  },
  baby: {
    width: 8,
    frames: [
      [...blanks(8, 8), '....BBB.', '...BBBKO', '...BBBB.', 'B..BBBB.', 'BBBBBBB.', 'BBBBBBB.', '.BBBBB..', '..O..O..'],
      [...blanks(8, 8), '...BBB..', '..BBBKO.', '..BBBB..', 'B..BBBB.', 'BBBBBBB.', 'BBBBBBB.', '.BBBBB..', '...OO...'],
    ],
  },
}

const FAMILIES: Record<Size, Family> = { m: M, l: L }
const SIZE_NAMES: Record<Size, string> = { m: '중간', l: '큰' }
const isSize = (v: unknown): v is Size => v === 'm' || v === 'l'
const isBabies = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3

// ── 계절 옷·날씨·바닥 ──────────────────────────────────────
// chat-theme mod에서 고른 팔레트(/theme-chat spring 등)를 따라 옷을 입음.
// chat-theme이 없거나 default면 맨몸 + 잔디 바닥
type Season = 'spring' | 'summer' | 'autumn' | 'winter'
type Theme = Season | 'default'
const isSeason = (v: unknown): v is Season =>
  v === 'spring' || v === 'summer' || v === 'autumn' || v === 'winter'

// 옷 픽셀 하나: [줄, 칸, 색 글자]. 좌표는 걸음 1 프레임 기준 (위 2줄은 모자 자리)
type Px = [number, number, string]
type Outfit = { mom: Px[]; babies: Px[][] } // babies[i]: i번째 새끼 (모자라면 처음부터 다시)
const run = (r: number, a: number, b: number, ch: string): Px[] =>
  Array.from({ length: b - a + 1 }, (_, i) => [r, a + i, ch] as Px)
// 파랑·흰 줄무늬 튜브 한 줄 (2칸마다 색이 바뀜)
const tube = (r: number, a: number, b: number): Px[] =>
  Array.from({ length: b - a + 1 }, (_, i) => [r, a + i, (i >> 1) % 2 ? 'H' : 'T'] as Px)
// 벚꽃 한 송이: 꽃잎 4장 + 진분홍 꽃심
const blossom = (r: number, c: number): Px[] => [
  [r - 1, c, 'P'], [r, c - 1, 'P'], [r, c + 1, 'P'], [r + 1, c, 'P'], [r, c, 'D'],
]

const OUTFITS: Record<Size, Record<Season, Outfit>> = {
  m: {
    // 머리에 벚꽃, 등에 꽃잎. 새끼는 꽃잎 한 장씩 (한 마리는 비움)
    spring: { mom: [...blossom(1, 7), [7, 2, 'Q'], [8, 7, 'P']], babies: [[[6, 3, 'P']], [], [[6, 3, 'Q']]] },
    // 옆모습 선글라스 + 줄무늬 튜브 (몸보다 양옆으로 나옴)
    summer: {
      mom: [...run(4, 5, 8, 'G'), [5, 7, 'G'], [5, 8, 'G'], ...tube(9, -1, 10), ...tube(10, -1, 10)],
      babies: [[...tube(9, -1, 5), ...tube(10, -1, 5)]],
    },
    // 베레모 + 목도리
    autumn: {
      mom: [[0, 7, 'N'], ...run(1, 5, 9, 'N'), ...run(6, 4, 8, 'R'), [7, 5, 'R'], [8, 5, 'R']],
      babies: [run(8, 2, 4, 'R')],
    },
    // 방울 털모자 + 목도리
    winter: {
      mom: [[0, 7, 'S'], ...run(1, 6, 8, 'I'), ...run(2, 5, 9, 'S'), ...run(6, 4, 8, 'S'), [7, 5, 'S'], [8, 5, 'S']],
      babies: [[[4, 3, 'S'], ...run(5, 3, 4, 'I')]],
    },
  },
  l: {
    spring: {
      mom: [...blossom(1, 10), [2, 12, 'Q'], [9, 3, 'P'], [9, 4, 'P'], [10, 10, 'Q'], [8, 7, 'P']],
      babies: [blossom(7, 5), [[8, 4, 'P']], [[8, 6, 'Q']]],
    },
    summer: {
      mom: [
        ...run(4, 9, 12, 'G'), [4, 13, 'H'], ...run(5, 11, 13, 'G'),
        ...tube(11, -1, 15), ...tube(12, -1, 15),
      ],
      babies: [[...tube(13, -1, 8), ...tube(14, -1, 8)]],
    },
    autumn: {
      mom: [[0, 10, 'N'], ...run(1, 8, 13, 'N'), ...run(6, 9, 13, 'R'), [7, 9, 'R'], [8, 9, 'R']],
      babies: [[...run(11, 3, 6, 'R'), [12, 3, 'R']]],
    },
    winter: {
      mom: [
        [0, 10, 'S'], [0, 11, 'S'], ...run(1, 9, 12, 'I'), ...run(2, 8, 13, 'S'),
        ...run(6, 9, 13, 'S'), [7, 9, 'S'], [8, 9, 'S'],
      ],
      babies: [[[6, 5, 'S'], ...run(7, 4, 6, 'I'), ...run(8, 4, 6, 'S')]],
    },
  },
}
// 걸음 2에서 머리가 한 칸 뒤로 젖혀지는 줄 (이 줄보다 위에 입힌 옷도 같이 움직임)
const HEAD_END: Record<Size, { mom: number; baby: number }> = { m: { mom: 6, baby: 8 }, l: { mom: 7, baby: 11 } }

type Dressed = { height: number; gap: number; mom: Frames; babies: Frames[] }
const dressedCache = new Map<string, Dressed>()

// 옷 입힌 프레임. 옷이 위·옆으로 나가면 그만큼 넓히고(간격도 같이 벌어짐), 맨 윗줄을 쓰면 2줄을 더함
// (엄마는 걸음 2에서 한 줄 올라가서, 안 그러면 모자 꼭대기가 잘림. 반칸 블록이라 짝수)
export function dress(size: Size, theme: Theme): Dressed {
  const key = size + theme
  const hit = dressedCache.get(key)
  if (hit) return hit
  const fam = FAMILIES[size]
  const outfit: Outfit = theme === 'default' ? { mom: [], babies: [[]] } : OUTFITS[size][theme]
  const head = HEAD_END[size]
  const allBaby = outfit.babies.flat()
  const top = [...outfit.mom, ...allBaby].some(([r]) => r < 1) ? 2 : 0
  const wear = (base: Frames, px: Px[], pads: Px[], headEnd: number, bob: boolean): Frames => {
    const left = Math.max(0, ...pads.map(([r, c]) => (r < headEnd ? 1 : 0) - c))
    const right = Math.max(0, ...pads.map(([, c]) => c - (base.width - 1)))
    const width = base.width + left + right
    const frames = base.frames.map((rows, f) => {
      const g = [...blanks(top, width), ...rows.map(r => '.'.repeat(left) + r + '.'.repeat(right))].map(r => r.split(''))
      for (const [r, c, ch] of px) {
        const y = top + r - (bob && f === 1 ? 1 : 0)
        const x = left + c - (f === 1 && r < headEnd ? 1 : 0)
        const row = g[y]
        if (row && x >= 0 && x < width) row[x] = ch
      }
      return g.map(r => r.join(''))
    })
    return { width, frames }
  }
  const dressed: Dressed = {
    height: fam.height + top,
    gap: fam.gap,
    mom: wear(fam.mom, outfit.mom, outfit.mom, head.mom, true),
    babies: [0, 1, 2].map(i => wear(fam.baby, outfit.babies[i % outfit.babies.length]!, allBaby, head.baby, false)),
  }
  dressedCache.set(key, dressed)
  return dressed
}

// 바닥 2줄 (gy 0: 윗줄, 1: 아랫줄). 계절마다 잔디·물·낙엽·눈밭
const GROUND_ROWS = 2
function groundColor(theme: Theme, x: number, gy: number): number {
  switch (theme) {
    case 'spring': // 잔디에 떨어진 벚꽃잎
      return gy ? 0x5a8f3c : x % 9 === 4 ? PALETTE.P! : x % 13 === 8 ? PALETTE.Q! : 0x7fb069
    case 'summer': // 물결
      return gy ? 0x2a7cb8 : (x >> 1) % 3 === 0 ? 0x8fd3f4 : 0x3fa7e0
    case 'autumn': // 흙길에 낙엽
      return gy ? 0x6a4a2c : x % 5 === 1 ? 0xd9453b : x % 7 === 3 ? 0xe0902a : x % 11 === 6 ? 0xe0b84a : 0x8a6440
    case 'winter': // 눈밭
      return gy ? 0xc9d6de : x % 6 === 2 ? PALETTE.I! : PALETTE.S!
    default: // 잔디
      return gy ? 0x3f6b2a : x % 7 === 3 ? 0x7fb069 : 0x5a8f3c
  }
}

// 날씨: 봄은 꽃잎이 왼쪽으로 날리며 떨어지고, 겨울은 눈이 천천히 내림. 키는 y * 4096 + x
const hash = (n: number) => {
  let h = Math.imul(n + 1, 2654435761) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 2246822507) >>> 0
  return (h ^ (h >>> 13)) >>> 0
}
function weather(theme: Theme, step: number, w: number, h: number): Map<number, number> {
  const out = new Map<number, number>()
  if (theme !== 'spring' && theme !== 'winter') return out
  const isSnow = theme === 'winter'
  const count = Math.max(3, Math.round(w / (isSnow ? 6 : 9)))
  const span = h + 3
  for (let i = 0; i < count; i++) {
    const r = hash(i)
    const y = ((r >>> 10) + Math.floor(step / (isSnow ? 3 : 2))) % span - 3
    if (y < 0) continue
    const drift = isSnow ? 0 : Math.floor(step / 6)
    const sway = (Math.floor(step / 4) + i) % 4 < 2 ? 0 : 1
    const x = ((((r % w) - drift + sway) % w) + w) % w
    out.set(y * 4096 + x, isSnow ? (i % 4 ? PALETTE.S! : PALETTE.I!) : i % 3 ? PALETTE.P! : PALETTE.Q!)
  }
  return out
}

// chat-theme이 공개한 팔레트 이름 (없어도 오리는 걸어야 해서 의존성으로 묶지 않고 직접 읽음)
async function readTheme($: EngineInterface): Promise<Theme> {
  try {
    const { value } = (await $.state.get({ plugin: 'chat-theme', key: 'colors' } as any)) as {
      value?: { palette?: unknown }
    }
    const palette = value?.palette
    if (isSeason(palette)) return palette
  } catch {}
  return 'default'
}

// 32비트 리틀엔디안 숫자들을 Raster가 받는 base64로
function pack(numbers: number[]): string {
  const bytes = new Uint8Array(numbers.length * 4)
  numbers.forEach((n, i) => {
    bytes[i * 4] = n & 0xff
    bytes[i * 4 + 1] = (n >>> 8) & 0xff
    bytes[i * 4 + 2] = (n >>> 16) & 0xff
    bytes[i * 4 + 3] = (n >>> 24) & 0xff
  })
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += abc[(n >> 18) & 63]! + abc[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? abc[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? abc[n & 63]! : '='
  }
  return out
}

// 화면에 놓일 오리 한 마리: 왼쪽 끝 열과 그릴 프레임
type Placed = { x: number; width: number; frame: string[] }

// 폭 columns짜리 화면에 오리 가족을 그린 셀들 (반칸 블록: 한 줄에 2픽셀)
function drawCells(columns: number, height: number, pixel: (px: number, py: number) => number | undefined): string {
  const numbers: number[] = []
  for (let row = 0; row < height / 2; row++) {
    for (let col = 0; col < columns; col++) {
      const top = pixel(col, row * 2)
      const bottom = pixel(col, row * 2 + 1)
      if (top === undefined && bottom === undefined) {
        numbers.push(0x20, DEFAULT, DEFAULT) // 공백
      } else if (top === undefined) {
        numbers.push(0x2584, bottom!, DEFAULT) // ▄
      } else {
        numbers.push(0x2580, top, bottom ?? DEFAULT) // ▀
      }
    }
  }
  return pack(numbers)
}

export const register: Register = on => {
  let timer: Timer | undefined
  let turnStartedAt = 0
  let size: Size = 'm'
  let babies = DEFAULT_BABIES
  let enabled = true

  const describe = () =>
    `${SIZE_NAMES[size]} 오리(${size}), 새끼 ${babies}마리`

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'duck',
      description: '오리 설정: /duck on|off, /duck m|l 크기, /duck 0~3 새끼 수',
      immediate: true,
    })
    const savedSize = await $.store.get('size')
    if (isSize(savedSize)) size = savedSize
    const savedBabies = await $.store.get('babies')
    if (isBabies(savedBabies)) babies = savedBabies
    if ((await $.store.get('enabled')) === false) enabled = false
    return next(e)
  })

  on('command.run', { command: 'duck' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    if (want === 'off' || want === 'on') {
      enabled = want === 'on'
      await $.store.set('enabled', enabled)
      if (!enabled) { timer?.cancel(); timer = undefined }
      $.ui.invalidate('ui.render')
      return { text: enabled ? '오리가 돌아왔어요. 꽥!' : '오리를 껐어요. 다시 켜려면 /duck on' }
    } else if (isSize(want)) {
      size = want
      await $.store.set('size', size)
    } else if (/^[0-3]$/.test(want)) {
      babies = Number(want)
      await $.store.set('babies', babies)
    } else {
      return { text: `지금은 ${enabled ? describe() : '꺼진 상태'}예요. 켜기/끄기는 /duck on, off, 크기는 /duck m, l, 새끼 수는 /duck 0~3` }
    }
    $.ui.invalidate('ui.render')
    return { text: `${describe()}로 바꿨어요. 꽥!` }
  })

  on('turn.start', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    timer?.cancel()
    if (!enabled) return next(e)
    timer = $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    timer?.cancel()
    timer = undefined
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // 작업 중이 아니면 오리들은 쉬고, 다른 mod(token-weather 등)는 그대로
    if (!enabled || !e.props.isWorking || e.props.hasSurvey) return next(e)
    // 터미널(CLI)에서만 걷고, 데스크톱 앱·VS Code·모바일에서는 그리지 않음
    if (e.surface !== 'terminal') return next(e)

    const theme = await readTheme($)
    const fam = dress(size, theme)
    const now = await $.clock.now()
    const step = Math.floor(now / TICK_MS)
    const seconds = turnStartedAt ? Math.floor((now - turnStartedAt) / 1000) : 0
    const columns = Math.max(fam.mom.width, Math.min(512, e.props.bodyColumns))
    const widthPx = columns

    // 엄마가 앞장서고, 새끼들이 뒤에 한 줄로. 행렬 전체가 화면을 지나가면 처음부터
    const babyStride = fam.babies[0]!.width + fam.gap
    const trainWidth = fam.mom.width + babies * babyStride
    const momX = (step % (widthPx + trainWidth)) - fam.mom.width
    const beat = Math.floor(step / 2)

    const ducks: Placed[] = [
      { x: momX, width: fam.mom.width, frame: fam.mom.frames[beat % 2]! },
    ]
    for (let i = 0; i < babies; i++) {
      const baby = fam.babies[i]!
      ducks.push({
        x: momX - (i + 1) * babyStride,
        width: baby.width,
        // 새끼마다 발을 엇갈리게 내딛음
        frame: baby.frames[(beat + i + 1) % 2]!,
      })
    }

    // 장면: 바닥 → 오리 → 그 뒤로 날리는 꽃잎·눈
    const flakes = weather(theme, step, widthPx, fam.height)
    const height = fam.height + GROUND_ROWS
    const pixel = (px: number, py: number): number | undefined => {
      if (py >= fam.height) return groundColor(theme, px, py - fam.height)
      for (const d of ducks) {
        const sx = px - d.x
        if (sx < 0 || sx >= d.width) continue
        const ch = d.frame[py]?.[sx]
        if (ch && ch !== '.') return PALETTE[ch]
      }
      return flakes.get(py * 4096 + px)
    }

    const theirs = await next(e)
    const ui = $.ui.resolve(e)
    const caption = `꽥꽥… 작업 중 ${seconds}s`

    if (e.surface === 'terminal' && 'Raster' in ui) {
      const { Box, Text, Raster } = ui
      return (
        <Box flexDirection="column">
          <Raster
            key="duck"
            columns={columns}
            rows={height / 2}
            cells={drawCells(columns, height, pixel)}
          />
          <Text dimColor>{caption}</Text>
          {theirs}
        </Box>
      )
    }

    // 픽셀 그리드가 없는 화면이면 오리 없이 그대로
    return theirs
  })
}
