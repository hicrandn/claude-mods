// Pure rules: fill to level, token counts to short text.

export type Level = 'calm' | 'warm' | 'hot'

export type Thresholds = { warnAtPercent: number; compactAtPercent: number }

export const DEFAULT_THRESHOLDS: Thresholds = { warnAtPercent: 50, compactAtPercent: 75 }

/** The level for a window's fill: hot from the compact threshold, warm from the warn one. */
export function levelFor(percent: number, t: Thresholds = DEFAULT_THRESHOLDS): Level {
  if (percent >= t.compactAtPercent) return 'hot'
  if (percent >= t.warnAtPercent) return 'warm'
  return 'calm'
}

/** The fill as a whole percent, 0 to 100. */
export function percentOf(tokens: number, window: number): number {
  if (window <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((tokens / window) * 100)))
}

/** A token count in a few characters: 950, 12k, 124k, 1.2M. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = Math.round(n / 100_000) / 10
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(Math.max(0, Math.round(n)))
}
