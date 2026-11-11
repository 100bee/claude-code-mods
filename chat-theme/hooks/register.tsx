import type { EngineInterface, Register } from 'claude-code'

// ── 팔레트 (/theme-chat 으로 고름) ─────────────────────────
// title: 제목 글자색(진하게), border: 테두리·선 색(같은 색을 배경 쪽으로 50% 섞어 흐리게)
// 테두리를 흐리게 두면 상자가 덜 시끄럽고 제목만 눈에 들어온다.
// default(기본값) + 사계절 팔레트. 사계절끼리는 색이 겹치지 않게 골랐다
// (예전 sunset·forest·mono·catppuccin·dracula·nord는 겹쳐서 지움, ocean은 default로 이름만 바꿈).
type PaletteName = 'default' | 'spring' | 'summer' | 'autumn' | 'winter'
type Tone = { title: string; border: string }
type Palette = { user: Tone; claude: Tone }
const PALETTES: Record<PaletteName, Palette> = {
  // 나: 하늘색 / Claude: 주황 (Claude 브랜드 색에 가까움). 예전 이름 ocean
  default: {
    user: { title: '#5ec8f2', border: '#3e7388' },
    claude: { title: '#d97757', border: '#7b4a3a' },
  },
  // 나: 새싹 연두 / Claude: 벚꽃 연분홍
  spring: {
    user: { title: '#9fd67a', border: '#5f7a4c' },
    claude: { title: '#f7a8c4', border: '#8b6371' },
  },
  // 나: 해바라기 노랑 / Claude: 바다 파랑
  summer: {
    user: { title: '#ffd23f', border: '#8f782f' },
    claude: { title: '#3fa7e0', border: '#2f637f' },
  },
  // 나: 단풍 빨강 / Claude: 낙엽 갈색 (은행 노랑은 여름 해바라기와 겹쳐서 갈색으로)
  autumn: {
    user: { title: '#d9453b', border: '#7c322d' },
    claude: { title: '#b5835a', border: '#6a513c' },
  },
  // 나: 눈 흰색 / Claude: 얼음 하늘색 (밝은 배경 터미널에선 흰색이 흐리게 보일 수 있음)
  winter: {
    user: { title: '#e8eef2', border: '#838688' },
    claude: { title: '#a8d8f0', border: '#637b87' },
  },
}
const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[]
const isPalette = (v: unknown): v is PaletteName => typeof v === 'string' && v in PALETTES
// 'auto': 날짜로 지금 계절을 고름. 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울
type Choice = PaletteName | 'auto'
const isChoice = (v: unknown): v is Choice => v === 'auto' || isPalette(v)
const seasonOf = (ms: number): PaletteName => {
  const m = new Date(ms).getMonth() + 1
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'
}

// ── 감싸는 방식 ───────────────────────────────────────────
// box:  둥근 상자. 제목은 상자 안 첫 줄 (기본값)
// line: 위아래 색 줄만 그림 (본문 폭을 줄이지 않고, 복사할 때 테두리 문자가 섞이지 않음)
type Style = 'line' | 'box'
const isStyle = (v: unknown): v is Style => v === 'line' || v === 'box'

const TITLE = { user: '나', claude: 'Claude' } as const
// 창 너비에서 뺄 칸 수. Claude Code가 메시지 앞에 붙이는 여백만큼 둔다.
// 줄 끝이 다음 줄로 넘어가 보이면 이 값을 1~2 늘리면 된다.
const GUTTER = 2
const MIN_WIDTH = 20

// 터미널에서 실제로 차지하는 칸 수. 한글·한자·전각·이모지는 2칸.
// (String.length는 '나'를 1로 세서, 예전 line 방식에서 '나' 쪽 윗줄이 한 칸 길게 나왔다)
const isWide = (cp: number) =>
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0xa4cf) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6) ||
  (cp >= 0x1f300 && cp <= 0x1faff) ||
  (cp >= 0x20000 && cp <= 0x3fffd)
const displayWidth = (s: string) => {
  let w = 0
  for (const ch of s) w += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1
  return w
}

// 고른 팔레트 색을 공개: 사이드바 같은 다른 mod가 읽고 색을 맞춘다
async function publishColors($: EngineInterface, palette: PaletteName) {
  const p = PALETTES[palette]
  await $.state
    .set({ plugin: 'chat-theme', key: 'colors' } as const, { palette, user: p.user, claude: p.claude })
    .catch(() => {})
}

export const register: Register = on => {
  let choice: Choice = 'default'
  let palette: PaletteName = 'default'
  let style: Style = 'box'
  let isOn = true

  const describe = () =>
    isOn
      ? `팔레트 ${palette}${choice === 'auto' ? '(지금 계절 자동)' : ''}, ${style === 'line' ? '줄(line)' : '상자(box)'} 방식`
      : '꺼져 있음'
  const OPTIONS = `팔레트: ${PALETTE_NAMES.join(', ')}, auto(지금 계절) / 방식: box, line / on, off`

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'theme-chat',
      description: `채팅 테마: /theme-chat <${PALETTE_NAMES.join('|')}|auto|box|line|on|off>`,
      immediate: true,
    })
    const savedPalette = await $.store.get('palette')
    if (isChoice(savedPalette)) choice = savedPalette
    // 지운 팔레트(sunset·forest·mono 등)나 예전 이름 ocean을 쓰던 중이면 default로 저장
    else if (savedPalette !== undefined) await $.store.set('palette', choice)
    palette = choice === 'auto' ? seasonOf(await $.clock.now()) : choice
    const savedStyle = await $.store.get('style')
    if (isStyle(savedStyle)) style = savedStyle
    // 예전 배치(wide/bubble) 설정은 없앤 옵션이라 지움
    await $.store.delete('layout').catch(() => {})
    const savedOn = await $.store.get('isOn')
    if (typeof savedOn === 'boolean') isOn = savedOn
    await publishColors($, palette)
    return next(e)
  })

  on('command.run', { command: 'theme-chat' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    if (!want) {
      return { text: `지금은 ${describe()}이에요. ${OPTIONS}` }
    }
    if (isChoice(want)) {
      choice = want
      isOn = true
      await $.store.set('palette', choice)
      palette = choice === 'auto' ? seasonOf(await $.clock.now()) : choice
    } else if (isStyle(want)) {
      style = want
      isOn = true
      await $.store.set('style', style)
    } else if (want === 'on' || want === 'off') {
      isOn = want === 'on'
    } else {
      return { text: `'${want}'는 없는 옵션이에요. ${OPTIONS}` }
    }
    await $.store.set('isOn', isOn)
    await publishColors($, palette)
    $.ui.invalidate('ui.render')
    return { text: `채팅 테마를 바꿨어요: ${describe()}` }
  })

  // line 방식 윗줄: ╭─ 제목 ────────
  // 선은 흐린 border 색, 제목만 진한 title 색 + 굵게.
  const topRule = (Text: any, tone: Tone, title: string, width: number, corner: string) => {
    const left = '╭─ '
    const used = displayWidth(left) + displayWidth(title) + 1 + displayWidth(corner)
    const dashes = '─'.repeat(Math.max(2, width - used))
    return (
      <Text wrap="truncate-end">
        <Text color={tone.border}>{left}</Text>
        <Text color={tone.title} bold>
          {title}
        </Text>
        <Text color={tone.border}>{' ' + dashes + corner}</Text>
      </Text>
    )
  }

  // Claude Code가 원래 그린 메시지(마크다운·코드 블록 포함)를 받아 바깥만 감싼다.
  // 엔진은 훅 자리에 함수 리터럴만 받으므로, 두 훅이 각자 리터럴로 이 그리기 함수를 부른다.
  // $는 훅 안에서만 쓰고, 여기에는 훅이 $.ui.resolve(e)로 얻은 Box·Text만 넘긴다.
  const frame = (ui: any, columns: number | undefined, theirs: unknown, who: 'user' | 'claude') => {
    const { Box, Text } = ui
    const tone = PALETTES[palette][who]
    const title = TITLE[who]
    // e.viewport.columns는 터미널 전체 폭이라, 사이드바가 붙으면 메시지 자리보다 넓다.
    // 그래서 line 방식의 선은 넉넉히 그린 뒤 자리에 맞게 잘라낸다.
    const ruleLen = Math.max(MIN_WIDTH, (columns ?? 80) - GUTTER)

    // 메시지를 감싸는 Box는 엔진이 엄격하게 검사한다. 0.1에서 실제로 그려졌던
    // flexDirection·borderStyle·borderColor만 쓴다. width·paddingX를 주면 실제 터미널에서
    // 거절돼 원래 모양으로 그려졌음(테스트는 통과함).
    if (style === 'box') {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={tone.border}>
          <Text color={tone.title} bold>
            {title}
          </Text>
          {theirs}
        </Box>
      )
    }
    // line 방식: ╭─ 제목 ───── / 메시지 / ╰──────
    return (
      <Box flexDirection="column">
        {topRule(Text, tone, title, ruleLen, '')}
        {theirs}
        <Text color={tone.border} wrap="truncate-end">
          {'╰' + '─'.repeat(ruleLen - 1)}
        </Text>
      </Box>
    )
  }

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!isOn) return next(e)
    const theirs = await next(e)
    return frame($.ui.resolve(e), e.viewport?.columns, theirs, 'user')
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!isOn) return next(e)
    const theirs = await next(e)
    return frame($.ui.resolve(e), e.viewport?.columns, theirs, 'claude')
  })
}
