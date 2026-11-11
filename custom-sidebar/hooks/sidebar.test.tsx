import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'custom-sidebar',
  component: 'Pane',
  requestId: 'custom-sidebar',
  props: {
    title: '사이드바',
    isFocused: true,
    bodyColumns: 44,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const USAGE = {
  startedAt: 0,
  context: {
    tokens: 164000,
    window: 200000,
    percent: 82,
    breakdown: {
      categories: [
        { name: 'System prompt', tokens: 12000, color: 'x', isDeferred: false, kind: 'used' },
        { name: 'Messages', tokens: 140000, color: 'x', isDeferred: false, kind: 'used' },
        { name: 'Free space', tokens: 36000, color: 'x', isDeferred: false, kind: 'free' },
      ],
    },
  },
  rateLimits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: '2099-01-01T00:00:00Z' }],
  cost: { usd: 1.234 },
}

const ran: string[] = []
const copied: string[] = []
const spawned: string[][] = []

function engine(on: any, store: Record<string, unknown> = {}, commands = ['rename', 'resume'], cwd = '/repo', env: Record<string, string> = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, store)
  mock.env(on, env)
  on('command.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('fs.exists', () => ({ value: false }))
  on('session.id', () => ({ value: 'sess-A' }))
  on('session.cwd', () => ({ value: cwd }))
  on('ui.copy', (_: unknown, e: any) => {
    copied.push(e.text)
    return { value: {} }
  })
  on('command.list', () => ({ value: commands.map(name => ({ name })) }))
  on('command.run', (_: unknown, e: any) => {
    ran.push(e.command + ' ' + e.args)
    return { text: '' }
  })
  on('process.run', (_: unknown, e: any) => {
    const argv = JSON.stringify(e)
    if (argv.includes('powershell')) {
      spawned.push(e.argv ?? e)
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    if (argv.includes('rev-parse')) return { value: { exitCode: 0, stdout: '/repo\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (argv.includes('status')) return { value: { exitCode: 0, stdout: '## main...origin/main [ahead 2]\n M src/App.java\n?? notes.txt\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  return clock
}

test('네 탭이 터미널·데스크톱에서 그려진다', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'refresh-usage' })

    expect((await ui.find({ type: 'Text', text: /82%/ }))?.text).toContain('82%')
    expect(await ui.find({ type: 'Text', text: /대화 메시지/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'compact' })).toBeTruthy()

    await ui.press({ key: 'tab-git' })
    await ui.press({ key: 'refresh-git' })
    expect(await ui.find({ type: 'Text', text: /main/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'file-0' })).toBeTruthy()

    await ui.press({ key: 'tab-rooms' })
    await ui.input({ key: 'room-name', text: '로그인 버그' })
    expect(await ui.find({ type: 'Button', key: 'room-0' })).toBeTruthy()

    await ui.press({ key: 'tab-notes' })
    await ui.input({ key: 'new-note', text: '배포 전 체크' })
    expect(await ui.find({ type: 'Text', text: /배포 전 체크/ })).toBeTruthy()
    await ui.press({ key: 'done-0' })
    expect(await ui.find({ type: 'Button', key: 'clear-done' })).toBeTruthy()
    await ui.press({ key: 'clear-done' })

    await ui.press({ key: 'tab-usage' })
    await ui.unmount()
  }
})

test('사이드바를 넓히면 두 칸으로 나뉘고 막대가 길어진다', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const barLen = (t: string | undefined) => (t ?? '').replace(/[^█░]/g, '').length

  const narrow = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await narrow.press({ key: 'refresh-usage' })
  const narrowBar = barLen((await narrow.find({ type: 'Text', text: /█.*82%/ }))?.text)
  await narrow.unmount()

  const big = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 160 }, surface: 'terminal' })
  await big.press({ key: 'refresh-usage' })
  const wideBar = barLen((await big.find({ type: 'Text', text: /█.*82%/ }))?.text)
  expect(wideBar).toBeGreaterThan(narrowBar)
  expect(await big.find({ type: 'Text', text: /대화 메시지/ })).toBeTruthy()
  // 변경 탭: 파일을 누르면 목록과 diff가 나란히
  await big.press({ key: 'tab-git' })
  await big.press({ key: 'refresh-git' })
  await big.press({ key: 'file-0' })
  expect(await big.find({ type: 'Button', key: 'file-0' })).toBeTruthy()
  expect(await big.find({ type: 'Text', text: /src\/App\.java/ })).toBeTruthy()
  await big.unmount()
})

test('/room 으로 저장한 채팅방으로 이동한다', async ($, on) => {
  engine(on, {
    rooms: [{ name: '결제 리팩터링', id: 'sess-B', cwd: '/repo', savedAt: 1 }],
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  ran.length = 0

  const list = await $.command.run({ command: 'room', args: '' } as any)
  expect(list.text).toContain('결제 리팩터링')

  const go = await $.command.run({ command: 'room', args: '결제' } as any)
  expect(go.text).toContain('이동')

  const save = await $.command.run({ command: 'room', args: '+ 로그인 버그' } as any)
  expect(save.text).toContain('로그인 버그')
})

test('/room + 이름 뒤에 /rename 이 실행되고, 채팅방으로 돌아오면 제목이 그 이름이 된다', async ($, on) => {
  const clock = engine(on, {
    rooms: [{ name: '결제 리팩터링', id: 'sess-B', cwd: '/repo', savedAt: 1 }],
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  ran.length = 0

  await $.command.run({ command: 'room', args: '+ 로그인 버그' } as any)
  await clock.advance(10)
  expect(ran).toContain('rename 로그인 버그')

  const resumed = await $.classic.SessionStart({ source: 'resume', session_id: 'sess-B' } as any)
  expect((resumed as any).sessionTitle).toBe('결제 리팩터링')

  const other = await $.classic.SessionStart({ source: 'resume', session_id: 'sess-Z' } as any)
  expect((other as any).sessionTitle).toBeUndefined()
})

test('/rename 이 실패하면 다음 프롬프트에서 제목을 바꾼다', async ($, on) => {
  const clock = engine(on, {}, [])
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await $.command.run({ command: 'room', args: '+ 회의록 정리' } as any)
  await clock.advance(10)

  const first = await $.classic.UserPromptSubmit({ prompt: '안녕' } as any)
  expect((first as any).sessionTitle).toBe('회의록 정리')
  const second = await $.classic.UserPromptSubmit({ prompt: '다음' } as any)
  expect((second as any).sessionTitle).toBeUndefined()
})

test('채팅방으로 이동하면 지금 표시가 한 번에 옮겨진다', async ($, on) => {
  // 이동 직후 session.id 는 아직 이전 채팅(sess-A)을 돌려주는 상황
  engine(on, {
    rooms: [
      { name: '로그인 버그', id: 'sess-A', cwd: '/repo', savedAt: 1 },
      { name: '결제 리팩터링', id: 'sess-B', cwd: '/repo', savedAt: 2 },
    ],
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', session_id: 'sess-B', cwd: '/repo' } as any)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-rooms' })
  const marked = await ui.find({ type: 'Button', key: 'room-1' })
  expect(JSON.stringify(marked)).toContain('● 결제 리팩터링')
  const other = await ui.find({ type: 'Button', key: 'room-0' })
  expect(JSON.stringify(other)).toContain('→ 로그인 버그')
  await ui.unmount()
})

test('사이드바 맨 위에 현재 폴더와 작업 위치(~로 줄임)가 보이고 전체 경로를 복사할 수 있다', async ($, on) => {
  engine(on, {}, ['rename', 'resume'], '/home/me/projects/my-app')
  await $.session.start({ cwd: '/home/me/projects/my-app', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^my-app$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^~\/projects\/my-app$/ })).toBeTruthy()
    copied.length = 0
    await ui.press({ key: 'copy-path' })
    expect(copied).toEqual(['/home/me/projects/my-app'])
    await ui.unmount()
  }
})

const MIXED = {
  rooms: [
    { name: '로그인 버그', id: 'sess-A', cwd: '/repo', savedAt: 1 },
    { name: 'API 작업', id: 'aaaa-1111', cwd: 'C:\\Users\\user\\my-api', savedAt: 2 },
    { name: '리팩터링', id: 'bbbb-2222', cwd: 'C:\\Users\\user\\my-api', savedAt: 3 },
  ],
}

test('다른 폴더 채팅방은 폴더별 토글로 펼치고, 누르면 새 창(Windows)으로 연다', async ($, on) => {
  engine(on, MIXED, ['rename', 'resume'], '/repo', { OS: 'Windows_NT' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-rooms' })
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'folder-0' }))).toContain('▸ my-api (2)')
  expect(await ui.find({ type: 'Button', key: 'far-0-0' })).toBeFalsy()

  await ui.press({ key: 'folder-0' })
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'folder-0' }))).toContain('▾ my-api')
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'far-0-1' }))).toContain('↗ 리팩터링')

  spawned.length = 0
  await ui.press({ key: 'far-0-0' })
  expect(spawned.length).toBe(1)
  expect(JSON.stringify(spawned[0])).toContain('-EncodedCommand')

  await ui.press({ key: 'folder-0' })
  expect(await ui.find({ type: 'Button', key: 'far-0-0' })).toBeFalsy()
  await ui.unmount()
})

test('창을 열 수 없는 곳에서는 이어서 열 명령을 복사한다, /room 으로도 다른 폴더를 찾는다', async ($, on) => {
  const clock = engine(on, MIXED)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const list = await $.command.run({ command: 'room', args: '' } as any)
  expect(list.text).toContain('↗ API 작업  (my-api)')

  copied.length = 0
  const go = await $.command.run({ command: 'room', args: '리팩' } as any)
  expect(go.text).toContain('새 창')
  for (let i = 0; i < 5 && copied.length === 0; i++) await clock.advance(10)
  expect(copied[0]).toContain('claude --resume bbbb-2222')
})

test('활동 탭: 요청별 기록에 요청이 쌓이고, 누르면 그 동안 쓴 도구가 펼쳐진다', async ($, on) => {
  engine(on)
  on('tool.call', (_: unknown, e: any) =>
    e.command === 'exit 1' ? { result: { stdout: '', stderr: 'x' }, isError: true } : { result: { stdout: 'ok' } },
  )
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: '테스트 좀 돌려줘', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: '테스트 실행' } as any)
  await $.tool.call({ tool: 'Bash', command: 'exit 1' } as any)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/App.java', old_string: 'a', new_string: 'b' } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-activity' })
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'turn-0' }))).toContain('테스트 좀 돌려줘')
  expect(await ui.find({ type: 'Text', text: /도구 3 · 파일 1 · 실패 1/ })).toBeTruthy()
  // 접힌 상태에선 도구가 안 보임
  expect(await ui.find({ type: 'Button', key: 'act-0-0' })).toBeFalsy()
  await ui.press({ key: 'turn-0' })
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'act-0-0' }))).toContain('테스트 실행')
  expect(await ui.find({ type: 'Text', text: /✗/ })).toBeTruthy()
  copied.length = 0
  await ui.press({ key: 'act-0-0' })
  expect(copied).toEqual(['npm test'])
  await ui.press({ key: 'turn-0' })
  expect(await ui.find({ type: 'Button', key: 'act-0-0' })).toBeFalsy()
  // 헤더 '지금' 줄은 턴 밖이면 대기 중
  expect(await ui.find({ type: 'Text', text: /대기 중/ })).toBeTruthy()
  await ui.unmount()
})

test('요청이 5개를 넘으면 최근 5개만 보이고 더 보기로 펼친다, /clear 하면 비워진다', async ($, on) => {
  engine(on)
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  for (let i = 0; i < 7; i++) {
    await $.turn.start({ text: '요청 ' + i, turnId: 't' + i })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't' + i, reason: 'answer' } as any)
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-activity' })
  expect(await ui.find({ type: 'Button', key: 'turn-6' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'turn-1' })).toBeFalsy()
  await ui.press({ key: 'turns-more' })
  expect(await ui.find({ type: 'Button', key: 'turn-0' })).toBeTruthy()
  await ui.unmount()

  await ($ as any).classic.SessionStart({ source: 'clear', session_id: 'sess-C', cwd: '/repo' })
  const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await after.press({ key: 'tab-activity' })
  expect(await after.find({ type: 'Text', text: /아직 보낸 요청이 없어요/ })).toBeTruthy()
  await after.unmount()
})

test('할 일(TodoWrite) 진행이 헤더에, 권한 승인 대기가 경고로 보인다', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {} }))
  on('classic.PermissionRequest', () => ({}))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'a', status: 'completed', activeForm: 'a 하는 중' },
      { content: 'b', status: 'in_progress', activeForm: '테스트 고치는 중' },
      { content: 'c', status: 'pending', activeForm: 'c 하는 중' },
    ],
  } as any)
  await ($ as any).classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /1\/3/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /테스트 고치는 중/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /승인 필요: Bash/ })).toBeTruthy()
  await ui.unmount()
})

test('백그라운드로 돌린 셸이 활동 탭 위쪽에 실행 중으로 보인다', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: { stdout: '', backgroundTaskId: 'bg-42' } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: '개발 서버', run_in_background: true } as any)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-activity' })
  expect(await ui.find({ type: 'Text', text: /1개 실행 중/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /\$ 개발 서버/ })).toBeTruthy()
  await ui.unmount()
})
