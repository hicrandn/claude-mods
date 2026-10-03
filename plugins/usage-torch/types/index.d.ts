export type TorchLook = 'awake' | 'tired' | 'sleep'

export type TorchDemo = TorchLook | 'wake'

/** What the band shows: the state, its speech line, and the window it reads. */
export type TorchView = {
  look: TorchLook
  lineIndex: number
  lineAt: number
  percentLeft: number
  resetsAt: number | null
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
