// Every string the mod shows. English only; no em dashes (a test holds this).

import { formatTokens } from './logic.ts'

export const LABEL = 'Context'

/** The figures in one line: the fill and the tokens against the limit. */
export const fillLine = (percent: number, tokens: number, limit: number): string =>
  `${percent}% · ${formatTokens(tokens)}/${formatTokens(limit)}`

/** The figures in full, for /ctx: what the limit is and the whole window beside it. */
export const statusLine = (percent: number, tokens: number, limit: number, window: number, isAutoCompact: boolean): string =>
  isAutoCompact
    ? `${percent}% · ${formatTokens(tokens)} of ${formatTokens(limit)} before auto-compact (window ${formatTokens(window)})`
    : `${percent}% · ${formatTokens(tokens)} of ${formatTokens(limit)} window`

export const HOT_HINT = 'time to /compact'
export const WAITING = 'fills after the first reply'
export const oneLine = (percent: number): string => `Context ${percent}%`

export const HOT_TOAST = (tokens: number): string =>
  `Context at ${formatTokens(tokens)}: /compact to summarize or /clear to start fresh`

export const COMMAND_DESCRIPTION = 'Show Context Band figures, or simulate a level'
export const COMMAND_HINT = '[status|demo calm|warm|hot|off]'
export const DEMO_ON = (level: string): string => `Context Band demo: ${level}. Real figures are ignored until /ctx demo off.`
export const DEMO_OFF = 'Context Band demo off.'
export const USAGE = 'Usage: /ctx status, /ctx demo calm|warm|hot, /ctx demo off'
export const NO_READING = 'Context Band has no reading yet. It arrives with the first reply.'
