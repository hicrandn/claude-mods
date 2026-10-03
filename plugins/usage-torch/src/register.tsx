import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { TorchDemo, TorchLook, TorchSize, TorchView } from '../types'
import { packCells, poseFor, SCENE_COLUMNS, SCENE_ROWS, sceneCells, WAKE_STEPS, wakePose } from './frames.ts'
import { DEFAULT_THRESHOLDS, formatClock, formatCountdown, lineText, lookFor, nextLine } from './logic.ts'
import type { Thresholds } from './logic.ts'
import * as text from './text.ts'
import type { WindowLeft } from './text.ts'

const demo = atom({ plugin: 'usage-torch', key: 'demo' } as const, null)
const view = atom({ plugin: 'usage-torch', key: 'view' } as const, null)
const countdown = atom({ plugin: 'usage-torch', key: 'countdown' } as const, '')

const RASTER = 'torch'
const SIZE_KEY = 'size'
const SIZES: readonly TorchSize[] = ['compact', 'full']
const DEFAULT_SIZE: TorchSize = 'full'
const BAR_CELLS = 10
// The bar takes the flame's color for the state: bright, low, out.
const BAR_COLORS: Record<TorchLook, string> = { awake: '#EF9F27', tired: '#D85A30', sleep: '#888780' }
const DEMOS: readonly TorchDemo[] = ['awake', 'tired', 'sleep', 'wake']
const DEMO_PERCENT_LEFT: Record<TorchLook, number> = { awake: 82, tired: 18, sleep: 0 }
const DEMO_RESET_MS = 12 * 60_000 + 30_000
// The wake-up holds the sleeping pose this many steps before the eyes open.
const WAKE_LEAD = 4
const WAKE_STEP_MS = 400

// Module state: a reload starts it over, the host keeps what the drawing reads in $.state.
let reduceMotion = false
let thresholds: Thresholds = DEFAULT_THRESHOLDS
// The last real reading: the window closest to its limit, and what is left of every window.
let real: { percentUsed: number; resetsAt: number | null; kind: string | null; windows: WindowLeft[] } | null = null
// Whether a measurement came in: before one, the band shows the torchbearer waiting.
let measured = false
let bandId: string | undefined
let drawnSize: TorchSize = DEFAULT_SIZE
let isWorking = false
let tick = 0
let wakeStep = 0
let timer: Timer | undefined

function poseOf(v: TorchView) {
  if (!v.isWaking) return poseFor(v.look, reduceMotion ? 0 : tick)
  return wakeStep < WAKE_LEAD ? poseFor('sleep', tick) : wakePose(wakeStep - WAKE_LEAD)
}

const viewFor = (
  look: TorchLook,
  now: number,
  percentLeft: number,
  resetsAt: number | null,
  kind: string | null = null,
  windows: WindowLeft[] | null = null,
): TorchView => ({
  look,
  lineIndex: 0,
  lineAt: now,
  percentLeft,
  resetsAt,
  kind,
  windows,
  isWaking: false,
})

const clockOf = (resetsAt: number | null): string =>
  resetsAt === null ? '' : formatClock(resetsAt, -new Date(resetsAt).getTimezoneOffset())

const barOf = (percentLeft: number): string => {
  const lit = Math.round((Math.min(100, Math.max(0, percentLeft)) / 100) * BAR_CELLS)
  return '▰'.repeat(lit) + '▱'.repeat(BAR_CELLS - lit)
}

async function sizeOf($: EngineInterface): Promise<TorchSize> {
  const stored = await $.store.get(SIZE_KEY)
  return SIZES.find(s => s === stored) ?? DEFAULT_SIZE
}

function realView(now: number): TorchView | null {
  if (real === null) return null
  const percentLeft = leftOf(real.percentUsed)
  return viewFor(lookFor(real.percentUsed, thresholds), now, percentLeft, real.resetsAt, real.kind, real.windows)
}

// Before the first measurement the torchbearer waits; after one with no windows (no subscription) it hides.
function shownView(now: number): TorchView | null {
  return realView(now) ?? (measured ? null : { ...viewFor('awake', now, 100, null), isPending: true })
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

async function relight($: EngineInterface, now: number) {
  wakeStep = 0
  const isDemo = (await read($, demo)) !== null
  await update($, view, () => (isDemo ? viewFor('awake', now, 100, null) : shownView(now)))
  $.ui.toast(text.WAKE_TOAST)
}

// Draws the real reading unless a demo holds the band; leaving sleep plays the wake-up.
async function showReal($: EngineInterface) {
  if ((await read($, demo)) !== null) return
  const now = await $.clock.now()
  const next = shownView(now)
  const cur = await read($, view)
  if (next?.look === 'sleep' && next.resetsAt !== null) {
    const left = formatCountdown(next.resetsAt - now)
    await update($, countdown, () => left)
  }
  if (next === null || cur === null || cur.isWaking) {
    if (cur?.isWaking !== true) await update($, view, () => next)
    return
  }
  if (cur.look === 'sleep' && next.look !== 'sleep') {
    if (reduceMotion) return relight($, now)
    wakeStep = 0
    await update($, view, () => ({ ...cur, isWaking: true }))
    return
  }
  await update($, view, () =>
    next.look === cur.look
      ? {
          ...cur,
          percentLeft: next.percentLeft,
          resetsAt: next.resetsAt,
          kind: next.kind,
          windows: next.windows,
          isPending: next.isPending,
        }
      : next,
  )
}

// One animation step, then the next one scheduled at the pace the state asks for.
async function step($: EngineInterface) {
  const v = await read($, view)
  const now = await $.clock.now()
  let delay = isWorking ? 500 : 1000

  if (v !== null) {
    tick += 1
    if (v.isWaking) {
      delay = WAKE_STEP_MS
      wakeStep += 1
      if (wakeStep >= WAKE_LEAD + WAKE_STEPS) await relight($, now)
    } else {
      const line = nextLine(v.look, { look: v.look, index: v.lineIndex, at: v.lineAt }, now)
      if (line.index !== v.lineIndex || line.at !== v.lineAt) {
        await update($, view, cur => (cur === null ? cur : { ...cur, lineIndex: line.index, lineAt: line.at }))
      }
    }

    // No turn runs while the limit is hit, so the window's reset is noticed here.
    if (v.look === 'sleep' && !v.isWaking && v.resetsAt !== null && now >= v.resetsAt && real !== null) {
      if ((await read($, demo)) === null) {
        const kind = real.kind
        const windows = real.windows.map(w => (w.kind === kind ? { ...w, percentLeft: 100 } : w))
        real = { percentUsed: 0, resetsAt: null, kind, windows }
        await showReal($)
      }
    }

    if (v.look === 'sleep' && v.resetsAt !== null) {
      const left = formatCountdown(v.resetsAt - now)
      if (left !== (await read($, countdown))) await update($, countdown, () => left)
    }

    const isMoving = v.isWaking || !reduceMotion
    if (bandId !== undefined && isMoving && drawnSize !== 'compact') {
      const cells = packCells(sceneCells(poseOf(v)))
      $.ui.blit({ requestId: bandId, key: RASTER, cells }).catch(() => undefined)
    }
  }

  timer = $.clock.after(delay, () => void step($))
}

export const register: Register = (on, options) => {
  reduceMotion = options.reduceMotion === true
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
    const settings = await $.settings.read()
    reduceMotion = reduceMotion || settings.prefersReducedMotion === true
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

    const named = SIZES.find(s => s === sub)
    if (named !== undefined) {
      await $.store.set(SIZE_KEY, named)
      return { text: text.SIZE_SET(named) }
    }

    // A bare /torch switches between the sizes.
    if (sub === undefined || sub === '') {
      const size = SIZES[(SIZES.indexOf(await sizeOf($)) + 1) % SIZES.length]!
      await $.store.set(SIZE_KEY, size)
      return { text: text.SIZE_SET(size) }
    }

    if (sub === 'status') {
      const v = await read($, view)
      if (v === null || v.isPending === true) return { text: text.NO_READING }
      return { text: `Usage Torch: ${text.usageLine(v.percentLeft, v.kind, clockOf(v.resetsAt), v.windows)}` }
    }

    const chosen = DEMOS.find(d => d === arg)
    if (sub === 'demo' && chosen !== undefined) {
      const now = await $.clock.now()
      const look: TorchLook = chosen === 'wake' ? 'sleep' : chosen
      const resetsAt = look === 'sleep' ? now + DEMO_RESET_MS : null
      await update($, demo, () => chosen)
      await update($, countdown, () => (resetsAt === null ? '' : formatCountdown(resetsAt - now)))
      if (chosen === 'wake' && reduceMotion) {
        await relight($, now)
      } else {
        wakeStep = 0
        await update($, view, () => ({ ...viewFor(look, now, DEMO_PERCENT_LEFT[look], resetsAt), isWaking: chosen === 'wake' }))
      }
      return { text: text.DEMO_ON(chosen) }
    }

    return { text: text.USAGE }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const v = await read($, view)
    if (v === null) return next(e)

    bandId = e.requestId
    isWorking = e.props.isWorking

    const clock = clockOf(v.resetsAt)
    const usage = v.isPending === true ? text.WAITING : text.usageLine(v.percentLeft, v.kind, clock, v.windows)

    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      const head = v.isPending === true ? 'Usage Torch' : text.oneLine(v.percentLeft)
      return <Text dimColor>{`${head} · ${usage}`}</Text>
    }

    const { Box, Raster, Text } = $.ui.resolve(e)
    const isResting = v.look === 'sleep' && !v.isWaking && v.resetsAt !== null
    const left = isResting ? await read($, countdown) : ''
    const size = await sizeOf($)
    drawnSize = size

    if (size === 'compact') {
      const isOut = v.look === 'sleep' && !v.isWaking
      return (
        <Box flexDirection="row" gap={1}>
          <Text color={BAR_COLORS[v.look]} bold>
            {text.COMPACT_LABEL}
          </Text>
          {v.isPending !== true && <Text color={BAR_COLORS[v.look]}>{barOf(v.percentLeft)}</Text>}
          <Text wrap="truncate-end" dimColor>
            {isOut
              ? [text.OUT_OF_LIGHT, isResting ? `${left} · ${text.relightsAt(clock)}` : ''].filter(Boolean).join(' · ')
              : usage}
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row">
        <Box flexDirection="column" width={SCENE_COLUMNS} flexShrink={0}>
          <Raster key={RASTER} columns={SCENE_COLUMNS} rows={SCENE_ROWS} cells={packCells(sceneCells(poseOf(v)))} />
          {isResting && (
            <Box flexDirection="row" gap={1}>
              <Text bold>{left}</Text>
              <Text dimColor>{text.relightsAt(clock)}</Text>
            </Box>
          )}
        </Box>
        {!v.isWaking && (
          <Box flexDirection="column" marginTop={3} marginLeft={1} flexShrink={1}>
            <Box borderStyle="round" borderDimColor paddingX={1}>
              <Text wrap="truncate-end" dimColor={v.look === 'sleep'}>
                {lineText({ look: v.look, index: v.lineIndex, at: v.lineAt })}
              </Text>
            </Box>
            {!isResting && (
              <Box paddingX={1}>
                <Text wrap="truncate-end" dimColor>
                  {usage}
                </Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
