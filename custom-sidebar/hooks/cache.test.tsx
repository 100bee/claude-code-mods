import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'custom-sidebar',
  component: 'Pane',
  requestId: 'custom-sidebar',
  props: { title: '사이드바', isFocused: true, bodyColumns: 44, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const USAGE = {
  startedAt: 0,
  context: { tokens: 1000, window: 200000, percent: 1 },
  rateLimits: [],
}

function engine(on: any) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, {})
  mock.env(on, {})
  on('command.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.id', () => ({ value: 'sess-A' }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.SessionStart', () => ({}))
  return clock
}

const usage = (read: number) => ({ input_tokens: 10, output_tokens: 100, cache_read_input_tokens: read, cache_creation_input_tokens: 200, model: 'm' })

test('기본 60분: 답이 끝나면 캐시 타이머가 차고, 60분 지나면 만료, 다시 대화하면 다시 참', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: '안녕', turnId: 't1' })
  await $.turn.complete({ answer: 'hi', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(0) } as any)
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^캐시 60분$/ })).toBeTruthy()
  await ui.unmount()

  await clock.advance(61 * 60_000)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^캐시 만료$/ })).toBeTruthy()
  await ui.unmount()

  // 다시 대화하면 타이머가 다시 참
  await $.turn.start({ text: '다시', turnId: 't2' })
  await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer', usage: usage(50000) } as any)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^캐시 만료$/ })).toBeFalsy()
  await ui.unmount()
})

test('5분 넘게 쉬었다 보낸 요청이 캐시에 안 맞으면 5분으로 배운다', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: 'a', turnId: 't1' })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(0) } as any)
  await clock.advance(10 * 60_000)
  await $.turn.start({ text: 'b', turnId: 't2' })
  // 캐시에서 못 읽고 새로 씀
  await $.turn.complete({ answer: 'y', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer', usage: { ...usage(0), cache_creation_input_tokens: 90000 } } as any)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^캐시 5분$/ })).toBeTruthy()
  await ui.unmount()
})

test('사용량 탭 캐시 막대: 남은 비율 %가 보이고, 만료되면 0%', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: 'a', turnId: 't1' })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(0) } as any)
  await clock.advance(30 * 60_000)
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /█+░+ 50%/ })).toBeTruthy()
  await ui.unmount()
  await clock.advance(31 * 60_000)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^░+ 0%$/ })).toBeTruthy()
  await ui.unmount()
})

test('사이드바를 띄워 둔 채로 시간이 지나면 새로고침 없이 캐시가 줄어든다', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: 'a', turnId: 't1' })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(0) } as any)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^캐시 60분$/ })).toBeTruthy()
  await clock.advance(10 * 60_000)
  expect(await ui.find({ type: 'Text', text: /^캐시 50분$/ })).toBeTruthy()
  await ui.unmount()
})
