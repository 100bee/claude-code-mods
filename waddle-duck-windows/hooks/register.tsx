import type { Register, Timer } from 'claude-code'

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
function drawCells(columns: number, height: number, ducks: Placed[]): string {
  const pixel = (px: number, py: number): number | undefined => {
    for (const d of ducks) {
      const sx = px - d.x
      if (sx < 0 || sx >= d.width) continue
      const ch = d.frame[py]?.[sx]
      if (ch && ch !== '.') return PALETTE[ch]
    }
    return undefined
  }
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

    const fam = FAMILIES[size]
    const now = await $.clock.now()
    const step = Math.floor(now / TICK_MS)
    const seconds = turnStartedAt ? Math.floor((now - turnStartedAt) / 1000) : 0
    const columns = Math.max(fam.mom.width, Math.min(512, e.props.bodyColumns))

    // 엄마가 앞장서고, 새끼들이 뒤에 한 줄로. 행렬 전체가 화면을 지나가면 처음부터
    const babyStride = fam.baby.width + fam.gap
    const trainWidth = fam.mom.width + babies * babyStride
    const momX = (step % (columns + trainWidth)) - fam.mom.width
    const beat = Math.floor(step / 2)

    const ducks: Placed[] = [
      { x: momX, width: fam.mom.width, frame: fam.mom.frames[beat % 2]! },
    ]
    for (let i = 0; i < babies; i++) {
      ducks.push({
        x: momX - (i + 1) * babyStride,
        width: fam.baby.width,
        // 새끼마다 발을 엇갈리게 내딛음
        frame: fam.baby.frames[(beat + i + 1) % 2]!,
      })
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
            rows={fam.height / 2}
            cells={drawCells(columns, fam.height, ducks)}
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
