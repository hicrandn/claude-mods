export type ContextLevel = 'calm' | 'warm' | 'hot'

export type ContextDemo = ContextLevel

/** What the band shows: how much of the window the last reply was answered over. */
export type ContextView = {
  level: ContextLevel
  /** Whole percent of the window in use, 0 to 100. */
  percent: number
  /** Input tokens of the last reply. */
  tokens: number
  /** The model's context window, in tokens. */
  window: number
  /** True before the live window's first reply (a new session, right after /clear or /compact). */
  isPending?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'context-band': {
      demo: ContextDemo | null
      view: ContextView | null
    }
  }
}
