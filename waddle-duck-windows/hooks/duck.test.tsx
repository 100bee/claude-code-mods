import { expect, mock, test } from 'claude-code/testing'

const ABOVE = {
  plugin: 'waddle-duck-windows',
  component: 'AbovePrompt',
  props: { isWorking: true, hasSurvey: false, bodyColumns: 80 },
} as any

function engine(on: any, store: Record<string, unknown> = {}) {
  mock.store(on, store)
  mock.clock(on, { now: 1_000_000 })
  on('command.register', () => ({ value: {} }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['다른 mod'] }))
}

test('터미널에서는 작업 중에 오리가 걷는다', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: '안녕', turnId: 't1' } as any)
  const ui = await $.ui.mount({ ...ABOVE, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /꽥꽥/ })).toBeTruthy()
  await ui.unmount()
})

test('데스크톱 앱에서는 오리가 나오지 않는다', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true } as any)
  await $.turn.start({ text: '안녕', turnId: 't1' } as any)
  const ui = await $.ui.mount({ ...ABOVE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /꽥꽥|🦆/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: '다른 mod' })).toBeTruthy()
  await ui.unmount()
})

test('/duck off 이면 터미널에서도 나오지 않는다', async ($, on) => {
  engine(on, { enabled: false })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: '안녕', turnId: 't1' } as any)
  const ui = await $.ui.mount({ ...ABOVE, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeFalsy()
  await ui.unmount()
})

test('큰 오리(l)는 16픽셀 높이', async ($, on) => {
  engine(on, { size: 'l' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: '안녕', turnId: 't1' } as any)
  const ui = await $.ui.mount({ ...ABOVE, surface: 'terminal' })
  expect((await ui.find({ type: 'Raster' }))?.props.rows).toBe(8)
  await ui.unmount()
})

test('예전 작은 오리(s) 설정은 중간(m)으로', async ($, on) => {
  engine(on, { size: 's' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: '안녕', turnId: 't1' } as any)
  const ui = await $.ui.mount({ ...ABOVE, surface: 'terminal' })
  expect((await ui.find({ type: 'Raster' }))?.props.rows).toBe(6)
  await ui.unmount()
})
