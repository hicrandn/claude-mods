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

export const COMMAND_DESCRIPTION = 'Show or hide the Usage Torch band, or simulate a state'
export const COMMAND_HINT = '[compact|status|demo awake|tired|sleep|wake|off]'
export const DEMO_ON = (look: string): string => `Usage Torch demo: ${look}. Real usage is ignored until /torch demo off.`
export const DEMO_OFF = 'Usage Torch demo off.'
export const USAGE =
  'Usage: /torch, /torch compact, /torch status, /torch demo awake|tired|sleep|wake, /torch demo off'
