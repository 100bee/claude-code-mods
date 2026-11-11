import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, GitFile, GitInfo, Here, Note, Now, Room, Span, Tab, UsageSnap, Worker } from '../types'

// ════════════════════════════════════════════════════════════
//  설정: 여기만 고치면 경고 기준과 색이 바뀝니다
// ════════════════════════════════════════════════════════════

// 컨텍스트 색 기준 (%): 이 미만 초록, 이상 주황, DANGER 이상 빨강
const WARN_AT = 50
const DANGER_AT = 70
// 상태 색 (컨텍스트·한도 게이지, Git 상태 글자). 데이터의 상태를 알리는 데만 씀
const GREEN = '#7fb069'
const ORANGE = '#ff8c1a'
const RED = '#e5534b'
const YELLOW = '#e0b84a'
// 강조색: 현재 탭, 폴더 아이콘, 구성 막대·그래프, Claude가 고친 파일 표시.
// chat-theme mod가 켜져 있으면 /theme-chat 으로 고른 팔레트를 따라가고, 없으면 이 값(Claude 주황)을 씀
const FALLBACK_ACCENT = { main: '#d97757', soft: '#7b4a3a' }
// 요금제 한도 게이지 색 기준 (%): 한도는 50%가 위험하진 않아서 따로 둠
const LIMIT_WARN_AT = 80
const LIMIT_DANGER_AT = 90
// 프롬프트 캐시 유지 시간 기본값(분): 60 또는 5. 실제와 다르면 쓰다 보면 저절로 맞춰짐
const CACHE_TTL_MIN = 60
// 사이드바 폭이 이 칸 수 이상이면 두 칸 배치 (사용량 탭 좌우, 변경 탭 파일 목록 | diff)
const WIDE_AT = 90
const COL_GAP = 3

// ════════════════════════════════════════════════════════════

const PLUGIN = 'custom-sidebar'
const PANE = 'custom-sidebar'
const MAX_DIFF_LINES = 150
// 활동 탭에 남길 도구 호출·백그라운드 작업 수
const ACTIVITY_MAX = 300
const WORKER_MAX = 20
const TURN_MAX = 30

const tab = atom({ plugin: 'custom-sidebar', key: 'tab' } as const, 'usage' as Tab)
const isOpen = atom({ plugin: 'custom-sidebar', key: 'isOpen' } as const, false)
const usage = atom({ plugin: 'custom-sidebar', key: 'usage' } as const, null as UsageSnap | null, { shape: 'usage-1' })
const history = atom({ plugin: 'custom-sidebar', key: 'history' } as const, [] as number[], { shape: 'history-1' })
const git = atom({ plugin: 'custom-sidebar', key: 'git' } as const, null as GitInfo | null, { shape: 'git-1' })
const touched = atom({ plugin: 'custom-sidebar', key: 'touched' } as const, [] as string[], { shape: 'touched-1' })
const selected = atom({ plugin: 'custom-sidebar', key: 'selected' } as const, null as string | null)
const diff = atom({ plugin: 'custom-sidebar', key: 'diff' } as const, '')
const notes = atom({ plugin: 'custom-sidebar', key: 'notes' } as const, [] as Note[], { shape: 'notes-1' })
const rooms = atom({ plugin: 'custom-sidebar', key: 'rooms' } as const, [] as Room[], { shape: 'rooms-1' })
const openFolders = atom({ plugin: 'custom-sidebar', key: 'openFolders' } as const, [] as string[], { shape: 'open-1' })
const here = atom({ plugin: 'custom-sidebar', key: 'here' } as const, null as Here | null, { shape: 'here-1' })
const activity = atom({ plugin: 'custom-sidebar', key: 'activity' } as const, [] as Activity[], { shape: 'activity-1' })
const workers = atom({ plugin: 'custom-sidebar', key: 'workers' } as const, [] as Worker[], { shape: 'workers-1' })
const turns = atom({ plugin: 'custom-sidebar', key: 'turns' } as const, [] as Span[], { shape: 'turns-1' })
const EMPTY_NOW: Now = {
  ask: null,
  doing: null,
  doingSince: null,
  waiting: null,
  todo: null,
  isBusy: false,
  lastReplyAt: null,
}
const now$ = atom({ plugin: 'custom-sidebar', key: 'now' } as const, EMPTY_NOW, { shape: 'now-1' })
// 프롬프트 캐시 유지 시간(분). 엔진이 알려주지 않아서 설정의 CACHE_TTL_MIN으로 시작하고,
// 5분 넘게 쉬었다 보낸 요청이 캐시에 맞았는지 보고 60분/5분을 배움 ($.store에 저장)
const cacheTtl = atom({ plugin: 'custom-sidebar', key: 'cacheTtl' } as const, CACHE_TTL_MIN)
// 1분마다 바뀌는 값: 사이드바가 이걸 읽어서, 바뀔 때마다 엔진이 다시 그림 (남은 시간·경과 시간)
// 요청별 기록에서 펼친 요청(시작 시각), 30개 다 보기
const openTurns = atom({ plugin: 'custom-sidebar', key: 'openTurns' } as const, [] as number[])
const showAllTurns = atom({ plugin: 'custom-sidebar', key: 'showAllTurns' } as const, false)
const tick = atom({ plugin: 'custom-sidebar', key: 'tick' } as const, 0)

// /context의 항목 이름을 한글로
const CATEGORY_KO: Record<string, string> = {
  'System prompt': '시스템 프롬프트',
  'System tools': '시스템 툴',
  'MCP tools': 'MCP 툴',
  'Custom agents': '에이전트',
  'Memory files': '메모리 파일',
  Skills: '스킬',
  Messages: '대화 메시지',
}
const LIMIT_KO: Record<string, string> = { five_hour: '5시간', seven_day: '7일', spend_limit: '지출 한도' }

// ── 작은 도우미들 ──────────────────────────────────────────

const k = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n))
const bar = (ratio: number, width: number) => {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
const levelColor = (percent: number) =>
  percent >= DANGER_AT ? RED : percent >= WARN_AT ? ORANGE : GREEN
const limitColor = (percent: number) =>
  percent >= LIMIT_DANGER_AT ? RED : percent >= LIMIT_WARN_AT ? ORANGE : GREEN
const SPARK = '▁▂▃▄▅▆▇█'
const spark = (values: number[]) => {
  const max = Math.max(1, ...values)
  return values.map(v => SPARK[Math.min(7, Math.floor((v / max) * 7.999))] ?? '▁').join('')
}
const untilText = (iso: string | null, now: number) => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms) || ms <= 0) return '곧 리셋'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}분 후 리셋`
  const hours = Math.floor(min / 60)
  if (hours < 48) return `${hours}시간 ${min % 60}분 후 리셋`
  return `${Math.floor(hours / 24)}일 후 리셋`
}
const normPath = (p: string) => p.replace(/\\/g, '/')

// ── 활동·지금 상황 도우미 ──────────────────────────────────

const cut = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}
const baseName = (p: string) => normPath(p).split('/').pop() || p

// 도구 호출 한 건을 한 줄로: 무엇을, 누르면 무엇을 복사할지
function describeTool(e: Record<string, unknown>): { label: string; copy?: string } {
  const str = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '')
  switch (e.tool) {
    case 'Bash':
    case 'PowerShell':
      return { label: cut(str('description') || str('command'), 60), copy: str('command') || undefined }
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      return { label: baseName(str('file_path')), copy: str('file_path') || undefined }
    case 'NotebookEdit':
      return { label: baseName(str('notebook_path')), copy: str('notebook_path') || undefined }
    case 'Grep':
    case 'Glob':
      return { label: cut(str('pattern'), 50) }
    case 'Agent':
    case 'Task':
      return { label: cut(str('description') || str('prompt'), 50) }
    case 'WebFetch':
      return { label: cut(str('url').replace(/^https?:\/\//, ''), 50), copy: str('url') || undefined }
    case 'WebSearch':
      return { label: cut(str('query'), 50) }
    case 'Skill':
      return { label: str('skill') }
    default:
      return { label: '' }
  }
}

// 12초, 3분, 1시간 5분
const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분`
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}

// 캐시: 마지막 응답 후 남은 시간. null이면 표시 안 함(작업 중이거나 아직 응답 없음)
const cacheLeft = (n: Now, ttlMin: number, at: number) => {
  if (n.isBusy || n.lastReplyAt === null) return null
  return ttlMin * 60_000 - (at - n.lastReplyAt)
}
const cacheText = (leftMs: number) =>
  leftMs > 0 ? `캐시 ${leftMs >= 60_000 ? Math.ceil(leftMs / 60_000) + '분' : '1분 미만'}` : '캐시 만료'
// 지금도 흘러가는 시간(작업 경과 등): 화면이 1분마다 바뀌어서 분 단위로만
const agoLive = (ms: number) => (ms < 60_000 ? '1분 미만' : ago(ms))

// 터미널에서 차지하는 칸 수 (한글·한자·전각·이모지는 2칸)
const cellWidth = (str: string) => {
  let w = 0
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0
    w +=
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff)
        ? 2
        : 1
  }
  return w
}

// 타임라인: 시간 구간들을 칸(cell)으로. 0 빈칸, 1 끝남, 2 실행 중, 3 실패
type LaneSpan = { start: number; end?: number; state: 1 | 2 | 3 }
function laneCells(spans: LaneSpan[], from: number, to: number, n: number): number[] {
  const cells = new Array<number>(n).fill(0)
  const step = (to - from) / n
  for (const sp of spans) {
    const end = sp.end ?? to
    if (end < from || sp.start > to) continue
    const a = Math.max(0, Math.floor((sp.start - from) / step))
    const b = Math.min(n - 1, Math.max(a, Math.ceil((end - from) / step) - 1))
    for (let i = a; i <= b; i++) cells[i] = Math.max(cells[i]!, sp.state)
  }
  return cells
}
// 같은 칸이 이어진 구간으로 묶음 (색 바꿀 때만 Text를 새로 씀)
function runsOf(cells: number[]): { state: number; len: number }[] {
  const out: { state: number; len: number }[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last.state === c) last.len++
    else out.push({ state: c, len: 1 })
  }
  return out
}

// chat-theme이 공개한 팔레트 색 읽기. 그리는 중에 읽으면 테마를 바꿀 때 사이드바도 다시 그려짐
type Accent = { main: string; soft: string }
async function readAccent($: EngineInterface): Promise<Accent> {
  try {
    // chat-theme이 없어도 사이드바는 떠야 해서 의존성으로 묶지 않고 직접 읽음
    const { value } = (await $.state.get({ plugin: 'chat-theme', key: 'colors' } as any)) as {
      value?: { claude?: { title?: unknown; border?: unknown } }
    }
    const c = value?.claude
    if (typeof c?.title === 'string' && typeof c?.border === 'string') return { main: c.title, soft: c.border }
  } catch {}
  return FALLBACK_ACCENT
}

// ── 데이터 가져오기 ────────────────────────────────────────

async function refreshUsage($: EngineInterface) {
  const u = await $.session.usage({ breakdown: 'summary' })
  const snap: UsageSnap = {
    percent: u.context.percent ?? 0,
    tokens: u.context.tokens ?? 0,
    window: u.context.window,
    categories: (u.context.breakdown?.categories ?? [])
      .filter(c => c.kind === 'used' && c.tokens > 0)
      .map(c => ({ name: c.name, tokens: c.tokens })),
    costUsd: u.cost?.usd ?? null,
    limits: u.rateLimits.map(r => ({
      kind: r.kind,
      percentUsed: r.percentUsed,
      resetsAt: r.resetsAt ?? null,
    })),
  }
  await update($, usage, () => snap)
  return snap
}

async function refreshGit($: EngineInterface) {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel']).catch(() => null)
  if (!top || top.exitCode !== 0) {
    await update($, git, () => ({ isRepo: false }) as GitInfo)
    return
  }
  const root = top.stdout.trim()
  const st = await $.process.run(['git', 'status', '--porcelain=v1', '-b'], { cwd: root })
  const lines = st.stdout.split(/\r?\n/).filter(Boolean)
  const head = lines[0]?.startsWith('## ') ? lines.shift()!.slice(3) : ''
  const branch = head.split('...')[0]?.replace(/^No commits yet on /, '') || '(알 수 없음)'
  const ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0)
  const behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0)
  const files: GitFile[] = lines.map(l => ({
    code: l.slice(0, 2),
    path: l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop()!,
  }))
  await update($, git, () => ({ isRepo: true, root, branch, ahead, behind, files }) as GitInfo)
}

async function loadDiff($: EngineInterface, path: string) {
  const info = await read($, git)
  if (!info || !info.isRepo) return
  const file = info.files.find(f => f.path === path)
  if (file?.code === '??') {
    await update($, diff, () => '(새 파일: 아직 git이 추적하지 않음)')
    return
  }
  const run = (args: string[]) =>
    $.process.run(['git', 'diff', '--no-color', ...args, '--', path], { cwd: info.root })
  let out = (await run([])).stdout
  if (!out.trim()) out = (await run(['--cached'])).stdout
  const all = out.split(/\r?\n/)
  const text =
    all.length > MAX_DIFF_LINES
      ? all.slice(0, MAX_DIFF_LINES).join('\n') + `\n… ${all.length - MAX_DIFF_LINES}줄 더 있음`
      : out
  await update($, diff, () => text || '(변경 내용 없음)')
}

async function saveNotes($: EngineInterface, fn: (list: Note[]) => Note[]) {
  await update($, notes, list => {
    const next = fn(list)
    void $.store.set('notes', next)
    return next
  })
}

async function loadNotes($: EngineInterface) {
  const saved = await $.store.get('notes')
  if (Array.isArray(saved)) {
    const list = saved.filter(
      (n): n is Note => typeof n?.text === 'string' && typeof n?.isDone === 'boolean',
    )
    await update($, notes, () => list)
  }
}

// ── 채팅방 (이름 붙인 세션 사이 이동) ─────────────────────

const samePath = (a: string, b: string) =>
  normPath(a).replace(/\/+$/, '').toLowerCase() === normPath(b).replace(/\/+$/, '').toLowerCase()

async function refreshHere($: EngineInterface) {
  const id = await $.session.id()
  const cwd = await $.session.cwd()
  await update($, here, () => ({ id, cwd }))
}

async function loadRooms($: EngineInterface) {
  const saved = await $.store.get('rooms')
  if (Array.isArray(saved)) {
    const list = saved.filter(
      (r): r is Room =>
        typeof r?.name === 'string' && typeof r?.id === 'string' && typeof r?.cwd === 'string',
    )
    await update($, rooms, () => list)
  }
}

async function saveRooms($: EngineInterface, fn: (list: Room[]) => Room[]) {
  // 다른 창(세션)에서 저장한 것도 살리려고 저장소에서 다시 읽고 고침
  await loadRooms($)
  await update($, rooms, list => {
    const next = fn(list)
    void $.store.set('rooms', next)
    return next
  })
}

async function nameThisRoom($: EngineInterface, name: string) {
  const cur = await read($, here)
  if (!cur) return
  const savedAt = await $.clock.now()
  await saveRooms($, list => [
    ...list.filter(r => r.id !== cur.id && r.name !== name),
    { name, id: cur.id, cwd: cur.cwd, savedAt },
  ])
  // 입력창 옆 채팅 이름과 /resume 목록도 같은 이름으로 바꾸기
  setTitle($, name)
  $.ui.toast(`이 채팅을 '${name}'(으)로 저장했어요`)
}

// /rename이 안 먹었을 때 다음 프롬프트에서 제목을 대신 넣을 이름
let pendingTitle: string | null = null

function setTitle($: EngineInterface, name: string) {
  pendingTitle = name
  // 명령 처리 도중에는 다른 명령을 실행할 수 없어서, 처리가 끝난 뒤에 실행
  $.clock.after(0, () => {
    void (async () => {
      try {
        const names = (await $.command.list()).map(c => c.name)
        if (!names.includes('rename')) return
        await $.command.run({ command: 'rename', args: name })
        if (pendingTitle === name) pendingTitle = null
      } catch {
        // 실패하면 pendingTitle이 남아 다음 프롬프트 때 제목이 바뀜
      }
    })()
  })
}

async function roomNameOf($: EngineInterface, sessionId: string) {
  const saved = await $.store.get('rooms')
  if (!Array.isArray(saved)) return null
  const room = saved.find((r: unknown) => (r as Room | null)?.id === sessionId) as Room | undefined
  return typeof room?.name === 'string' ? room.name : null
}

async function goToRoom($: EngineInterface, room: Room) {
  const cur = await read($, here)
  if (cur && cur.id === room.id) {
    $.ui.toast('지금 이 채팅이에요')
    return
  }
  if (cur && !samePath(cur.cwd, room.cwd)) {
    await openElsewhere($, room)
    return
  }
  try {
    $.ui.toast(`'${room.name}'(으)로 이동합니다…`)
    await $.command.run({ command: 'resume', args: room.id })
    // 이동했으니 '지금' 표시를 바로 옮김
    await update($, here, () => ({ id: room.id, cwd: room.cwd }))
  } catch {
    $.ui.toast('지금은 이동할 수 없어요. 작업이 끝난 뒤 다시 눌러주세요')
  }
}

// /resume·/clear 뒤에는 사이드바 상태가 초기화됨. classic 훅이 막힌 환경(조직 보안 가드)에서도
// 다시 불러오도록, 화면을 그릴 때 상태가 비어 있으면 한 번 다시 불러옴
let booted = false
let reloading = false
function ensureLoaded($: EngineInterface, cur: Here | null) {
  if (!booted || cur || reloading) return
  reloading = true
  $.clock.after(0, () => {
    void startup($)
      .catch(() => {})
      .finally(() => {
        reloading = false
      })
  })
}

// at: 이동 신호에 실려 온 새 채팅 정보. 있으면 그걸 믿고, 없으면 직접 읽음
// ── 다른 폴더 채팅방: 그 폴더에서 새 터미널 창으로 열기 ──────────
// 실행 중인 Claude Code는 작업 폴더를 바꿀 수 없어서, 새 창에서 그 폴더로 이어서 엶

const folderKey = (cwd: string) => normPath(cwd).replace(/\/+$/, '').toLowerCase()
const folderName = (cwd: string) => normPath(cwd).replace(/\/+$/, '').split('/').pop() || cwd

function resumeCommand(room: Room, isWin: boolean) {
  return isWin
    ? `cd "${room.cwd}"; claude --resume ${room.id}`
    : `cd '${room.cwd.replace(/'/g, `'\\''`)}' && claude --resume ${room.id}`
}

// PowerShell 스크립트를 따옴표 문제 없이 넘기려고 UTF-16LE base64로 인코딩
function encodePowerShell(script: string) {
  const bytes: number[] = []
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i)
    bytes.push(c & 0xff, c >> 8)
  }
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += abc[(n >> 18) & 63]! + abc[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? abc[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? abc[n & 63]! : '='
  }
  return out
}

async function openElsewhere($: EngineInterface, room: Room) {
  const isWin = (await $.env.get('OS')) === 'Windows_NT'
  if (isWin && /^[0-9a-zA-Z-]+$/.test(room.id)) {
    const dir = room.cwd.replace(/'/g, "''")
    const script = [
      `$d = '${dir}'`,
      `$id = '${room.id}'`,
      `if (Get-Command wt.exe -ErrorAction SilentlyContinue) {`,
      '  Start-Process wt.exe -ArgumentList @("-d", "`"$d`"", "claude", "--resume", $id)',
      `} else {`,
      '  Start-Process powershell.exe -WorkingDirectory $d -ArgumentList @("-NoExit", "-Command", "claude --resume $id")',
      `}`,
    ].join('\n')
    try {
      const r = await $.process.run(
        ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)],
        { timeoutMs: 15_000 },
      )
      if (r.exitCode === 0) {
        $.ui.toast(`새 창에서 '${room.name}'(${folderName(room.cwd)})을 열었어요`)
        return
      }
    } catch {}
  }
  // 창을 못 열면 명령을 복사해서 붙여넣게 함
  const command = resumeCommand(room, isWin)
  try {
    await $.ui.copy({ text: command })
    $.ui.toast(`새 터미널에 붙여넣으세요 (복사됨): ${command}`)
  } catch {
    $.ui.toast(`새 터미널에서 실행하세요: ${command}`)
  }
}

async function startup($: EngineInterface, at?: Here) {
  await loadNotes($)
  await loadRooms($)
  if (at) await update($, here, () => at)
  else await refreshHere($).catch(() => {})
  booted = true
  void refreshUsage($).catch(() => {})
  void refreshGit($).catch(() => {})
}

async function openPane($: EngineInterface, byPerson: boolean) {
  const args = { id: PANE, title: '사이드바' }
  const r = await $.ui.open(byPerson ? { ...args, focus: true } : args)
  await update($, isOpen, () => r.isPlaced)
  return r
}

async function closePane($: EngineInterface) {
  await $.ui.close({ id: PANE })
  await update($, isOpen, () => false)
}

// ── 훅 등록 ────────────────────────────────────────────────

export const register: Register = on => {
  let warnedAt = 0
  // 이번 턴 전에 얼마나 쉬었는지 (캐시 유지 시간 배우기용)
  let idleBeforeTurn = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'side',
      description: '사이드바 열기/닫기',
      immediate: true,
    })
    await $.command.register({
      name: 'room',
      description: '채팅방: /room 목록, /room 이름 이동, /room + 이름 현재 채팅 저장',
      argumentHint: '[이름 | + 이름]',
    })
    await startup($)
    const savedTtl = await $.store.get('cacheTtl')
    // 배운 값이 없으면 기본값으로 (reload 전 세션에 남은 예전 기본값 5분도 덮어씀)
    await update($, cacheTtl, () => (savedTtl === 5 || savedTtl === 60 ? savedTtl : CACHE_TTL_MIN))
    // 캐시 남은 시간·작업 경과 시간·리셋 시각 같은 표시를 1분마다 갱신 (분 단위로만 보여서)
    // (그리는 쪽이 tick을 읽으므로 값이 바뀌면 반드시 다시 그려짐. invalidate는 보조)
    $.clock.every(60_000, () => {
      void update($, tick, n => (n + 1) % 1_000_000).catch(() => {})
      $.ui.invalidate('ui.render')
    })
    // 넓은 터미널이면 자동으로 오른쪽에 붙음
    void openPane($, false)
    return next(e)
  })

  // /clear, /resume, /branch 뒤에도 메모·데이터 다시 불러오기
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    // 이 시점에 직접 물어보면 이전 채팅 ID가 나올 수 있어서, 신호에 실린 ID를 씀
    await startup($, { id: e.session_id, cwd: e.cwd })
    // 새 대화(/clear)나 다른 대화(/resume)로 바뀌면 활동 탭·지금 상황을 비움 (/branch는 이어지는 대화라 둠)
    if (e.source === 'clear' || e.source === 'resume') {
      await update($, activity, () => [])
      await update($, workers, () => [])
      await update($, turns, () => [])
      await update($, openTurns, () => [])
      await update($, now$, () => EMPTY_NOW)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // 채팅방으로 이동(resume)하면 그 채팅방 이름을 제목으로
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const name = await roomNameOf($, e.session_id)
    if (name && e.session_title !== name) return { ...result, sessionTitle: name }
    return result
  }).catch(($, e, next) => next(e))

  // /rename이 실패했으면 다음 프롬프트를 보낼 때 제목을 바꿈
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    const name = pendingTitle
    if (!name || e.agent_id) return result
    pendingTitle = null
    return e.session_title === name ? result : { ...result, sessionTitle: name }
  }).catch(($, e, next) => next(e))

  // 메시지를 보낼 때마다: 사람이 보낸 요청은 '요청'으로, 백그라운드 작업 끝남 알림은 활동 탭에,
  // 그리고 '지금 채팅'·폴더 표시를 바로잡음 (classic 훅이 막혀도 동작)
  on('prompt.submit', async ($, e, next) => {
    try {
      if ((e.origin.kind === 'composer' || e.origin.kind === 'bridge') && !e.command && e.text.trim()) {
        const ask = cut(e.text, 80)
        await update($, now$, n => ({ ...n, ask }))
      } else if (e.origin.kind === 'task-notification') {
        const t = await $.clock.now()
        const word = /<status>\s*(\w+)\s*<\/status>/.exec(e.text)?.[1] ?? 'completed'
        const failed = word === 'failed' || word === 'killed'
        await update($, workers, ws =>
          ws.map(w =>
            w.status === 'running' && e.text.includes(w.id)
              ? { ...w, status: failed ? ('failed' as const) : ('done' as const), endedAt: t }
              : w,
          ),
        )
      }
    } catch {}
    const result = await next(e)
    try {
      const id = await $.session.id()
      const cwd = await $.session.cwd()
      const cur = await read($, here)
      if (!cur || cur.id !== id || cur.cwd !== cwd) await update($, here, () => ({ id, cwd }))
    } catch {}
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'side' }, async $ => {
    const panes = await $.ui.panes()
    const shown = panes.some(p => p.id === PANE && p.isShown)
    if (shown) {
      await closePane($)
      return { text: '사이드바를 닫았어요.' }
    }
    await openPane($, true)
    return { text: '사이드바를 열었어요. (Esc: 프롬프트로, Ctrl+X X: 닫기)' }
  })

  on('command.run', { command: 'room' }, async ($, e) => {
    await loadRooms($)
    await refreshHere($)
    const arg = (e.args ?? '').trim()
    const cur = await read($, here)
    const local = (await read($, rooms)).filter(r => !cur || samePath(r.cwd, cur.cwd))

    if (arg.startsWith('+')) {
      const name = arg.slice(1).trim()
      if (!name) return { text: '저장할 이름을 적어주세요. 예: /room + 로그인 버그' }
      await nameThisRoom($, name)
      return { text: `이 채팅을 '${name}'(으)로 저장했어요.` }
    }
    if (!arg) {
      if ((await read($, rooms)).length === 0) return { text: '저장한 채팅방이 없어요. /room + 이름 으로 저장하세요.' }
      const lines = local.map(r => (cur?.id === r.id ? `● ${r.name} (지금)` : `→ ${r.name}`))
      const others = (await read($, rooms)).filter(r => !local.includes(r))
      const otherLines = others.map(r => `↗ ${r.name}  (${folderName(r.cwd)})`)
      return {
        text:
          '채팅방\n' +
          (lines.length ? lines.join('\n') : '(이 폴더엔 없음)') +
          (otherLines.length ? '\n\n다른 폴더 (새 창에서 열림)\n' + otherLines.join('\n') : '') +
          '\n\n/room 이름 으로 이동',
      }
    }
    const all = await read($, rooms)
    const others = all.filter(r => !local.includes(r))
    const lower = arg.toLowerCase()
    const room =
      local.find(r => r.name === arg) ??
      others.find(r => r.name === arg) ??
      local.find(r => r.name.toLowerCase().startsWith(lower)) ??
      others.find(r => r.name.toLowerCase().startsWith(lower))
    if (!room) return { text: `'${arg}' 채팅방이 없어요. /room 으로 목록을 보세요.` }
    if (cur?.id === room.id) return { text: `지금 '${room.name}' 채팅이에요.` }
    void goToRoom($, room)
    return cur && !samePath(cur.cwd, room.cwd)
      ? { text: `'${room.name}'은(는) ${folderName(room.cwd)} 폴더 채팅이라 새 창에서 엽니다…` }
      : { text: `'${room.name}'(으)로 이동합니다…` }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, isOpen, () => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  // 도구 호출마다: 활동 기록, '지금' 표시, 할 일, 백그라운드 셸, Claude가 수정한 파일
  on('tool.call', async ($, e, next) => {
    const args = e as unknown as Record<string, unknown>
    const id = e.tool_use_id
    const tool = String(e.tool)
    const startedAt = await $.clock.now()
    const { label, copy } = describeTool(args)
    try {
      await update($, activity, list =>
        [...list, { id, at: startedAt, tool, label, copy, status: 'run' as const }].slice(-ACTIVITY_MAX),
      )
      const todos = tool === 'TodoWrite' && Array.isArray(args.todos) ? (args.todos as { status?: string; activeForm?: string; content?: string }[]) : null
      await update($, now$, n => ({
        ...n,
        doing: tool + (label ? ': ' + label : ''),
        doingSince: startedAt,
        waiting: tool === 'AskUserQuestion' ? '질문에 답해 주세요' : n.waiting,
        todo: todos
          ? {
              done: todos.filter(t => t.status === 'completed').length,
              total: todos.length,
              current: (() => {
                const t = todos.find(x => x.status === 'in_progress')
                return t ? t.activeForm || t.content || null : null
              })(),
            }
          : n.todo,
      }))
    } catch {}

    const result = await next(e)

    try {
      const endedAt = await $.clock.now()
      const status: Activity['status'] =
        'deny' in result && typeof result.deny === 'string' ? 'denied' : result.isError ? 'fail' : 'ok'
      await update($, activity, list => list.map(a => (a.id === id ? { ...a, status, ms: endedAt - startedAt } : a)))
      await update($, now$, n => ({ ...n, waiting: null, doing: n.isBusy ? '생각 중' : null, doingSince: endedAt }))
      // 백그라운드로 돌린 셸: 끝났다는 알림이 올 때까지 활동 탭 위쪽에 보임
      const bgId = (result.result as { backgroundTaskId?: unknown } | undefined)?.backgroundTaskId
      if (status === 'ok' && typeof bgId === 'string') {
        await update($, workers, ws =>
          [...ws, { id: bgId, kind: 'shell' as const, label: label || tool, startedAt, status: 'running' as const }].slice(-WORKER_MAX),
        )
      }
      if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
        const raw = typeof args.file_path === 'string' ? args.file_path : args.notebook_path
        if (typeof raw === 'string') {
          const p = normPath(raw)
          await update($, touched, list => [...list.filter(x => x !== p), p].slice(-100))
        }
      }
    } catch {}
    return result
  }).catch(($, e, next) => next(e))

  // 권한 승인 창이 뜰 때 (조직 보안 가드로 classic 훅이 막히면 이 표시만 빠짐)
  on('classic.PermissionRequest', async ($, e, next) => {
    await update($, now$, n => ({ ...n, waiting: `승인 필요: ${e.tool_name}` }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // 턴 시작: 메인이면 '생각 중', 서브에이전트면 활동 탭에 추가
  on('turn.start', async ($, e, next) => {
    try {
      const t = await $.clock.now()
      const agentId = e.agentId
      if (agentId) {
        const info = (await $.agent.list().catch(() => [])).find(a => a.id === agentId)
        const label = info?.description || info?.type || '서브에이전트'
        await update($, workers, ws =>
          ws.some(w => w.id === agentId)
            ? ws.map(w => (w.id === agentId ? { ...w, status: 'running' as const } : w))
            : [...ws, { id: agentId, kind: 'agent' as const, label, startedAt: t, status: 'running' as const }].slice(-WORKER_MAX),
        )
      } else {
        const prev = await read($, now$)
        idleBeforeTurn = prev.lastReplyAt === null ? 0 : t - prev.lastReplyAt
        await update($, now$, n => ({ ...n, isBusy: true, doing: '생각 중', doingSince: t, waiting: null }))
        const text = e.text.trim() ? cut(e.text, 80) : prev.ask ?? ''
        await update($, turns, list => [...list, { start: t, text }].slice(-TURN_MAX))
      }
    } catch {}
    return next(e)
  }).catch(($, e, next) => next(e))

  // (prompt.submit 훅은 하나만 둘 수 있어서 아래 '지금 채팅' 훅에서 같이 처리)

  // 턴이 끝날 때마다: 사용량·Git 갱신, 경고, 캐시 시각
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // 서브에이전트의 턴: 활동 탭에서 끝남 표시만
    if (e.agentId) {
      const agentId = e.agentId
      try {
        const t = await $.clock.now()
        await update($, workers, ws =>
          ws.map(w =>
            w.id === agentId
              ? { ...w, status: e.reason === 'error' ? ('failed' as const) : ('done' as const), endedAt: t }
              : w,
          ),
        )
      } catch {}
      return result
    }
    try {
      const t = await $.clock.now()
      await update($, now$, n => ({ ...n, isBusy: false, doing: null, doingSince: null, waiting: null, lastReplyAt: t }))
      await update($, turns, list =>
        list.map((s, i) => (i === list.length - 1 && s.end === undefined ? { ...s, end: t, isFailed: e.reason === 'error' } : s)),
      )
      // 캐시 유지 시간 배우기: 5분 넘게 쉬었는데 캐시에서 읽었으면 60분, 못 읽었으면 5분
      const u = e.usage
      if (u && idleBeforeTurn > 5.5 * 60_000 && idleBeforeTurn < 55 * 60_000) {
        const hit = u.cache_read_input_tokens > u.input_tokens + u.cache_creation_input_tokens
        const ttl = hit ? 60 : 5
        if ((await read($, cacheTtl)) !== ttl) {
          await update($, cacheTtl, () => ttl)
          await $.store.set('cacheTtl', ttl)
        }
      }
      idleBeforeTurn = 0
    } catch {}
    try {
      const before = (await read($, usage))?.tokens ?? 0
      const snap = await refreshUsage($)
      await update($, history, list => [...list, Math.max(0, snap.tokens - before)].slice(-12))
      if (snap.percent >= DANGER_AT && warnedAt < DANGER_AT) {
        $.ui.toast(`컨텍스트 ${snap.percent}% — 압축을 고려하세요 (사이드바 › 사용량)`)
        warnedAt = DANGER_AT
      } else if (snap.percent < DANGER_AT) {
        // 주황(50~70%)은 색으로만 알리고, 빨강 넘을 때만 알림
        warnedAt = 0
      }
    } catch {}
    void refreshGit($).catch(() => {})
    return result
  })
  // ── 프롬프트 위 띠: 사이드바 버튼 + 컨텍스트 한 줄 ─────────
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const open = await read($, isOpen)
    const u = await read($, usage)
    ensureLoaded($, await read($, here))
    const theirs = await next(e)
    return (
      <Box flexDirection="column">
        {theirs}
        <Box flexDirection="row" columnGap={2}>
          <Button
            key="toggle-side"
            label={open ? '◧ 사이드바 닫기' : '◧ 사이드바'}
            onPress={() => (open ? closePane($) : openPane($, true))}
          />
          {!open && u && (
            <Text color={levelColor(u.percent)}>
              ctx {u.percent}% · {k(u.tokens)}/{k(u.window)}
            </Text>
          )}
        </Box>
      </Box>
    )
  })

  // ── 사이드바 본체 ─────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const width = Math.max(20, e.props.bodyColumns)
    // 사이드바를 넓히면 두 칸으로 나눔 (사용량: 왼쪽·오른쪽, 변경: 파일 목록·diff)
    const wide = width >= WIDE_AT
    const colW = wide ? Math.floor((width - COL_GAP) / 2) : width
    const current = await read($, tab)
    const now = await $.clock.now()
    const at = await read($, here)
    ensureLoaded($, at)
    const accent = await readAccent($)
    await read($, tick)
    const st = await read($, now$)
    const ttl = await read($, cacheTtl)
    const left = cacheLeft(st, ttl, now)
    // 캐시: 넉넉하면 흐리게, 1분 안 남으면 주황. 만료되면 다시 흐리게 (자리를 비운 동안 계속 경고하지 않음)
    const cacheColor = left === null || left <= 0 ? undefined : left < 60_000 ? ORANGE : undefined

    // 현재 탭: 강조색 + 굵게 + 밑줄, 나머지는 흐리게
    const tabButton = (id: Tab, label: string, hotkey: string) =>
      current === id ? (
        <Button key={'tab-' + id} label={label} hotkey={hotkey} plain onPress={() => update($, tab, () => id)}>
          <Text color={accent.main} weight="bold" underline>
            {label}
          </Text>
        </Button>
      ) : (
        <Button
          key={'tab-' + id}
          label={label}
          hotkey={hotkey}
          plain
          dimColor
          onPress={() => update($, tab, () => id)}
        />
      )

    // 섹션 제목: 굵은 글씨 + 오른쪽으로 흐린 구분선 (색은 데이터에만 씀)
    const heading = (text: string, w = width) => (
      <Text wrap="truncate-end">
        <Text weight="semibold">{text}</Text>
        <Text color={accent.soft}>{' ' + '─'.repeat(Math.max(2, w - cellWidth(text) - 1))}</Text>
      </Text>
    )

    // ── 탭 1: 사용량 ──
    const usageTab = async () => {
      const u = await read($, usage)
      const hist = await read($, history)
      if (!u) return <Text dimColor>사용량을 불러오는 중…</Text>
      // 막대 길이는 칸 폭에 맞춰 늘어남 (너무 길면 읽기 힘들어서 상한을 둠)
      const fit = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
      const barW = fit(colW - 6, 8, 60) // "████ 42%"
      const catW = fit(colW - 14 - 9, 6, 40) // 이름 14칸 · 막대 · "140.0k"
      const limitW = fit(colW - 8 - 7, 6, 40) // "5시간" 8칸 · 막대 · "42%"
      const maxCat = Math.max(1, ...u.categories.map(c => c.tokens))
      const leftCol = (
        <Box flexDirection="column" rowGap={1} {...(wide ? { width: colW } : {})}>
          <Box flexDirection="column">
            {heading('컨텍스트', colW)}
            <Text color={levelColor(u.percent)}>
              {bar(u.percent / 100, barW)} {u.percent}%
            </Text>
            <Text dimColor>
              {k(u.tokens)} / {k(u.window)} 토큰
            </Text>
            {u.percent >= DANGER_AT && (
              <Button
                key="compact"
                label="압축하기 (/compact)"
                onPress={async () => {
                  try {
                    $.ui.toast('대화를 압축하는 중…')
                    await $.session.compact()
                    warnedAt = 0
                    await refreshUsage($)
                  } catch {
                    $.ui.toast('지금은 압축할 수 없어요. 작업이 끝난 뒤 다시 눌러주세요')
                  }
                }}
              />
            )}
          </Box>

          {u.categories.length > 0 && (
            <Box flexDirection="column">
              {heading('구성', colW)}
              {u.categories.map(c => (
                <Box flexDirection="row" columnGap={1}>
                  <Box width={14}>
                    <Text wrap="truncate-end">{CATEGORY_KO[c.name] ?? c.name}</Text>
                  </Box>
                  <Text color={accent.soft}>{bar(c.tokens / maxCat, catW)}</Text>
                  <Text dimColor>{k(c.tokens)}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
      const rightCol = (
        <Box flexDirection="column" rowGap={1} {...(wide ? { width: colW } : {})}>
          {hist.length > 0 && (
            <Box flexDirection="column">
              {heading(`턴별 증가 (최근 ${hist.length}턴)`, colW)}
              <Text color={accent.main}>{spark(hist)}</Text>
              <Text dimColor>
                마지막 턴 +{k(hist[hist.length - 1] ?? 0)} · 최대 +{k(Math.max(...hist))}
              </Text>
            </Box>
          )}

          <Box flexDirection="column">
            {heading('프롬프트 캐시', colW)}
            {/* 컨텍스트 막대처럼 항상 막대 + % (남은 시간 비율). 작업 중이면 꽉 참, 응답 전·만료면 빔 */}
            {(() => {
              const ratio = st.isBusy ? 1 : left === null || left <= 0 ? 0 : left / (ttl * 60_000)
              const pct = Math.round(ratio * 100)
              const isLive = st.isBusy || (left !== null && left > 0)
              return (
                <Text color={isLive ? (cacheColor ?? accent.main) : undefined} dimColor={!isLive}>
                  {bar(ratio, barW)} {pct}%
                </Text>
              )
            })()}
            <Text dimColor>
              {st.isBusy
                ? '작업 중 · 끝나면 남은 시간이 줄어들기 시작'
                : left === null
                  ? '첫 응답 뒤부터 표시'
                  : left > 0
                    ? `${cacheText(left).replace('캐시 ', '')} 남음`
                    : '만료됨 · 다음 요청은 대화를 처음부터 다시 읽어서 사용량이 조금 더 들어요'}
              {` · 유지 시간 ${ttl}분`}
            </Text>
          </Box>

          <Box flexDirection="column">
            {heading('비용 · 한도', colW)}
            {u.costUsd !== null && <Text>세션 비용  ${u.costUsd.toFixed(2)}</Text>}
            {u.limits.length === 0 && <Text dimColor>한도 정보 없음 (구독 요금제에서 표시)</Text>}
            {u.limits.map(l => (
              <Box flexDirection="column">
                <Box flexDirection="row" columnGap={1}>
                  <Box width={8}>
                    <Text>{LIMIT_KO[l.kind] ?? l.kind}</Text>
                  </Box>
                  <Text color={limitColor(l.percentUsed)}>{bar(l.percentUsed / 100, limitW)}</Text>
                  <Text>{Math.round(l.percentUsed)}%</Text>
                </Box>
                {l.resetsAt && <Text dimColor>{'         ' + untilText(l.resetsAt, now)}</Text>}
              </Box>
            ))}
          </Box>
        </Box>
      )
      return (
        <Box flexDirection="column" rowGap={1}>
          {/* 넓으면 왼쪽(컨텍스트·구성) | 오른쪽(턴별·비용) 두 칸, 좁으면 위아래로 */}
          {wide ? (
            <Box flexDirection="row" columnGap={COL_GAP}>
              {leftCol}
              {rightCol}
            </Box>
          ) : (
            <Box flexDirection="column" rowGap={1}>
              {leftCol}
              {rightCol}
            </Box>
          )}
          <Button
            key="refresh-usage"
            label="새로고침"
            onPress={() => refreshUsage($).catch(() => {})}
          />
        </Box>
      )
    }

    // ── 탭 3: 변경 (Git) ──
    const gitTab = async () => {
      const info = await read($, git)
      const mine = await read($, touched)
      const sel = await read($, selected)
      const d = await read($, diff)
      const refresh = (
        <Button key="refresh-git" label="새로고침" onPress={() => refreshGit($).catch(() => {})} />
      )
      if (!info) return <Text dimColor>Git 상태를 불러오는 중…</Text>
      if (!info.isRepo)
        return (
          <Box flexDirection="column">
            <Text dimColor>이 폴더는 Git 저장소가 아니에요.</Text>
            {refresh}
          </Box>
        )
      const byClaude = (path: string) => mine.some(t => t.endsWith('/' + path) || t === path)
      const codeColor = (code: string) =>
        code.includes('?') ? GREEN : code.includes('D') ? RED : code.includes('A') ? GREEN : YELLOW
      const fileList = info.files.length > 0 && (
        <Box flexDirection="column" {...(wide && sel ? { width: Math.max(30, Math.floor(width * 0.4)) } : {})}>
          {info.files.slice(0, wide ? 60 : 30).map((f, i) => (
            <Box flexDirection="row" columnGap={1}>
              <Text color={codeColor(f.code)}>{f.code.replace(/ /g, '·')}</Text>
              <Button
                key={'file-' + i}
                label={(sel === f.path ? '▸ ' : '') + f.path}
                plain
                dimColor={sel !== null && sel !== f.path}
                onPress={async () => {
                  if (sel === f.path) {
                    await update($, selected, () => null)
                    return
                  }
                  await update($, selected, () => f.path)
                  await update($, diff, () => '불러오는 중…')
                  await loadDiff($, f.path).catch(() => update($, diff, () => '(diff를 읽지 못했어요)'))
                }}
              />
              {byClaude(f.path) && <Text color={accent.main}>●</Text>}
            </Box>
          ))}
          {info.files.length > (wide ? 60 : 30) && (
            <Text dimColor>… {info.files.length - (wide ? 60 : 30)}개 더</Text>
          )}
        </Box>
      )
      const diffView = sel && (
        <Box flexDirection="column" {...(wide ? { flexGrow: 1, flexShrink: 1 } : {})}>
          {heading(sel)}
          <ui.Code source={d} format="diff" />
        </Box>
      )
      return (
        <Box flexDirection="column" rowGap={1}>
          <Box flexDirection="column">
            <Text weight="semibold">
              ⎇ {info.branch}
              {info.ahead > 0 ? `  ↑${info.ahead}` : ''}
              {info.behind > 0 ? `  ↓${info.behind}` : ''}
            </Text>
            <Text dimColor>
              바뀐 파일 {info.files.length}개 · <Text color={accent.main}>●</Text> Claude가 수정
            </Text>
          </Box>
          {info.files.length === 0 && <Text dimColor>깨끗해요. 바뀐 파일 없음 ✓</Text>}
          {/* 넓으면 파일 목록 | diff 나란히, 좁으면 위아래로 */}
          {wide && diffView ? (
            <Box flexDirection="row" columnGap={COL_GAP}>
              {fileList}
              {diffView}
            </Box>
          ) : (
            <Box flexDirection="column" rowGap={1}>
              {fileList}
              {diffView}
            </Box>
          )}
          {refresh}
        </Box>
      )
    }

    // ── 탭 2: 채팅방 ──
    const roomsTab = async () => {
      const cur = await read($, here)
      const allRooms = await read($, rooms)
      const localRooms = allRooms.filter(r => !cur || samePath(r.cwd, cur.cwd))
      const opened = await read($, openFolders)
      // 다른 폴더 채팅방을 폴더별로 묶음
      const groups: { key: string; cwd: string; list: Room[] }[] = []
      for (const r of allRooms) {
        if (localRooms.includes(r)) continue
        const key = folderKey(r.cwd)
        const g = groups.find(x => x.key === key)
        if (g) g.list.push(r)
        else groups.push({ key, cwd: r.cwd, list: [r] })
      }
      return (
        <Box flexDirection="column" rowGap={1}>
          <Box flexDirection="column">
            {'Input' in ui && (
              <ui.Input
                key="room-name"
                label="이름"
                placeholder="현재 채팅에 이름 붙여 저장"
                value=""
                submitLabel="저장"
                onSubmit={async (value: string) => {
                  const name = value.trim()
                  if (name) await nameThisRoom($, name)
                }}
              />
            )}
            {localRooms.length === 0 && (
              <Text dimColor>저장한 채팅방이 없어요. 위에 이름을 입력해 저장하세요.</Text>
            )}
            {localRooms.map((r, i) => {
              const isHere = cur?.id === r.id
              return (
                <Box flexDirection="row" columnGap={1}>
                  <Button
                    key={'room-' + i}
                    label={(isHere ? '● ' : '→ ') + r.name}
                    plain
                    dimColor={isHere}
                    onPress={() => goToRoom($, r)}
                  />
                  {isHere && <Text dimColor>(지금)</Text>}
                  <Button
                    key={'room-del-' + i}
                    label="x"
                    plain
                    dimColor
                    onPress={() => saveRooms($, l => l.filter(x => x.id !== r.id))}
                  />
                </Box>
              )
            })}
            <Text dimColor>/room 이름 으로도 이동할 수 있어요</Text>
          </Box>

          {groups.length > 0 && (
            <Box flexDirection="column">
              {heading('다른 폴더')}
              <Text dimColor>누르면 그 폴더에서 새 터미널 창으로 열려요</Text>
              {groups.map((g, gi) => {
                const isOpen = opened.includes(g.key)
                return (
                  <Box flexDirection="column">
                    <Button
                      key={'folder-' + gi}
                      label={`${isOpen ? '▾' : '▸'} ${folderName(g.cwd)} (${g.list.length})`}
                      plain
                      onPress={() =>
                        update($, openFolders, l => (l.includes(g.key) ? l.filter(k => k !== g.key) : [...l, g.key]))
                      }
                    />
                    {isOpen && (
                      <Text dimColor wrap="truncate-start">
                        {'   ' + g.cwd}
                      </Text>
                    )}
                    {isOpen &&
                      g.list.map((r, ri) => (
                        <Box flexDirection="row" columnGap={1}>
                          <Text>{'  '}</Text>
                          <Button
                            key={`far-${gi}-${ri}`}
                            label={'↗ ' + r.name}
                            plain
                            onPress={() => openElsewhere($, r)}
                          />
                          <Button
                            key={`far-del-${gi}-${ri}`}
                            label="x"
                            plain
                            dimColor
                            onPress={() => saveRooms($, l => l.filter(x => x.id !== r.id))}
                          />
                        </Box>
                      ))}
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
      )
    }

    // ── 탭 4: 메모 ──
    const notesTab = async () => {
      const list = await read($, notes)
      const doneCount = list.filter(n => n.isDone).length
      return (
        <Box flexDirection="column" rowGap={1}>
          <Box flexDirection="column">
            {'Input' in ui && (
              <ui.Input
                key="new-note"
                label="추가"
                placeholder="메모 입력 후 Enter"
                value=""
                submitLabel="저장"
                onSubmit={async (value: string) => {
                  const text = value.trim()
                  if (text) await saveNotes($, l => [...l, { text, isDone: false }])
                }}
              />
            )}
            {list.length === 0 && <Text dimColor>메모가 없어요.</Text>}
            {list.map((n, i) => (
              <Box flexDirection="row" columnGap={1}>
                <Button
                  key={'done-' + i}
                  label={n.isDone ? '[✓]' : '[ ]'}
                  plain
                  onPress={() =>
                    saveNotes($, l => l.map((x, j) => (j === i ? { ...x, isDone: !x.isDone } : x)))
                  }
                />
                <Text dimColor={n.isDone} wrap="wrap">
                  {n.text}
                </Text>
                <Button
                  key={'del-' + i}
                  label="x"
                  plain
                  dimColor
                  onPress={() => saveNotes($, l => l.filter((_, j) => j !== i))}
                />
              </Box>
            ))}
          </Box>
          {list.length > 0 && (
            <Box flexDirection="row" columnGap={2}>
              <Text dimColor>
                {list.length - doneCount}개 남음 · {doneCount}개 완료
              </Text>
              {doneCount > 0 && (
                <Button
                  key="clear-done"
                  label="완료 항목 지우기"
                  plain
                  dimColor
                  onPress={() => saveNotes($, l => l.filter(x => !x.isDone))}
                />
              )}
            </Box>
          )}
        </Box>
      )
    }

    // ── 탭 4: 활동 (타임라인) ──
    // 메인 Claude와 서브에이전트·백그라운드 셸을 한 줄(레인)씩, 언제 돌았는지 시간 막대로
    const activityTab = async () => {
      const ws = await read($, workers)
      const ts = await read($, turns)
      const acts = await read($, activity)
      const horizon = now - 60 * 60_000
      const alive = (end: number | undefined) => (end ?? now) > horizon
      const lanesW = ws.filter(w => alive(w.endedAt)).slice(-(wide ? 12 : 6))
      const starts = [...ts.filter(t => alive(t.end)).map(t => t.start), ...lanesW.map(w => w.startedAt)]
      const span = starts.length ? now - Math.min(...starts) : 0
      const windowMin = [5, 10, 15, 30, 60].find(m => span <= m * 60_000) ?? 60
      const from = now - windowMin * 60_000
      const labelW = wide ? 22 : 12
      const timeW = 6
      const cells = Math.max(10, Math.min(120, width - labelW - timeW - 2))

      const cellChar = ['·', '█', '█', '█']
      const cellColor = [undefined, accent.soft, accent.main, RED]
      const laneBar = (spans: LaneSpan[]) =>
        runsOf(laneCells(spans, from, now, cells)).map(r => (
          <Text color={cellColor[r.state]} dimColor={r.state === 0}>
            {cellChar[r.state]!.repeat(r.len)}
          </Text>
        ))
      const lane = (name: string, spans: LaneSpan[], time: string, isRunning: boolean) => (
        <Box flexDirection="row" columnGap={1}>
          <Box width={labelW} flexShrink={0}>
            <Text wrap="truncate-end" dimColor={!isRunning}>
              {name}
            </Text>
          </Box>
          <Text>{laneBar(spans)}</Text>
          <Text dimColor>{time}</Text>
        </Box>
      )

      const mainSpans: LaneSpan[] = ts
        .filter(t => alive(t.end))
        .map(t => ({ start: t.start, end: t.end, state: t.end === undefined ? 2 : t.isFailed ? 3 : 1 }))
      const busyMs = ts.filter(t => alive(t.end)).reduce((sum, t) => sum + ((t.end ?? now) - Math.max(t.start, from)), 0)
      const running = lanesW.filter(w => w.status === 'running').length

      const mark = (st: Activity['status']) =>
        st === 'run' ? <Text color={accent.main}>▸</Text> : st === 'ok' ? <Text color={GREEN}>✓</Text> : st === 'denied' ? <Text color={ORANGE}>⊘</Text> : <Text color={RED}>✗</Text>
      // 요청별 기록: 요청(턴) 하나에 그 동안 쓴 도구를 묶음. 최근 5개, '더 보기'면 30개
      const opened = await read($, openTurns)
      const showAll = await read($, showAllTurns)
      const reqs = ts
        .map((t, i) => {
          const tools = acts.filter(x => x.at >= t.start && x.at <= (t.end ?? now))
          const files = new Set(
            tools.filter(x => ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(x.tool) && x.copy).map(x => x.copy!),
          )
          return { t, i, tools, files: files.size, fails: tools.filter(x => x.status === 'fail').length }
        })
        .reverse()
      const shownReqs = reqs.slice(0, showAll ? TURN_MAX : 5)
      return (
        <Box flexDirection="column" rowGap={1}>
          <Box flexDirection="column">
            {heading(`타임라인 · 최근 ${windowMin}분` + (running ? ` · ${running}개 실행 중` : ''))}
            {mainSpans.length === 0 && lanesW.length === 0 ? (
              <Text dimColor>아직 기록이 없어요. Claude가 일하면 여기에 막대로 쌓여요</Text>
            ) : (
              <Box flexDirection="column">
                {lane('메인', mainSpans, st.isBusy ? agoLive(Math.max(0, busyMs)) : ago(Math.max(0, busyMs)), st.isBusy)}
                {lanesW.map(w =>
                  lane(
                    (w.kind === 'agent' ? '◆ ' : '$ ') + w.label,
                    [{ start: w.startedAt, end: w.endedAt, state: w.status === 'running' ? 2 : w.status === 'failed' ? 3 : 1 }],
                    w.status === 'running' ? agoLive(now - w.startedAt) : ago((w.endedAt ?? now) - w.startedAt),
                    w.status === 'running',
                  ),
                )}
                <Box flexDirection="row" columnGap={1}>
                  <Box width={labelW} flexShrink={0}>
                    <Text> </Text>
                  </Box>
                  <Text dimColor>{('-' + windowMin + '분').padEnd(cells - 2) + '지금'}</Text>
                </Box>
              </Box>
            )}
            <Text dimColor>
              <Text color={accent.main}>█</Text> 실행 중 <Text color={accent.soft}>█</Text> 끝남 <Text color={RED}>█</Text> 실패 · ◆ 서브에이전트 $ 백그라운드 셸
            </Text>
          </Box>

          <Box flexDirection="column">
            {heading(`요청별 기록 (${reqs.length})`)}
            {reqs.length === 0 && <Text dimColor>아직 보낸 요청이 없어요</Text>}
            {shownReqs.map(r => {
              const isOpen = opened.includes(r.t.start)
              const isRunning = r.t.end === undefined
              const meta = [
                isRunning ? '진행 중' : ago(r.t.end! - r.t.start),
                `도구 ${r.tools.length}`,
                r.files ? `파일 ${r.files}` : '',
                r.fails ? `실패 ${r.fails}` : '',
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <Box flexDirection="column">
                  <Box flexDirection="row" columnGap={1}>
                    {isRunning ? <Text color={accent.main}>▸</Text> : r.t.isFailed ? <Text color={RED}>✗</Text> : <Text color={GREEN}>✓</Text>}
                    <Button
                      key={'turn-' + r.i}
                      label={(isOpen ? '▾ ' : '▸ ') + (r.t.text || '(이어서 진행)')}
                      plain
                      dimColor={!isRunning && !isOpen}
                      onPress={() =>
                        update($, openTurns, l => (l.includes(r.t.start) ? l.filter(x => x !== r.t.start) : [...l, r.t.start]))
                      }
                    />
                  </Box>
                  <Box flexDirection="row">
                    <Text>{'    '}</Text>
                    <Text dimColor wrap="truncate-end">
                      {meta}
                    </Text>
                  </Box>
                  {isOpen &&
                    r.tools.slice(0, 15).map((a, j) => (
                      <Box flexDirection="row" columnGap={1}>
                        <Text>{'   '}</Text>
                        {mark(a.status)}
                        <Box width={10} flexShrink={0}>
                          <Text dimColor wrap="truncate-end">
                            {a.tool}
                          </Text>
                        </Box>
                        {a.copy ? (
                          <Button
                            key={`act-${r.i}-${j}`}
                            label={a.label || a.tool}
                            plain
                            dimColor={a.status !== 'run'}
                            onPress={async press => {
                              await $.ui.copy({ text: a.copy!, surface: press.surface })
                              $.ui.toast('복사했어요')
                            }}
                          />
                        ) : (
                          <Text dimColor={a.status !== 'run'} wrap="truncate-end">
                            {a.label}
                          </Text>
                        )}
                        <Text dimColor>{a.status === 'run' ? agoLive(now - a.at) : a.ms !== undefined ? ago(a.ms) : ''}</Text>
                      </Box>
                    ))}
                  {isOpen && r.tools.length > 15 && <Text dimColor>{`      … ${r.tools.length - 15}개 더`}</Text>}
                  {isOpen && r.tools.length === 0 && <Text dimColor>{'      도구를 쓰지 않았어요'}</Text>}
                </Box>
              )
            })}
            {reqs.length > 5 && (
              <Button
                key="turns-more"
                label={showAll ? '▴ 접기' : `▾ 더 보기 (${reqs.length - 5}개)`}
                plain
                dimColor
                onPress={() => update($, showAllTurns, v => !v)}
              />
            )}
            {reqs.length > 0 && <Text dimColor>요청을 누르면 쓴 도구가 펼쳐져요 · 명령·파일은 눌러서 복사</Text>}
          </Box>
        </Box>
      )
    }

    const body =
      current === 'rooms'
        ? await roomsTab()
        : current === 'git'
          ? await gitTab()
          : current === 'notes'
            ? await notesTab()
            : current === 'activity'
              ? await activityTab()
              : await usageTab()

    // 맨 위: 폴더 이름 · 컨텍스트 % · 캐시 · 경로 복사, 아랫줄에 작업 위치(홈은 ~로 줄이고, 길면 앞을 자름)
    const cwd = at?.cwd ?? ''
    const folder = normPath(cwd).replace(/\/+$/, '').split('/').pop() || cwd
    const shortPath = normPath(cwd).replace(/^([A-Za-z]:\/Users|\/home|\/Users)\/[^/]+/i, '~')
    const ctx = await read($, usage)

    // 지금 상황: 요청 · 지금 하는 일 · 할 일 진행 · 내가 할 일(승인·답변)
    const label = (t: string) => (
      <Box width={6} flexShrink={0}>
        <Text dimColor>{t}</Text>
      </Box>
    )
    const status = (
      <Box flexDirection="column">
        {st.waiting && (
          <Text color={ORANGE} weight="bold" wrap="truncate-end">
            {'⚠ ' + st.waiting}
          </Text>
        )}
        {st.ask && (
          <Box flexDirection="row">
            {label('요청')}
            <Text wrap="truncate-end">{st.ask}</Text>
          </Box>
        )}
        <Box flexDirection="row">
          {label('지금')}
          {st.isBusy ? (
            <Text wrap="truncate-end">
              <Text color={accent.main}>{'▸ '}</Text>
              {st.doing ?? '생각 중'}
              <Text dimColor>{st.doingSince ? '  ' + agoLive(now - st.doingSince) : ''}</Text>
            </Text>
          ) : (
            <Text dimColor>대기 중</Text>
          )}
        </Box>
        {st.todo && st.todo.total > 0 && (
          <Box flexDirection="row">
            {label('할 일')}
            <Text wrap="truncate-end">
              <Text color={accent.main}>{bar(st.todo.done / st.todo.total, Math.min(10, st.todo.total))}</Text>
              {` ${st.todo.done}/${st.todo.total}`}
              <Text dimColor>{st.todo.current ? ' · ' + st.todo.current : ''}</Text>
            </Text>
          </Box>
        )}
      </Box>
    )

    const header = (
      <Box flexDirection="column">
      <Box flexDirection="row" columnGap={2}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Text color={accent.main}>▣ </Text>
            <Text weight="semibold">{folder || '폴더 확인 중…'}</Text>
          </Text>
        </Box>
        {ctx && <Text color={levelColor(ctx.percent)}>ctx {ctx.percent}%</Text>}
        {left !== null && (
          <Text color={cacheColor} dimColor={cacheColor === undefined}>
            {cacheText(left)}
          </Text>
        )}
        {cwd && (
          <Button
            key="copy-path"
            label="경로 복사"
            plain
            dimColor
            onPress={async press => {
              await $.ui.copy({ text: cwd, surface: press.surface })
              $.ui.toast('경로를 복사했어요')
            }}
          />
        )}
      </Box>
      {cwd && (
        <Text dimColor wrap="truncate-start">
          {shortPath}
        </Text>
      )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {header}
        {status}
        <Box flexDirection="row" columnGap={2} flexWrap="wrap">
          {tabButton('usage', '사용량', '1')}
          {tabButton('rooms', '채팅방', '2')}
          {tabButton('git', '변경', '3')}
          {tabButton('activity', '활동', '4')}
          {tabButton('notes', '메모', '5')}
        </Box>
        <Text color={accent.soft}>{'─'.repeat(width)}</Text>
        {body}
      </Box>
    )
  })
}
