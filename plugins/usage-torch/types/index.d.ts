export type TorchLook = 'awake' | 'tired' | 'sleep'

export type TorchDemo = TorchLook

/** What the band shows: the state and the window it reads. */
export type TorchView = {
  look: TorchLook
  percentLeft: number
  resetsAt: number | null
  /** The rate-limit window shown (`five_hour`, `seven_day`); null in a demo. */
  kind: string | null
  /** What is left of every window the last reading reported, 5-hour first; null in a demo. */
  windows?: { kind: string; percentLeft: number }[] | null
  /** True while the session has had no reading yet: the band shows, waiting for figures. */
  isPending?: boolean
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
