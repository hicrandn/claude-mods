import { formatTokens, levelFor } from '../src/logic.ts'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'context-band',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

type T = Parameters<Parameters<typeof test>[1]>

// Stands for what is drawn beneath the plugin: another mod's band, or the engine's.
const bandBeneath = (on: T[1], label = 'Torch 5h 72%') =>
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{label}</Text>
  })

// Stands for the engine's own band when nothing else draws there: empty.
const engineBand = (on: T[1]) =>
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

// Stands for the engine's session: one reading of the context window.
const startWith = async ($: T[0], on: T[1], context: { tokens?: number; window: number; percent?: number }) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: {} }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context, rateLimits: [] } }) as never)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/' } as never)
}

const measure = ($: T[0], tokens: number, window = 200_000) =>
  $.session.measure({ context: { tokens, window }, rateLimits: [], changed: ['context'] } as never)

test('levels and short token counts', () => {
  expect(levelFor(10)).toBe('calm')
  expect(levelFor(50)).toBe('warm')
  expect(levelFor(75)).toBe('hot')
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(124_400)).toBe('124k')
  expect(formatTokens(1_000_000)).toBe('1M')
  expect(formatTokens(1_250_000)).toBe('1.3M')
})

test('the fill shows as a bar with tokens against the window', async ($, on) => {
  engineBand(on)
  mock.store(on)
  await startWith($, on, { tokens: 62_000, window: 200_000 })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Context', props: { color: '#5DCAA5' } })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▰▰▰▱▱▱▱▱▱▱' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '31% · 62k/200k' })).toBeDefined()
  await ui.unmount()
})

test('the band beneath stays drawn beside it', async ($, on) => {
  bandBeneath(on)
  mock.store(on)
  await startWith($, on, { tokens: 62_000, window: 200_000 })
  for (const bodyColumns of [140, 80]) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Torch 5h 72%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '31% · 62k/200k' })).toBeDefined()
    await ui.unmount()
  }
})

test('before the first reply the band waits, with no bar', async ($, on) => {
  engineBand(on)
  mock.store(on)
  await startWith($, on, { window: 200_000 })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'fills after the first reply' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▰|▱/ })).toBeUndefined()
  expect((await $.command.run({ command: 'ctx', args: '' })).text).toContain('no reading yet')
  await ui.unmount()
})

test('a reply updates the band, and crossing into hot suggests /compact once', async ($, on) => {
  engineBand(on)
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }) as never)
  await startWith($, on, { window: 200_000 })
  await measure($, 120_000)
  await measure($, 160_000)
  await measure($, 170_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Context', props: { color: '#D85A30' } })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '85% · 170k/200k' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '· time to /compact' })).toBeDefined()
  expect(toasts).toEqual(['Context 80% full: /compact to summarize or /clear to start fresh'])
  await ui.unmount()
})

test('after a compaction the band cools and can warn again', async ($, on) => {
  engineBand(on)
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }) as never)
  await startWith($, on, { window: 200_000 })
  await measure($, 160_000)
  await measure($, 30_000)
  await measure($, 180_000)
  expect(toasts.length).toBe(2)
  expect((await $.command.run({ command: 'ctx', args: 'status' })).text).toBe('Context Band: 90% · 180k/200k')
})

test('the thresholds come from the options', { options: { warnAtPercent: 20, compactAtPercent: 40 } }, async ($, on) => {
  engineBand(on)
  mock.store(on)
  await startWith($, on, { tokens: 90_000, window: 200_000 })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Context', props: { color: '#D85A30' } })).toBeDefined()
  await ui.unmount()
})

test('demo hot and off', async ($, on) => {
  engineBand(on)
  mock.store(on)
  await startWith($, on, { tokens: 20_000, window: 200_000 })
  await $.command.run({ command: 'ctx', args: 'demo hot' })
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '86% · 172k/200k' })).toBeDefined()
  await ui.unmount()
  await $.command.run({ command: 'ctx', args: 'demo off' })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '10% · 20k/200k' })).toBeDefined()
  await ui.unmount()
})

test('desktop gets one line of text, and keeps the band beneath', async ($, on) => {
  bandBeneath(on)
  mock.store(on)
  await startWith($, on, { tokens: 100_000, window: 200_000 })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Context 50% · 50% · 100k/200k' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Torch 5h 72%' })).toBeDefined()
  await ui.unmount()
})

test('a survey takes the band', async ($, on) => {
  bandBeneath(on, 'survey')
  mock.store(on)
  await startWith($, on, { tokens: 100_000, window: 200_000 })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'survey' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Context' })).toBeUndefined()
  await ui.unmount()
})
