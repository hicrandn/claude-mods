// Composes sprite frames and packs them into half-block cells. Pure: no engine calls,
// so the preview tool and the tests import it directly.

import {
  BODY,
  EYE_ROWS,
  FLAME_ORIGIN,
  FLAMES,
  PALETTE,
  SLEEP_EYES,
  SPRITE_SIZE,
  SWEAT,
  TIRED_EYES,
} from './sprite.ts'

export type Look = 'awake' | 'tired' | 'sleep'

export const TRANSPARENT = -1
export const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

const swap = (row: string, map: Readonly<Record<string, string>>): string =>
  [...row].map(c => map[c] ?? c).join('')

/** The pixel rows of one frame: the body in its state's variant with flame frame `tick % 2` on top. */
export function composeFrame(look: Look, tick: number): string[] {
  const rows = BODY.map(row => row)

  if (look !== 'awake') {
    const eyes = look === 'tired' ? TIRED_EYES : SLEEP_EYES
    for (const r of EYE_ROWS) rows[r] = swap(rows[r]!, eyes)
  }

  if (look === 'tired') {
    for (const [r, c] of SWEAT) rows[r] = put(rows[r]!, c, 'S')
  }

  const flame = FLAMES[look][tick % 2]!
  flame.forEach((line, i) => {
    const r = FLAME_ORIGIN.row + i
    ;[...line].forEach((c, j) => {
      if (c !== '.') rows[r] = put(rows[r]!, FLAME_ORIGIN.column + j, c)
    })
  })

  return rows
}

const put = (row: string, column: number, c: string): string =>
  row.slice(0, column) + c + row.slice(column + 1)

export const hexToRgb = (hex: string): number => parseInt(hex.slice(1), 16)

/** One pixel's color as 0x00RRGGBB, or TRANSPARENT. */
export function colorAt(rows: readonly string[], row: number, column: number): number {
  const c = rows[row]?.[column]
  if (c === undefined || c === '.') return TRANSPARENT
  const hex = PALETTE[c]
  if (hex === undefined) throw new Error(`no palette entry for "${c}"`)
  return hexToRgb(hex)
}

/** A half-block cell for the two pixels it covers. */
export function cell(top: number, bottom: number): [number, number, number] {
  if (top === TRANSPARENT && bottom === TRANSPARENT) return [SPACE, DEFAULT_COLOR, DEFAULT_COLOR]
  if (bottom === TRANSPARENT) return [UPPER_HALF, top, DEFAULT_COLOR]
  if (top === TRANSPARENT) return [LOWER_HALF, bottom, DEFAULT_COLOR]
  return [UPPER_HALF, top, bottom]
}

/**
 * Cells for pixel rows, row-major `[codePoint, fg, bg]` triplets, `SPRITE_SIZE` columns
 * by `rows.length / 2` rows. `lift` shifts the picture up that many pixels (the bounce).
 */
export function toCells(rows: readonly string[], height = rows.length, lift = 0): Uint32Array {
  const cellRows = Math.ceil(height / 2)
  const out = new Uint32Array(SPRITE_SIZE * cellRows * 3)
  const offset = height - rows.length - lift
  let i = 0
  for (let r = 0; r < cellRows; r++) {
    for (let c = 0; c < SPRITE_SIZE; c++) {
      const [cp, fg, bg] = cell(
        colorAt(rows, r * 2 - offset, c),
        colorAt(rows, r * 2 + 1 - offset, c),
      )
      out[i++] = cp
      out[i++] = fg
      out[i++] = bg
    }
  }
  return out
}
