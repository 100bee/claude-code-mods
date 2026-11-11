export type ChatThemeTone = { title: string; border: string }

// 지금 고른 팔레트의 색. 다른 mod(사이드바 등)가 읽어서 색을 맞출 수 있게 공개한다.
export type ChatThemeColors = {
  palette: string
  user: ChatThemeTone
  claude: ChatThemeTone
}

declare module 'claude-code' {
  interface PluginState {
    'chat-theme': {
      colors: ChatThemeColors
    }
  }
}
