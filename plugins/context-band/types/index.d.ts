export type ContextLevel = 'calm' | 'warm' | 'hot'

export type ContextDemo = ContextLevel

/** What the band shows: how far the last reply's input has come toward compaction. */
export type ContextView = {
  level: ContextLevel
  /** Whole percent of `limit` in use, 0 to 100. */
  percent: number
  /** Input tokens of the last reply. */
  tokens: number
  /** What the fill counts against: where auto-compaction runs, else the model's whole window. */
  limit: number
  /** The model's whole context window, in tokens. */
  window: number
  /** True when `limit` is the auto-compaction point. */
  isAutoCompact: boolean
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
