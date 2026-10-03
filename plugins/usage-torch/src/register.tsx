import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { TorchDemo, TorchLook, TorchView } from '../types'
import { packCells, poseFor, SCENE_COLUMNS, SCENE_ROWS, sceneCells, WAKE_STEPS, wakePose } from './frames.ts'
import { formatClock, formatCountdown, lineText, nextLine } from './logic.ts'
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

async function relight($: EngineInterface, now: number) {
  wakeStep = 0
  await update($, view, () => viewFor('awake', now, 100, null))
  $.ui.toast(text.WAKE_TOAST)
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

    return next(e)
  })

  on('command.run', { command: 'torch' }, async ($, e) => {
    const [sub, arg] = e.args.trim().split(/\s+/)

    if (sub === 'demo' && arg === 'off') {
      await update($, demo, () => null)
      await update($, view, () => null)
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
