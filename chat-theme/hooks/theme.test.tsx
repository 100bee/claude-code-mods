import { expect, mock, test } from 'claude-code/testing'

const USER = {
  plugin: 'chat-theme',
  component: 'UserMessage',
  props: { text: '로그인 API 에러 좀 봐줘', origin: { kind: 'composer' }, isExpanded: true },
  viewport: { columns: 80, rows: 40 },
} as any
const CLAUDE = {
  plugin: 'chat-theme',
  component: 'AssistantMessage',
  props: { text: 'AuthService.java 42번 줄을 보세요', isFirstOfReply: true },
  viewport: { columns: 80, rows: 40 },
} as any

function engine(on: any, store: Record<string, unknown> = {}, now = Date.parse('2026-11-11T12:00:00Z')) {
  mock.store(on, store)
  mock.clock(on, { now })
  on('command.register', () => ({ value: {} }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  // 엔진이 원래 그리는 메시지 대신 본문 한 줄
  on('ui.render', (_: unknown, e: any) => ({ type: 'Text', props: {}, children: [e.props.text] }))
}

for (const style of ['box', 'line'] as const) {
  test(`${style}: 내 메시지와 Claude 답변이 감싸진다`, async ($, on) => {
    engine(on, { palette: 'spring', style, isOn: true })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    for (const row of [USER, CLAUDE]) {
      const ui = await $.ui.mount({ ...row, surface: 'terminal' })
      const title = row === USER ? /나/ : /Claude/
      expect(await ui.find({ type: 'Text', text: title })).toBeTruthy()
      await ui.unmount()
    }
  })
}

test('예전 bubble 설정이 남아 있어도 내 메시지는 왼쪽 정렬', async ($, on) => {
  engine(on, { style: 'box', layout: 'bubble', isOn: true })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...USER, surface: 'terminal' })
  expect(JSON.stringify(await ui.find({ type: 'Box' }))).not.toContain('flex-end')
  await ui.unmount()
})

for (const saved of [undefined, 'ocean', 'catppuccin']) {
  test(`저장값 ${saved}: default(하늘색/주황)로 시작`, async ($, on) => {
    engine(on, saved ? { palette: saved } : {})
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    const r = (await $.command.run({ command: 'theme-chat', args: '' } as any)) as any
    expect(JSON.stringify(r)).toContain('팔레트 default,')
    const gone = (await $.command.run({ command: 'theme-chat', args: 'sunset' } as any)) as any
    expect(JSON.stringify(gone)).toContain('없는 옵션')
  })
}

test('계절을 직접 고르면 auto보다 우선한다', async ($, on) => {
  engine(on, { palette: 'auto', style: 'box', isOn: true }, Date.parse('2026-07-01T12:00:00Z'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(JSON.stringify(await $.command.run({ command: 'theme-chat', args: '' } as any))).toContain('팔레트 summer(지금 계절 자동)')
  const r = (await $.command.run({ command: 'theme-chat', args: 'winter' } as any)) as any
  expect(JSON.stringify(r)).toContain('팔레트 winter,')
})

test('box 상자는 0.1에서 그려졌던 속성만 쓴다 (폭·여백 없음)', async ($, on) => {
  engine(on, { style: 'box', isOn: true })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...USER, viewport: { columns: 200, rows: 40 }, surface: 'terminal' })
  const tree = JSON.stringify(await ui.find({ type: 'Box' }))
  expect(tree).toContain('round')
  expect(tree).not.toContain('"width"')
  expect(tree).not.toContain('paddingX')
  await ui.unmount()
})
