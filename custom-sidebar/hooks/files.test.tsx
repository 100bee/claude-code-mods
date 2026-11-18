import { expect, mock, test } from 'claude-code/testing'

// 파일 탭: 폴더 목록을 오가고, 파일을 누르면 연결된 프로그램으로 열림

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

const OK = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

// psExit: powershell 이 돌려줄 종료 코드 (3 = VS Code 가 없어 메모장으로 연 경우)
// uname: 맥·리눅스 흉내 ('Darwin' 이면 맥)
function engine(on: any, files: Record<string, string>, env: Record<string, string> = {}, psExit = 0, uname = 'Linux', commands: unknown[] = []) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const store: Record<string, unknown> = {}
  mock.store(on, store)
  mock.env(on, env)
  on('command.register', () => ({ value: {} }) as any)
  on('command.list', () => ({ value: commands }))
  const fills: string[] = []
  on('prompt.fill', (_: unknown, e: any) => (fills.push(e.text), { isFilled: true }))
  const opened: unknown[] = []
  on('ui.open', (_: unknown, e: unknown) => (opened.push(e), { value: { isPlaced: true } }) as any)
  const toasts: string[] = []
  on('ui.toast', (_: unknown, e: any) => (toasts.push(e.text), { value: {} }) as any)
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }) as any)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 0, window: 200000, percent: 0 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'sess-A' }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  const runs: string[] = []
  on('process.run', (_: unknown, e: any) => {
    const argv: string[] = e.argv ?? []
    const i = argv.indexOf('-EncodedCommand')
    // powershell 스크립트는 UTF-16LE base64 로 넘어감 → 풀어서 기록
    if (i >= 0) {
      const bin = atob(argv[i + 1]!)
      let s = ''
      for (let j = 0; j + 1 < bin.length; j += 2) s += String.fromCharCode(bin.charCodeAt(j) | (bin.charCodeAt(j + 1) << 8))
      runs.push(s)
    } else runs.push(argv.join(' '))
    return { value: argv[0] === 'uname' ? { ...OK, stdout: uname + '\n' } : i >= 0 ? { ...OK, exitCode: psExit } : OK }
  })

  // 엔진이 경로를 운영체제식 절대 경로로 바꿔 넘김 (윈도우에선 C 드라이브 + 역슬래시) → /repo 꼴로 맞춤
  const P = (p: string) => String(p).replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  on('fs.list', (_: unknown, e: any) => {
    const d = P(e.path).replace(/\/$/, '')
    const names = new Map<string, 'file' | 'dir'>()
    for (const k of Object.keys(files)) {
      if (!k.startsWith(d + '/')) continue
      const rest = k.slice(d.length + 1)
      names.set(rest.split('/')[0]!, rest.includes('/') ? 'dir' : 'file')
    }
    return {
      value: [...names].map(([name, kind]) => ({
        name,
        kind,
        size: kind === 'file' ? files[d + '/' + name]!.length : 0,
        mtimeMs: 1,
        isLink: false,
      })),
    }
  })
  on('fs.stat', (_: unknown, e: any) => {
    const p = P(e.path).replace(/(.)\/$/, '$1')
    if (p in files) return { value: { kind: 'file', size: files[p]!.length, mtimeMs: 1 } } as any
    if (Object.keys(files).some(k => k.startsWith(p.replace(/\/$/, '') + '/'))) return { value: { kind: 'dir', size: 0, mtimeMs: 1 } } as any
    throw new Error('ENOENT: ' + p)
  })
  const writes: string[] = []
  on('fs.write', (_: unknown, e: any) => {
    const p = P(e.path)
    writes.push(p)
    files[p] = e.text
    return { value: undefined } as any
  })
  const copies: string[] = []
  on('ui.copy', (_: unknown, e: any) => (copies.push(e.text), { value: { isCopied: true } }) as any)
  return { runs, toasts, store, fills, opened, writes, copies, clock }
}

test('파일 탭 $ 칸: cd 폴더 · cd .. · cd ~ · cd 만(작업 폴더) · ls · ls 폴더 · dir, 안 되는 건 알려 줌', async ($, on) => {
  const { runs, toasts, opened, clock } = engine(on, { '/repo/a.txt': 'hello', '/repo/src/b.ts': 'x', '/home/me/notes/n.md': 'n' }, { HOME: '/home/me' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  const first = async () => (await ui.find({ type: 'Button', key: 'ed-e-0' }))?.text
  expect((await ui.find({ type: 'Input', key: 'ed-cmd' }))?.props).toMatchObject({ label: '$', placeholder: 'cd 폴더 · ls · help' })
  await ui.input({ key: 'ed-cmd', text: 'cd src' })
  expect(await first()).toContain('b.ts')
  // Enter 뒤에도 키보드는 사이드바에 (채팅 입력창으로 안 감). $ 칸으로 링을 옮기는 건 실제 엔진에서만 됨
  // Enter 처리 뒤 엔진이 키를 채팅창으로 돌려준 다음에 다시 가져오므로 조금 뒤에 열림
  const n = opened.length
  await clock.advance(60)
  expect(opened.length).toBeGreaterThan(n)
  expect(JSON.stringify(opened.at(-1))).toContain('"focus":true')
  await ui.input({ key: 'ed-cmd', text: 'cd ..' })
  expect(await first()).toContain('src/')
  await ui.input({ key: 'ed-cmd', text: 'cd ~/notes' })
  expect(await first()).toContain('n.md')
  await ui.input({ key: 'ed-cmd', text: 'cd' })
  expect(await first()).toContain('src/')
  await ui.input({ key: 'ed-cmd', text: 'ls -la src' })
  expect(await first()).toContain('b.ts')
  await ui.input({ key: 'ed-cmd', text: 'cd..' })
  expect(await first()).toContain('src/')
  await ui.input({ key: 'ed-cmd', text: 'dir' })
  expect(await first()).toContain('src/')
  const before = runs.length
  await ui.input({ key: 'ed-cmd', text: 'cd a.txt' })
  expect(toasts.at(-1)).toContain('폴더가 아니에요')
  expect(runs.length).toBe(before)
  await ui.input({ key: 'ed-cmd', text: 'cd nope' })
  expect(toasts.at(-1)).toContain('그런 폴더가 없어요')
  await ui.input({ key: 'ed-cmd', text: 'rm a.txt' })
  expect(toasts.at(-1)).toContain('이 칸에선 이것만 돼요: cd 폴더')
  expect(await first()).toContain('src/')
  await ui.unmount()
})

test('파일 탭 $ 칸: ls *.txt 걸러 보기 · cd - · pwd · open 파일/폴더 · touch · mkdir · help', async ($, on) => {
  const { runs, toasts, writes, copies } = engine(on, { '/repo/a.txt': 'hello', '/repo/b.md': 'b', '/repo/c.TXT': 'c', '/repo/src/b.ts': 'x' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  const text = async (i: number) => (await ui.find({ type: 'Button', key: 'ed-e-' + i }))?.text
  // 걸러 보기: 대소문자 무시, 안내 줄, ls 로 풀림, 다른 폴더로 가도 풀림
  await ui.input({ key: 'ed-cmd', text: 'ls *.txt' })
  expect(await text(0)).toContain('a.txt')
  expect(await text(1)).toContain('c.TXT')
  expect(await text(2)).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /\*\.txt 만 보는 중 · 2개/ })).toBeTruthy()
  await ui.input({ key: 'ed-cmd', text: 'ls *.zip' })
  expect(await ui.find({ type: 'Text', text: /맞는 이름이 없어요/ })).toBeTruthy()
  await ui.input({ key: 'ed-cmd', text: 'ls' })
  expect(await text(0)).toContain('src/')
  // cd - : 바로 전 폴더로
  await ui.input({ key: 'ed-cmd', text: 'cd src' })
  await ui.input({ key: 'ed-cmd', text: 'cd -' })
  expect(await text(0)).toContain('src/')
  await ui.input({ key: 'ed-cmd', text: 'cd -' })
  expect(await text(0)).toContain('b.ts')
  // pwd: 경로 복사
  await ui.input({ key: 'ed-cmd', text: 'pwd' })
  expect(copies.at(-1)).toBe('/repo/src')
  expect(toasts.at(-1)).toBe('복사했어요: /repo/src')
  await ui.input({ key: 'ed-cmd', text: 'cd ..' })
  // open 파일: 고른 프로그램으로, open . : 파일 관리자로
  await ui.input({ key: 'ed-cmd', text: 'open a.txt' })
  expect(runs.at(-1)).toBe('code --reuse-window /repo/a.txt')
  await ui.input({ key: 'ed-cmd', text: 'open' })
  expect(runs.at(-1)).toBe('xdg-open /repo')
  await ui.input({ key: 'ed-cmd', text: 'open nope.txt' })
  expect(toasts.at(-1)).toContain('그런 파일이나 폴더가 없어요')
  // touch: 빈 파일을 만들고 목록에 보임, 있으면 손대지 않음
  await ui.input({ key: 'ed-cmd', text: 'touch memo.txt' })
  expect(writes.at(-1)).toBe('/repo/memo.txt')
  expect(toasts.at(-1)).toBe('파일을 만들었어요: memo.txt')
  expect(await ui.find({ type: 'Button', text: /memo\.txt/ })).toBeTruthy()
  const n = writes.length
  await ui.input({ key: 'ed-cmd', text: 'touch a.txt' })
  expect(writes.length).toBe(n)
  expect(toasts.at(-1)).toBe('이미 있어요: a.txt')
  await ui.input({ key: 'ed-cmd', text: 'touch' })
  expect(toasts.at(-1)).toContain('touch memo.txt')
  // mkdir
  await ui.input({ key: 'ed-cmd', text: 'mkdir docs' })
  expect(runs.at(-1)).toBe('mkdir -p -- /repo/docs')
  expect(toasts.at(-1)).toBe('폴더를 만들었어요: docs')
  await ui.input({ key: 'ed-cmd', text: 'mkdir src' })
  expect(toasts.at(-1)).toBe('이미 있어요: src')
  // help
  await ui.input({ key: 'ed-cmd', text: 'help' })
  expect(toasts.at(-1)).toContain('touch 파일')
  await ui.unmount()
})

test('파일 탭: $ 칸은 사이드바 맨 아래 고정 (dock 일 때 높이에 맞춰 그림), 다른 탭엔 없음', async ($, on) => {
  const files: Record<string, string> = {}
  for (let i = 0; i < 60; i++) files[`/repo/f${String(i).padStart(2, '0')}.txt`] = 'x'
  engine(on, files)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Input', key: 'ed-cmd' })).toBeFalsy()
    await ui.press({ key: 'tab-edit' })
    const root: any = await ui.drawn()
    expect(root.props.height).toBe(40)
    const kids = (root.props.children ?? root.children) as unknown[]
    expect(JSON.stringify(kids.at(-1))).toContain('ed-cmd')
    expect(JSON.stringify(kids.at(-1))).not.toContain('f00.txt')
    await ui.press({ key: 'tab-usage' })
    await ui.unmount()
  }
  // 안쪽(inline) 자리에선 고정하지 않고 목록 끝에 붙임
  const inline = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'inline' }, surface: 'terminal' })
  await inline.press({ key: 'tab-edit' })
  const r: any = await inline.drawn()
  expect(r.props.height).toBeUndefined()
  expect(await inline.find({ type: 'Input', key: 'ed-cmd' })).toBeTruthy()
  await inline.unmount()
})

test('파일 탭 $ 칸: Windows 역슬래시·따옴표 경로로 cd', async ($, on) => {
  engine(on, { '/repo/src/b.ts': 'x' }, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\someone' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  await ui.input({ key: 'ed-cmd', text: 'cd "\\repo\\src"' })
  expect((await ui.find({ type: 'Button', key: 'ed-e-0' }))?.text).toContain('b.ts')
  await ui.unmount()
})

test('파일 탭: 폴더가 먼저, 폴더를 누르면 들어가고 ▴ .. 로 위로', async ($, on) => {
  engine(on, { '/repo/a.txt': 'hello', '/repo/src/b.ts': 'x' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-edit' })
    expect((await ui.find({ type: 'Button', key: 'tab-edit' }))?.text).toContain('파일')
    expect((await ui.find({ type: 'Button', key: 'ed-e-0' }))?.text).toContain('src/')
    expect((await ui.find({ type: 'Button', key: 'ed-e-1' }))?.text).toContain('a.txt')
    // 입력칸은 $ 명령 칸 하나뿐 (편집기 없음)
    expect(await ui.find({ type: 'Input', key: 'ed-cmd' })).toBeTruthy()
    expect(await ui.find({ type: 'Input', key: 'ed-add' })).toBeFalsy()
    await ui.press({ key: 'ed-e-0' })
    expect((await ui.find({ type: 'Button', key: 'ed-e-0' }))?.text).toContain('b.ts')
    await ui.press({ key: 'ed-up' })
    expect((await ui.find({ type: 'Button', key: 'ed-e-0' }))?.text).toContain('src/')
    await ui.unmount()
  }
})

test('Windows: 기본은 VS Code, 열 프로그램을 메모장·매번 고르기·기본 연결 프로그램으로 바꿀 수 있고 기억함', async ($, on) => {
  const { runs, toasts } = engine(on, { '/repo/Main.java': 'class A {}' }, { OS: 'Windows_NT' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  expect((await ui.find({ type: 'Select', key: 'ed-opener' }))?.props).toMatchObject({ value: 'code' })

  await ui.press({ key: 'ed-e-0' })
  expect(runs.at(-1)).toContain("$p = '\\repo\\Main.java'")
  expect(runs.at(-1)).toContain('Start-Process code')
  expect(toasts.at(-1)).toBe('VS Code(으)로 열었어요: Main.java')

  await ui.select({ key: 'ed-opener', value: 'idea' })
  await ui.press({ key: 'ed-e-0' })
  expect(runs.at(-1)).toContain('Get-Command idea64, idea')
  expect(runs.at(-1)).toContain('Start-Process $exe -ArgumentList $q')
  expect(toasts.at(-1)).toBe('IntelliJ(으)로 열었어요: Main.java')

  await ui.select({ key: 'ed-opener', value: 'notepad' })
  expect((await ui.find({ type: 'Select', key: 'ed-opener' }))?.props).toMatchObject({ value: 'notepad' })
  await ui.press({ key: 'ed-e-0' })
  expect(runs.at(-1)).toContain('Start-Process notepad.exe')

  await ui.select({ key: 'ed-opener', value: 'ask' })
  await ui.press({ key: 'ed-e-0' })
  expect(runs.at(-1)).toContain('OpenAs_RunDLL')
  expect(toasts.at(-1)).toContain('고르세요')

  await ui.select({ key: 'ed-opener', value: 'default' })
  await ui.press({ key: 'ed-e-0' })
  expect(runs.at(-1)).toContain('Start-Process -FilePath $p')
  await ui.unmount()
})

test('VS Code 가 없으면 메모장으로 열고 알려 줌', async ($, on) => {
  const { toasts } = engine(on, { '/repo/a.txt': 'x' }, { OS: 'Windows_NT' }, 3)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  await ui.press({ key: 'ed-e-0' })
  expect(toasts.at(-1)).toContain('메모장으로 열었어요')
  await ui.unmount()
})

test('열 프로그램 추가: + 프로그램 추가… 로 경로를 넣으면 목록에 생기고 그걸로 열림, 빼기도 됨', async ($, on) => {
  const { runs, toasts } = engine(on, { '/repo/a.txt': 'x' }, { OS: 'Windows_NT' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  expect(await ui.find({ type: 'Input', key: 'ed-add' })).toBeFalsy()

  await ui.select({ key: 'ed-opener', value: '__add' })
  expect((await ui.find({ type: 'Input', key: 'ed-add' }))?.props.placeholder).toContain('sublime_text.exe')
  await ui.input({ key: 'ed-add', text: '"C:\\Program Files\\Sublime Text\\sublime_text.exe"' })
  // 있는지 먼저 확인하고 추가
  expect(runs.at(-1)).toContain("Test-Path -LiteralPath $c")
  expect(toasts.at(-1)).toBe('열 프로그램에 추가했어요: sublime_text')
  const sel = await ui.find({ type: 'Select', key: 'ed-opener' })
  expect(JSON.stringify(sel?.props.options)).toContain('sublime_text')
  expect(String(sel?.props.value)).toMatch(/^custom:/)
  expect(await ui.find({ type: 'Input', key: 'ed-add' })).toBeFalsy()

  await ui.press({ key: 'ed-e-0' })
  expect(runs.at(-1)).toContain("$c = 'C:\\Program Files\\Sublime Text\\sublime_text.exe'")
  expect(runs.at(-1)).toContain('Start-Process -FilePath $c -ArgumentList $q')
  expect(toasts.at(-1)).toBe('sublime_text(으)로 열었어요: a.txt')

  // 같은 걸 또 추가하면 하나만
  await ui.select({ key: 'ed-opener', value: '__add' })
  await ui.input({ key: 'ed-add', text: 'C:\\Program Files\\Sublime Text\\sublime_text.exe' })
  expect(toasts.at(-1)).toContain('이미 있어요')

  // 빼기 → VS Code 로 돌아감
  await ui.press({ key: 'ed-remove' })
  const after = await ui.find({ type: 'Select', key: 'ed-opener' })
  expect(after?.props.value).toBe('code')
  expect(JSON.stringify(after?.props.options)).not.toContain('sublime_text')
  await ui.unmount()
})

test('열 프로그램 추가: 없는 프로그램은 추가하지 않고 알려 줌 · 취소', async ($, on) => {
  const { toasts } = engine(on, { '/repo/a.txt': 'x' }, { OS: 'Windows_NT' }, 5)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  await ui.select({ key: 'ed-opener', value: '__add' })
  await ui.input({ key: 'ed-add', text: 'nothere.exe' })
  expect(toasts.at(-1)).toContain('프로그램을 찾지 못했어요')
  expect(JSON.stringify((await ui.find({ type: 'Select', key: 'ed-opener' }))?.props.options)).not.toContain('nothere')
  await ui.press({ key: 'ed-add-cancel' })
  expect(await ui.find({ type: 'Input', key: 'ed-add' })).toBeFalsy()
  await ui.unmount()
})

test('맥: 추가 입력칸 예시는 앱 이름, 앱 이름으로 추가하면 open -a 로 엶', async ($, on) => {
  const { runs } = engine(on, { '/repo/a.txt': 'x' }, {}, 0, 'Darwin')
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  await ui.select({ key: 'ed-opener', value: '__add' })
  expect((await ui.find({ type: 'Input', key: 'ed-add' }))?.props.placeholder).toContain('앱 이름')
  await ui.input({ key: 'ed-add', text: 'Zed' })
  await ui.press({ key: 'ed-e-0' })
  expect(runs.at(-1)).toBe('open -a Zed /repo/a.txt')
  await ui.unmount()
})

test('IntelliJ 가 없으면 메모장으로 열고 알려 줌', async ($, on) => {
  const { toasts } = engine(on, { '/repo/a.txt': 'x' }, { OS: 'Windows_NT' }, 4)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  await ui.select({ key: 'ed-opener', value: 'idea' })
  await ui.press({ key: 'ed-e-0' })
  expect(toasts.at(-1)).toBe('IntelliJ를 찾지 못해 메모장으로 열었어요: a.txt')
  await ui.unmount()
})

test('리눅스: code 로 열고, 긴 파일 이름은 한 줄로 자름', async ($, on) => {
  const { runs } = engine(on, { '/repo/AdminPersonGroupControllerWithAVeryVeryLongName.java': 'x' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-edit' })
  expect((await ui.find({ type: 'Button', key: 'ed-e-0' }))?.text).toContain('…')
  await ui.press({ key: 'ed-e-0' })
  expect(runs.at(-1)).toBe('code --reuse-window /repo/AdminPersonGroupControllerWithAVeryVeryLongName.java')
  await ui.unmount()
})

test('/side 2, /side 채팅방: 그 탭으로 바꾸고 포커스를 줘서 엶 · 없는 탭은 알려 줌', async ($, on) => {
  const { opened } = engine(on, { '/repo/a.txt': 'x' })
  on('ui.panes', () => ({ value: [] }) as any)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const r = await $.command.run({ command: 'side', args: '2', origin: { kind: 'composer' } } as any)
  expect(JSON.stringify(r)).toContain('2번 채팅방')
  expect(JSON.stringify(opened.at(-1))).toContain('"focus":true')
  expect(await ui.find({ type: 'Input', key: 'room-name' })).toBeTruthy()
  await $.command.run({ command: 'side', args: '파일', origin: { kind: 'composer' } } as any)
  expect(await ui.find({ type: 'Select', key: 'ed-opener' })).toBeTruthy()
  const bad = await $.command.run({ command: 'side', args: '9', origin: { kind: 'composer' } } as any)
  expect(JSON.stringify(bad)).toContain('탭이 없어요')
  await ui.unmount()
})

test('탭 줄 아래 키 안내 없음(포커스 안팎·터미널·데스크톱) · 파일 탭 u 로 위로', async ($, on) => {
  engine(on, { '/repo/src/b.ts': 'x' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const hint = /\/side 번호|1~\d 탭|Ctrl\+X Tab/
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const isFocused of [true, false]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused }, surface })
      expect(await ui.find({ type: 'Text', text: hint })).toBeFalsy()
      await ui.unmount()
    }
  }
  const inside = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await inside.press({ key: 'tab-edit' })
  await inside.press({ key: 'ed-e-0' })
  expect((await inside.find({ type: 'Button', key: 'ed-up' }))?.props).toMatchObject({ hotkey: 'u' })
  await inside.unmount()
})
