export type TorchLook = 'awake' | 'tired' | 'sleep'

export type TorchDemo = TorchLook | 'wake'

/** How much room the band takes: one line, or the torchbearer. */
export type TorchSize = 'compact' | 'full'

/** What the band shows: the state, its speech line, and the window it reads. */
export type TorchView = {
  look: TorchLook
  lineIndex: number
  lineAt: number
  percentLeft: number
  resetsAt: number | null
  /** The rate-limit window shown (`five_hour`, `seven_day`); null in a demo. */
  kind: string | null
  isWaking: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'usage-torch': {
      demo: TorchDemo | null
      view: TorchView | null
      countdown: string
    }
  }
}
