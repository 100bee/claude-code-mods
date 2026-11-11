export type Tab = 'usage' | 'rooms' | 'git' | 'notes' | 'activity'

// 활동 탭: 도구 호출 한 건
export type Activity = {
  id: string
  at: number
  tool: string
  label: string
  // 누르면 복사할 내용 (Bash 명령, 파일 경로)
  copy?: string
  status: 'run' | 'ok' | 'fail' | 'denied'
  ms?: number
}

// 활동 탭 위쪽: 서브에이전트·백그라운드 셸
export type Worker = {
  id: string
  kind: 'agent' | 'shell'
  label: string
  startedAt: number
  status: 'running' | 'done' | 'failed'
  endedAt?: number
}

// 활동 탭: 메인 Claude가 일한 구간 (턴 하나 = 내가 보낸 요청 하나). 타임라인·요청별 기록에 씀
export type Span = { start: number; end?: number; isFailed?: boolean; text?: string }

// 헤더 아래 '지금 상황'
export type Now = {
  ask: string | null
  doing: string | null
  doingSince: number | null
  waiting: string | null
  todo: { done: number; total: number; current: string | null } | null
  isBusy: boolean
  lastReplyAt: number | null
}

export type UsageSnap = {
  percent: number
  tokens: number
  window: number
  categories: { name: string; tokens: number }[]
  costUsd: number | null
  limits: { kind: string; percentUsed: number; resetsAt: string | null }[]
}

export type GitFile = { code: string; path: string }

export type GitInfo =
  | { isRepo: false }
  | {
      isRepo: true
      root: string
      branch: string
      ahead: number
      behind: number
      files: GitFile[]
    }

export type Note = { text: string; isDone: boolean }

export type Room = { name: string; id: string; cwd: string; savedAt: number }
export type Here = { id: string; cwd: string }

declare module 'claude-code' {
  interface PluginState {
    'custom-sidebar': {
      tab: Tab
      isOpen: boolean
      usage: Shaped<UsageSnap | null>
      history: Shaped<number[]>
      git: Shaped<GitInfo | null>
      touched: Shaped<string[]>
      selected: string | null
      diff: string
      notes: Shaped<Note[]>
      rooms: Shaped<Room[]>
      here: Shaped<Here | null>
      openFolders: Shaped<string[]>
      activity: Shaped<Activity[]>
      workers: Shaped<Worker[]>
      turns: Shaped<Span[]>
      now: Shaped<Now>
      cacheTtl: number
      tick: number
      openTurns: number[]
      showAllTurns: boolean
    }
  }
}
