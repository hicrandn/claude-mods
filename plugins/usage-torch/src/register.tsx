import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { TorchDemo, TorchLook, TorchView } from '../types'
import { packCells, poseFor, SCENE_COLUMNS, SCENE_ROWS, sceneCells, WAKE_STEPS, wakePose } from './frames.ts'
import { DEFAULT_THRESHOLDS, formatClock, formatCountdown, lineText, lookFor, nextLine } from './logic.ts'
import type { Thresholds } from './logic.ts'
import * as text from './text.ts'

const demo = atom({ plugin: 'usage-torch', key: 'demo' } as const, null)
const view = atom({ plugin: 'usage-torch', key: 'view' } as const, null)
const countdown = atom({ plugin: 'usage-torch', key: 'countdown' } as const, '')

const RASTER = 'torch'
const DEMOS: readonly TorchDemo[] = ['awake', 'tired', 'sleep', 'wake']
const DEMO_PERCENT_LEFT: Record<TorchLook, number> = { awake: 82, tired: 18, sleep: 0 }
const DEMO_RESET_MS = 12 * 60_000 + 30_000
// The wake-up holds the sleeping pose this many steps before the eyes open.
const WAKE_LEAD = 4
const WAKE_STEP_MS = 400

// Module state: a reload starts it over, the host keeps what the drawing reads in $.state.
let reduceMotion = false
let thresholds: Thresholds = DEFAULT_THRESHOLDS
// The last real reading: the window closest to its limit.
let real: { percentUsed: number; resetsAt: number | null } | null = null
let bandId: string | undefined
let isWorking = false
let tick = 0
let wakeStep = 0
let timer: Timer | undefined

function poseOf(v: TorchView) {
  if (!v.isWaking) return poseFor(v.look, reduceMotion ? 0 : tick)
  return wakeStep < WAKE_LEAD ? poseFor('sleep', tick) : wakePose(wakeStep - WAKE_LEAD)
}

const viewFor = (look: TorchLook, now: number, percentLeft: number, resetsAt: number | null): TorchView => ({
  look,
  lineIndex: 0,
  lineAt: now,
  percentLeft,
  resetsAt,
  isWaking: false,
})

function realView(now: number): TorchView | null {
  if (real === null) return null
  const percentLeft = Math.max(0, Math.round(100 - real.percentUsed))
  return viewFor(lookFor(real.percentUsed, thresholds), now, percentLeft, real.resetsAt)
}

// The window that binds first: the most used of those the last response reported.
function readingOf(limits: readonly SessionRateLimit[]) {
  if (limits.length === 0) return null
  const w = limits.reduce((a, b) => (b.percentUsed > a.percentUsed ? b : a))
  const resetsAt = w.resetsAt === undefined ? null : Date.parse(w.resetsAt)
  return { percentUsed: w.percentUsed, resetsAt: Number.isNaN(resetsAt) ? null : resetsAt }
}

async function relight($: EngineInterface, now: number) {
  wakeStep = 0
  const isDemo = (await read($, demo)) !== null
  await update($, view, () => (isDemo ? viewFor('awake', now, 100, null) : realView(now)))
  $.ui.toast(text.WAKE_TOAST)
}

// Draws the real reading unless a demo holds the band; leaving sleep plays the wake-up.
async function showReal($: EngineInterface) {
  if ((await read($, demo)) !== null) return
  const now = await $.clock.now()
  const next = realView(now)
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
    next.look === cur.look ? { ...cur, percentLeft: next.percentLeft, resetsAt: next.resetsAt } : next,
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
        real = { percentUsed: 0, resetsAt: null }
        await showReal($)
      }
    }

    if (v.look === 'sleep' && v.resetsAt !== null) {
      const left = formatCountdown(v.resetsAt - now)
      if (left !== (await read($, countdown))) await update($, countdown, () => left)
    }

    const isMoving = v.isWaking || !reduceMotion
    if (bandId !== undefined && isMoving) {
      $.ui.blit({ requestId: bandId, key: RASTER, cells: packCells(sceneCells(poseOf(v))) }).catch(() => undefined)
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

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      real = readingOf(e.rateLimits)
      await showReal($)
    }
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

    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{text.oneLine(v.percentLeft)}</Text>
    }

    const { Box, Raster, Text } = $.ui.resolve(e)
    const isResting = v.look === 'sleep' && !v.isWaking && v.resetsAt !== null
    const left = isResting ? await read($, countdown) : ''
    const clock = v.resetsAt === null ? '' : formatClock(v.resetsAt, -new Date(v.resetsAt).getTimezoneOffset())

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
          <Box marginTop={3} marginLeft={1} flexShrink={1} borderStyle="round" borderDimColor paddingX={1}>
            <Text wrap="truncate-end" dimColor={v.look === 'sleep'}>
              {lineText({ look: v.look, index: v.lineIndex, at: v.lineAt })}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
