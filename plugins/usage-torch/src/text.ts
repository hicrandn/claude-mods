// Every string the mod shows. English only; no em dashes (a test holds this).

import type { Look } from './frames.ts'

export const LINES: Readonly<Record<Look, readonly string[]>> = {
  awake: ["Let's go!", 'The path is lit.', 'Plenty of light left.'],
  tired: ['My flame is low. Save the big task for later?', 'Running low. Maybe slow down a bit?'],
  sleep: ['Out of light. Resting for a bit.'],
}

export const relightsAt = (clock: string): string => `Relights at ${clock}`
export const WAKE_TOAST = 'Torch relit'
export const oneLine = (percentLeft: number): string => `Usage Torch ${percentLeft}%`

const WINDOW_NAMES: Readonly<Record<string, string>> = {
  five_hour: '5-hour limit',
  seven_day: 'weekly limit',
  spend_limit: 'spend limit',
}
export const windowName = (kind: string): string => WINDOW_NAMES[kind] ?? kind.replace(/_/g, ' ')

/** The figures in one line: what is left, of which window, and when it refills. */
// `kind` may be missing on a view an older version of the mod left in the session's state.
export function usageLine(percentLeft: number, kind: string | null | undefined, clock: string): string {
  const parts = [`${percentLeft}% left`]
  if (typeof kind === 'string') parts.push(windowName(kind))
  if (clock !== '') parts.push(`resets ${clock}`)
  return parts.join(' · ')
}

export const COMPACT_LABEL = 'Torch'
export const OUT_OF_LIGHT = 'out of light'

export const COMMAND_DESCRIPTION = 'Switch the Usage Torch band between compact and full, show usage, or simulate a state'
export const COMMAND_HINT = '[compact|full|status|demo awake|tired|sleep|wake|off]'
export const DEMO_ON = (look: string): string => `Usage Torch demo: ${look}. Real usage is ignored until /torch demo off.`
export const DEMO_OFF = 'Usage Torch demo off.'
export const USAGE =
  'Usage: /torch, /torch compact, /torch full, /torch status, /torch demo awake|tired|sleep|wake, /torch demo off'
export const SIZE_SET = (size: string): string => `Usage Torch band: ${size}.`
export const WAITING = 'Usage shows after the first reply'
export const NO_READING = 'Usage Torch has no usage reading yet. It arrives with the first reply.'
