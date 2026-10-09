import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { TorchDemo, TorchLook, TorchView } from '../types'
import { DEFAULT_THRESHOLDS, formatClock, formatCountdown, lookFor } from './logic.ts'
import type { Thresholds } from './logic.ts'
import * as text from './text.ts'
import type { WindowLeft } from './text.ts'

const demo = atom({ plugin: 'usage-torch', key: 'demo' } as const, null)
const view = atom({ plugin: 'usage-torch', key: 'view' } as const, null)
const countdown = atom({ plugin: 'usage-torch', key: 'countdown' } as const, '')

const BAR_CELLS = 10
// The bar takes the flame's color for the state: bright, low, out.
const BAR_COLORS: Record<TorchLook, string> = { awake: '#EF9F27', tired: '#D85A30', sleep: '#888780' }
const DEMOS: readonly TorchDemo[] = ['awake', 'tired', 'sleep']
const DEMO_PERCENT_LEFT: Record<TorchLook, number> = { awake: 82, tired: 18, sleep: 0 }
const DEMO_RESET_MS = 12 * 60_000 + 30_000
const TICK_MS = 1000

// Module state: a reload starts it over, the host keeps what the drawing reads in $.state.
let thresholds: Thresholds = DEFAULT_THRESHOLDS
// The last real reading: the window closest to its limit, and what is left of every window.
let real: { percentUsed: number; resetsAt: number | null; kind: string | null; windows: WindowLeft[] } | null = null
// Whether a measurement came in: before one, the band shows a waiting line.
let measured = false
let timer: Timer | undefined

const viewFor = (
  look: TorchLook,
  percentLeft: number,
  resetsAt: number | null,
  kind: string | null = null,
  windows: WindowLeft[] | null = null,
): TorchView => ({ look, percentLeft, resetsAt, kind, windows })

const clockOf = (resetsAt: number | null): string =>
  resetsAt === null ? '' : formatClock(resetsAt, -new Date(resetsAt).getTimezoneOffset())

const barOf = (percentLeft: number): string => {
  const lit = Math.round((Math.min(100, Math.max(0, percentLeft)) / 100) * BAR_CELLS)
  return '▰'.repeat(lit) + '▱'.repeat(BAR_CELLS - lit)
}

function realView(): TorchView | null {
  if (real === null) return null
  const percentLeft = leftOf(real.percentUsed)
  return viewFor(lookFor(real.percentUsed, thresholds), percentLeft, real.resetsAt, real.kind, real.windows)
}

// Before the first measurement the band waits; after one with no windows (no subscription) it hides.
function shownView(): TorchView | null {
  return realView() ?? (measured ? null : { ...viewFor('awake', 100, null), isPending: true })
}

const leftOf = (percentUsed: number): number => Math.max(0, Math.round(100 - percentUsed))

// The 5-hour window reads first, then the weekly one, then any other in the order reported.
const WINDOW_ORDER = ['five_hour', 'seven_day']
const rankOf = (kind: string): number => {
  const i = WINDOW_ORDER.indexOf(kind)
  return i === -1 ? WINDOW_ORDER.length : i
}

// The window that binds first: the most used of those the last response reported.
function readingOf(limits: readonly SessionRateLimit[]) {
  if (limits.length === 0) return null
  const w = limits.reduce((a, b) => (b.percentUsed > a.percentUsed ? b : a))
  const resetsAt = w.resetsAt === undefined ? null : Date.parse(w.resetsAt)
  const windows = [...limits]
    .sort((a, b) => rankOf(a.kind) - rankOf(b.kind))
    .map(l => ({ kind: l.kind, percentLeft: leftOf(l.percentUsed) }))
  return { percentUsed: w.percentUsed, resetsAt: Number.isNaN(resetsAt) ? null : resetsAt, kind: w.kind, windows }
}

// Draws the real reading unless a demo holds the band; leaving sleep says the torch relit.
async function showReal($: EngineInterface) {
  if ((await read($, demo)) !== null) return
  const now = await $.clock.now()
  const next = shownView()
  const cur = await read($, view)
  if (next?.look === 'sleep' && next.resetsAt !== null) {
    const left = formatCountdown(next.resetsAt - now)
    await update($, countdown, () => left)
  }
  await update($, view, () => next)
  if (cur?.look === 'sleep' && next !== null && next.look !== 'sleep') $.ui.toast(text.WAKE_TOAST)
}

// Once a second while asleep: the countdown ticks, and the window's reset is noticed here,
// since no turn runs while the limit is hit.
async function step($: EngineInterface) {
  const v = await read($, view)
  if (v !== null && v.look === 'sleep' && v.resetsAt !== null) {
    const now = await $.clock.now()
    if (now >= v.resetsAt && real !== null && (await read($, demo)) === null) {
      const kind = real.kind
      const windows = real.windows.map(w => (w.kind === kind ? { ...w, percentLeft: 100 } : w))
      real = { percentUsed: 0, resetsAt: null, kind, windows }
      await showReal($)
    } else {
      const left = formatCountdown(v.resetsAt - now)
      if (left !== (await read($, countdown))) await update($, countdown, () => left)
    }
  }

  timer = $.clock.after(TICK_MS, () => void step($))
}

export const register: Register = (on, options) => {
  const { tiredBelowPercent, sleepAtPercentUsed } = options
  thresholds = {
    tiredBelowPercent: typeof tiredBelowPercent === 'number' ? tiredBelowPercent : DEFAULT_THRESHOLDS.tiredBelowPercent,
    sleepAtPercentUsed: typeof sleepAtPercentUsed === 'number' ? sleepAtPercentUsed : DEFAULT_THRESHOLDS.sleepAtPercentUsed,
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'torch',
      description: text.COMMAND_DESCRIPTION,
      argumentHint: text.COMMAND_HINT,
    })
    timer?.cancel()
    void step($)

    const result = await next(e)
    real = readingOf((await $.session.usage()).rateLimits)
    await showReal($)
    return result
  })

  // Every measurement counts: the first one with no windows is what hides the waiting band.
  on('session.measure', async ($, e, next) => {
    measured = true
    real = readingOf(e.rateLimits)
    await showReal($)
    return next(e)
  })

  on('command.run', { command: 'torch' }, async ($, e) => {
    const [sub, arg] = e.args.trim().split(/\s+/)

    if (sub === 'demo' && arg === 'off') {
      await update($, demo, () => null)
      await update($, view, () => null)
      await showReal($)
      return { text: text.DEMO_OFF }
    }

    // A bare /torch reports the figures, like /torch status.
    if (sub === undefined || sub === '' || sub === 'status') {
      const v = await read($, view)
      if (v === null || v.isPending === true) return { text: text.NO_READING }
      return { text: `Usage Torch: ${text.usageLine(v.percentLeft, v.kind, clockOf(v.resetsAt), v.windows)}` }
    }

    const chosen = DEMOS.find(d => d === arg)
    if (sub === 'demo' && chosen !== undefined) {
      const now = await $.clock.now()
      const resetsAt = chosen === 'sleep' ? now + DEMO_RESET_MS : null
      await update($, demo, () => chosen)
      await update($, countdown, () => (resetsAt === null ? '' : formatCountdown(resetsAt - now)))
      await update($, view, () => viewFor(chosen, DEMO_PERCENT_LEFT[chosen], resetsAt))
      return { text: text.DEMO_ON(chosen) }
    }

    return { text: text.USAGE }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const v = await read($, view)
    if (v === null) return next(e)

    const clock = clockOf(v.resetsAt)
    const usage = v.isPending === true ? text.WAITING : text.usageLine(v.percentLeft, v.kind, clock, v.windows)

    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      const head = v.isPending === true ? 'Usage Torch' : text.oneLine(v.percentLeft)
      return <Text dimColor>{`${head} · ${usage}`}</Text>
    }

    const { Box, Text } = $.ui.resolve(e)
    const isOut = v.look === 'sleep'
    const isResting = isOut && v.resetsAt !== null
    const left = isResting ? await read($, countdown) : ''

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={BAR_COLORS[v.look]} bold>
          {text.LABEL}
        </Text>
        {v.isPending !== true && <Text color={BAR_COLORS[v.look]}>{barOf(v.percentLeft)}</Text>}
        <Text wrap="truncate-end" dimColor>
          {isOut
            ? [text.OUT_OF_LIGHT, isResting ? `${left} · ${text.relightsAt(clock)}` : ''].filter(Boolean).join(' · ')
            : usage}
        </Text>
      </Box>
    )
  })
}
