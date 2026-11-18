import { expect, mock, test } from 'claude-code/testing'
import { dress } from './register'

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

test('큰 오리(l)는 16픽셀 + 바닥 2줄', async ($, on) => {
  engine(on, { size: 'l' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: '안녕', turnId: 't1' } as any)
  const ui = await $.ui.mount({ ...ABOVE, surface: 'terminal' })
  expect((await ui.find({ type: 'Raster' }))?.props.rows).toBe(9)
  await ui.unmount()
})

test('예전 작은 오리(s) 설정은 중간(m)으로', async ($, on) => {
  engine(on, { size: 's' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  await $.turn.start({ text: '안녕', turnId: 't1' } as any)
  const ui = await $.ui.mount({ ...ABOVE, surface: 'terminal' })
  expect((await ui.find({ type: 'Raster' }))?.props.rows).toBe(7)
  await ui.unmount()
})

// chat-theme 상태는 테스트에서 못 넣어서, 옷 입힌 프레임을 직접 확인
test('겨울 옷: 맨 윗줄 방울까지 들어가게 2줄 커지고, 걸음 2에서도 방울이 안 잘린다', () => {
  for (const size of ['m', 'l'] as const) {
    const plain = dress(size, 'default')
    const winter = dress(size, 'winter')
    expect(winter.height).toBe(plain.height + 2)
    expect(winter.mom.frames[0]!.some(r => r.includes('S'))).toBe(true)
    expect(winter.mom.frames[1]!.slice(0, 2).join('')).toContain('S')
  }
})

test('여름 튜브는 몸 밖으로 나온 만큼 넓어지고, 새끼 세 마리 폭이 같다', () => {
  const plain = dress('l', 'default')
  const summer = dress('l', 'summer')
  expect(summer.mom.width).toBeGreaterThan(plain.mom.width)
  expect(new Set(summer.babies.map(b => b.width)).size).toBe(1)
  expect(summer.mom.frames[0]!.join('')).toContain('T')
})

test('default는 맨몸 그대로', () => {
  const plain = dress('m', 'default')
  expect(plain.mom.frames[0]!.join('')).not.toMatch(/[PQDTHGRNSI]/)
})
