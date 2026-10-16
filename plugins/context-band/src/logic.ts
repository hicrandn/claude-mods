// Pure rules: fill to level, token counts to short text.

export type Level = 'calm' | 'warm' | 'hot'

/** A level starts at whichever comes first: its share of the limit, or its token count (0 turns that off). */
export type Thresholds = {
  warnAtPercent: number
  compactAtPercent: number
  warnAtTokens: number
  compactAtTokens: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  warnAtPercent: 50,
  compactAtPercent: 75,
  warnAtTokens: 100_000,
  compactAtTokens: 150_000,
}

const reached = (tokens: number, at: number): boolean => at > 0 && tokens >= at

/** The level for a fill: hot from either compact threshold, warm from either warn one. */
export function levelFor(percent: number, tokens = 0, t: Thresholds = DEFAULT_THRESHOLDS): Level {
  if (percent >= t.compactAtPercent || reached(tokens, t.compactAtTokens)) return 'hot'
  if (percent >= t.warnAtPercent || reached(tokens, t.warnAtTokens)) return 'warm'
  return 'calm'
}

/** The fill as a whole percent, 0 to 100. */
export function percentOf(tokens: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((tokens / limit) * 100)))
}

/** What the fill counts against: the point auto-compaction runs at, else the whole window. */
export function limitOf(window: number, autoCompactAt: number | null): number {
  return autoCompactAt !== null && autoCompactAt > 0 && autoCompactAt < window ? autoCompactAt : window
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
