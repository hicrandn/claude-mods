import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { ContextDemo, ContextLevel, ContextView } from '../types'
import { DEFAULT_THRESHOLDS, levelFor, percentOf } from './logic.ts'
import type { Thresholds } from './logic.ts'
import * as text from './text.ts'

const demo = atom({ plugin: 'context-band', key: 'demo' } as const, null)
const view = atom({ plugin: 'context-band', key: 'view' } as const, null)

const BAR_CELLS = 10
// Calm teal, warming amber, red once it is time to compact.
const BAR_COLORS: Record<ContextLevel, string> = { calm: '#5DCAA5', warm: '#EF9F27', hot: '#D85A30' }
const DEMOS: readonly ContextDemo[] = ['calm', 'warm', 'hot']
const DEMO_PERCENT: Record<ContextLevel, number> = { calm: 24, warm: 58, hot: 86 }
const DEMO_WINDOW = 200_000
// From this width the band sits beside the one beneath it; narrower, it goes on a line of its own.
const SIDE_BY_SIDE_COLUMNS = 110

// Module state: a reload starts it over, the host keeps what the drawing reads in $.state.
let thresholds: Thresholds = DEFAULT_THRESHOLDS
// The last real reading; null before the live window's first reply.
let real: { tokens: number; window: number } | null = null
// Whether the last reading was hot: crossing into hot raises the toast once.
let wasHot = false

function readingOf(context: SessionContextUsage) {
  if (context.tokens === undefined) return null
  return { tokens: context.tokens, window: context.window }
}

function shownView(window: number): ContextView {
  if (real === null) return { level: 'calm', percent: 0, tokens: 0, window, isPending: true }
  const percent = percentOf(real.tokens, real.window)
  return { level: levelFor(percent, thresholds), percent, tokens: real.tokens, window: real.window }
}

// Draws the real reading unless a demo holds the band; crossing into hot says what to do.
async function showReal($: EngineInterface, context: SessionContextUsage, mayToast: boolean) {
  real = readingOf(context)
  const next = shownView(context.window)
  const isHot = next.isPending !== true && next.level === 'hot'
  if (mayToast && isHot && !wasHot) $.ui.toast(text.HOT_TOAST(next.percent))
  wasHot = isHot
  if ((await read($, demo)) !== null) return
  await update($, view, () => next)
}

const barOf = (percent: number): string => {
  const lit = Math.round((Math.min(100, Math.max(0, percent)) / 100) * BAR_CELLS)
  return '▰'.repeat(lit) + '▱'.repeat(BAR_CELLS - lit)
}

export const register: Register = (on, options) => {
  const { warnAtPercent, compactAtPercent } = options
  thresholds = {
    warnAtPercent: typeof warnAtPercent === 'number' ? warnAtPercent : DEFAULT_THRESHOLDS.warnAtPercent,
    compactAtPercent: typeof compactAtPercent === 'number' ? compactAtPercent : DEFAULT_THRESHOLDS.compactAtPercent,
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ctx',
      description: text.COMMAND_DESCRIPTION,
      argumentHint: text.COMMAND_HINT,
    })
    const result = await next(e)
    // No toast on a start or reload: only a reply that crosses the line raises it.
    await showReal($, (await $.session.usage()).context, false)
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await showReal($, e.context, true)
    return next(e)
  })

  on('command.run', { command: 'ctx' }, async ($, e) => {
    const [sub, arg] = e.args.trim().split(/\s+/)

    if (sub === 'demo' && arg === 'off') {
      await update($, demo, () => null)
      await update($, view, () => shownView(real?.window ?? DEMO_WINDOW))
      return { text: text.DEMO_OFF }
    }

    // A bare /ctx reports the figures, like /ctx status.
    if (sub === undefined || sub === '' || sub === 'status') {
      const v = await read($, view)
      if (v === null || v.isPending === true) return { text: text.NO_READING }
      return { text: `Context Band: ${text.fillLine(v.percent, v.tokens, v.window)}` }
    }

    const chosen = DEMOS.find(d => d === arg)
    if (sub === 'demo' && chosen !== undefined) {
      const percent = DEMO_PERCENT[chosen]
      const tokens = Math.round((percent / 100) * DEMO_WINDOW)
      await update($, demo, () => chosen)
      await update($, view, () => ({ level: chosen, percent, tokens, window: DEMO_WINDOW }))
      return { text: text.DEMO_ON(chosen) }
    }

    return { text: text.USAGE }
  })

  // The band draws its line and keeps what the plugins beneath draw beside it, so it shares the
  // spot above the prompt (with usage-torch, say) instead of taking it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const v = await read($, view)
    if (v === null) return next(e)
    const below = await next(e)

    const fill = v.isPending === true ? text.WAITING : text.fillLine(v.percent, v.tokens, v.window)

    if (e.surface !== 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const head = v.isPending === true ? text.LABEL : text.oneLine(v.percent)
      return (
        <Box flexDirection="column">
          <Text dimColor>{`${head} · ${fill}`}</Text>
          {below}
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)
    const isWide = e.props.bodyColumns >= SIDE_BY_SIDE_COLUMNS
    const color = BAR_COLORS[v.level]
    const line = (
      <Box flexDirection="row" gap={1} flexShrink={0}>
        <Text color={color} bold>
          {text.LABEL}
        </Text>
        {v.isPending !== true && <Text color={color}>{barOf(v.percent)}</Text>}
        <Text dimColor>{fill}</Text>
        {v.isPending !== true && v.level === 'hot' && <Text color={color}>{`· ${text.HOT_HINT}`}</Text>}
      </Box>
    )

    return (
      <Box flexDirection={isWide ? 'row' : 'column'} columnGap={3}>
        {line}
        {below}
      </Box>
    )
  })
}
