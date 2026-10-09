import { usageLine } from '../src/text.ts'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-torch',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

// Stands for the engine beneath the plugin: what the band shows when the mod passes.
const engineBand = (on: Parameters<Parameters<typeof test>[1]>[1]) =>
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

test('the band stays out of the way until something is shown', async ($, on) => {
  engineBand(on)
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Torch' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui.unmount()
})

test('demo sleep shows the countdown and when the torch relights', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await $.command.run({ command: 'torch', args: 'demo sleep' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^out of light · 12:30 · Relights at \d\d:\d\d$/ })).toBeDefined()
  await ui.unmount()
})

test('desktop gets one line of text', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await $.command.run({ command: 'torch', args: 'demo tired' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Usage Torch 18% · 18% left/ })).toBeDefined()
  await ui.unmount()
})

test('demo off before any reading goes back to the waiting line', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await $.command.run({ command: 'torch', args: 'demo awake' })
  await $.command.run({ command: 'torch', args: 'demo off' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Usage shows after the first reply' })).toBeDefined()
  await ui.unmount()
})

// Stands for the engine's session: one reading of the rate-limit windows.
const startWith = async (
  $: Parameters<Parameters<typeof test>[1]>[0],
  on: Parameters<Parameters<typeof test>[1]>[1],
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[],
) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: {} }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits } }) as never)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/' } as never)
}

test('real usage shows without a demo', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 12 }])
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Usage Torch 88% · 88% left · 5-hour limit$/ })).toBeDefined()
  await ui.unmount()
})

test('the most used window decides, and the threshold makes it tired', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [
    { kind: 'five_hour', percentUsed: 10 },
    { kind: 'seven_day', percentUsed: 75 },
  ])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Torch', props: { color: '#D85A30' } })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▰▰▰▱▱▱▱▱▱▱' })).toBeDefined()
  await ui.unmount()
})

test('both windows show side by side, 5-hour first', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [
    { kind: 'seven_day', percentUsed: 42 },
    { kind: 'five_hour', percentUsed: 28 },
  ])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '5h 72% · week 58%' })).toBeDefined()
  expect((await $.command.run({ command: 'torch', args: 'status' })).text).toBe('Usage Torch: 5h 72% · week 58%')
  await ui.unmount()
})

test('the band shows both windows next to the bar of the one that binds', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [
    { kind: 'five_hour', percentUsed: 10 },
    { kind: 'seven_day', percentUsed: 60, resetsAt: '2026-10-06T09:00:00Z' },
  ])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '▰▰▰▰▱▱▱▱▱▱' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^5h 90% · week 40% · resets \d\d:\d\d$/ })).toBeDefined()
  await ui.unmount()
})

test('a full window puts it to sleep until the reset', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 100, resetsAt: '2026-10-03T13:00:00Z' }])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Torch', props: { color: '#888780' } })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^out of light · 1:00 · / })).toBeDefined()
  await ui.unmount()
})

test('demo off goes back to the real reading', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 40 }])
  await $.command.run({ command: 'torch', args: 'demo tired' })
  await $.command.run({ command: 'torch', args: 'demo off' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Usage Torch 60%/ })).toBeDefined()
  await ui.unmount()
})

test('the band is one line with the bar, what is left and when it resets', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 38, resetsAt: '2026-10-03T15:30:00Z' }])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '▰▰▰▰▰▰▱▱▱▱' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^62% left · 5-hour limit · resets \d\d:\d\d$/ })).toBeDefined()
  await ui.unmount()
})

test('asleep, the band shows the countdown to the relight', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 100, resetsAt: '2026-10-03T13:00:00Z' }])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^out of light · 1:00 · Relights at \d\d:\d\d$/ })).toBeDefined()
  await ui.unmount()
})

test('the usage line leaves out a kind an older view does not have', () => {
  expect(usageLine(70, undefined, '')).toBe('70% left')
  expect(usageLine(70, 'seven_day', '15:30')).toBe('70% left · weekly limit · resets 15:30')
  expect(usageLine(70, 'seven_day', '', null)).toBe('70% left · weekly limit')
})

test('right after install the band shows, waiting for the first reply', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Torch' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Usage shows after the first reply' })).toBeDefined()
  expect((await $.command.run({ command: 'torch', args: 'status' })).text).toContain('no usage reading yet')
  await ui.unmount()
})

test('the first reading replaces the waiting line', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [])
  await $.session.measure({ context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 38 }], changed: ['rateLimits'] } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '62% left · 5-hour limit' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Usage shows after the first reply' })).toBeUndefined()
  await ui.unmount()
})

test('a reply with no windows (no subscription) hides the band', async ($, on) => {
  engineBand(on)
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [])
  await $.session.measure({ context: {}, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Torch' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui.unmount()
})

test('while waiting the band shows no bar', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /▰|▱/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Usage shows after the first reply' })).toBeDefined()
  await ui.unmount()
})

test('the band never draws a picture', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 12 }])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('/torch reports the figures', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 25 }])
  expect((await $.command.run({ command: 'torch', args: '' })).text).toBe('Usage Torch: 75% left · 5-hour limit')
  expect((await $.command.run({ command: 'torch', args: 'status' })).text).toBe('Usage Torch: 75% left · 5-hour limit')
})

test('leaving sleep says the torch relit', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }) as never)
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 100, resetsAt: '2026-10-03T13:00:00Z' }])
  await $.session.measure({ context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 5 }], changed: ['rateLimits'] } as never)
  expect(toasts).toEqual(['Torch relit'])
})
