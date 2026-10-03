// Pure rules: usage to state, countdown text, speech line rotation.

import type { Look } from './frames.ts'
import { LINES } from './text.ts'

export type Thresholds = { tiredBelowPercent: number; sleepAtPercentUsed: number }

export const DEFAULT_THRESHOLDS: Thresholds = { tiredBelowPercent: 30, sleepAtPercentUsed: 100 }

/** The state for a window's fill: asleep at the limit, tired below the threshold left. */
export function lookFor(percentUsed: number, t: Thresholds = DEFAULT_THRESHOLDS): Look {
  if (percentUsed >= t.sleepAtPercentUsed) return 'sleep'
  if (100 - percentUsed < t.tiredBelowPercent) return 'tired'
  return 'awake'
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Time left as h:mm from an hour up, m:ss below; never 0:00 while time remains. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  if (total >= 3600) return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}`
  return `${Math.floor(total / 60)}:${pad(total % 60)}`
}

/** A wall clock time as HH:MM, given the local offset in minutes east of UTC. */
export function formatClock(epochMs: number, offsetMinutes: number): string {
  const minutes = Math.floor((epochMs + offsetMinutes * 60_000) / 60_000)
  const day = ((minutes % 1440) + 1440) % 1440
  return `${pad(Math.floor(day / 60))}:${pad(day % 60)}`
}

export const LINE_PERIOD_MS = 10 * 60_000

export type Line = { look: Look; index: number; at: number }

/** Keeps the line within a state for ten minutes, then moves to the next; a new state starts at its first. */
export function nextLine(look: Look, prev: Line | null, now: number): Line {
  if (prev === null || prev.look !== look) return { look, index: 0, at: now }
  if (now - prev.at < LINE_PERIOD_MS) return prev
  return { look, index: (prev.index + 1) % LINES[look].length, at: now }
}

export const lineText = (line: Line): string => LINES[line.look][line.index % LINES[line.look].length]!
