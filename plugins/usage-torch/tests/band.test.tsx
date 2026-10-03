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
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'torch' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui.unmount()
})

test('demo awake draws the torchbearer and a line', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  const out = await $.command.run({ command: 'torch', args: 'demo awake' })
  expect(out.text).toContain('demo: awake')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const raster = await ui.find({ type: 'Raster', key: 'torch' })
  expect(raster?.props.columns).toBe(28)
  expect(raster?.props.rows).toBe(13)
  expect(await ui.find({ type: 'Text', text: "Let's go!" })).toBeDefined()
  await ui.unmount()
})

test('demo sleep shows the countdown and when the torch relights', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await $.command.run({ command: 'torch', args: 'demo sleep' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '12:30' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Relights at \d\d:\d\d$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Out of light. Resting for a bit.' })).toBeDefined()
  await ui.unmount()
})

test('desktop gets one line of text', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await $.command.run({ command: 'torch', args: 'demo tired' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Usage Torch 18%' })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('demo off clears the band', async ($, on) => {
  engineBand(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await $.command.run({ command: 'torch', args: 'demo awake' })
  await $.command.run({ command: 'torch', args: 'demo off' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'torch' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui.unmount()
})

test('demo wake plays the wake-up and ends awake', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: {} }) as never)
  const blits: string[] = []
  on('ui.blit', ($, e) => (blits.push(e.requestId), { value: {} }) as never)
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }) as never)
  await $.session.start({ cwd: '/' } as never)
  await $.command.run({ command: 'torch', args: 'demo wake' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: "Let's go!" })).toBeUndefined()
  await clock.advance(10_000)
  expect(await ui.find({ type: 'Text', text: "Let's go!" })).toBeDefined()
  expect(blits.length).toBeGreaterThan(5)
  expect(toasts).toEqual(['Torch relit'])
  expect(blits.length).toBeGreaterThan(5)
  expect(toasts).toEqual(['Torch relit'])
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
  await $.session.start({ cwd: '/' } as never)
}

test('real usage draws the torchbearer without a demo', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 12 }])
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Usage Torch 88%' })).toBeDefined()
  await ui.unmount()
})

test('the most used window decides, and the threshold makes it tired', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [
    { kind: 'five_hour', percentUsed: 10 },
    { kind: 'seven_day', percentUsed: 75 },
  ])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /flame is low|Running low/ })).toBeDefined()
  await ui.unmount()
})

test('a full window puts it to sleep until the reset', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 100, resetsAt: '2026-10-03T13:00:00Z' }])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Out of light. Resting for a bit.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1:00' })).toBeDefined()
  await ui.unmount()
})

test('demo off goes back to the real reading', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 3, 12, 0) })
  await startWith($, on, [{ kind: 'five_hour', percentUsed: 40 }])
  await $.command.run({ command: 'torch', args: 'demo tired' })
  await $.command.run({ command: 'torch', args: 'demo off' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Usage Torch 60%' })).toBeDefined()
  await ui.unmount()
})
