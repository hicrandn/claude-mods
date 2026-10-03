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

/** What one frame shows: whose eyes, which flame and its frame, the sweat, the bounce, the z's. */
export type Pose = {
  eyes: Look
  flame: Look
  flameFrame: number
  sweat: boolean
  lift: number
  zz: number | null
}

/** The pixel rows of one pose: the body with its eyes and sweat, the flame frame on top. */
export function composeRows(pose: Pose): string[] {
  const rows = BODY.map(row => row)

  if (pose.eyes !== 'awake') {
    const eyes = pose.eyes === 'tired' ? TIRED_EYES : SLEEP_EYES
    for (const r of EYE_ROWS) rows[r] = swap(rows[r]!, eyes)
  }

  if (pose.sweat) {
    for (const [r, c] of SWEAT) rows[r] = put(rows[r]!, c, 'S')
  }

  const flame = FLAMES[pose.flame][pose.flameFrame % 2]!
  flame.forEach((line, i) => {
    const r = FLAME_ORIGIN.row + i
    ;[...line].forEach((c, j) => {
      if (c !== '.') rows[r] = put(rows[r]!, FLAME_ORIGIN.column + j, c)
    })
  })

  return rows
}

/** A state's pose at animation tick `tick`; tick 0 is the still frame reduce motion keeps. */
export function poseFor(look: Look, tick: number): Pose {
  switch (look) {
    case 'awake':
      return { eyes: look, flame: look, flameFrame: tick % 2, sweat: false, lift: tick % 2, zz: null }
    case 'tired':
      return { eyes: look, flame: look, flameFrame: tick % 2, sweat: true, lift: Math.floor(tick / 2) % 2, zz: null }
    case 'sleep':
      return { eyes: look, flame: look, flameFrame: tick % 2, sweat: false, lift: 0, zz: tick % 4 }
  }
}

export const WAKE_STEPS = 6

/** The wake-up: eyes open through tired to awake while the flame catches, then a hop. */
export function wakePose(step: number): Pose {
  if (step < 2) return { eyes: 'sleep', flame: 'tired', flameFrame: step, sweat: false, lift: 0, zz: null }
  if (step < 3) return { eyes: 'tired', flame: 'tired', flameFrame: step, sweat: false, lift: 0, zz: null }
  return { eyes: 'awake', flame: 'awake', flameFrame: step, sweat: false, lift: (step + 1) % 2, zz: null }
}

/** The still frames the preview tool prints. */
export const composeFrame = (look: Look, tick: number): string[] => composeRows(poseFor(look, tick % 2))

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

// The scene: the sprite, then four columns where the z's rise. One pixel of headroom for the hop.
export const SCENE_COLUMNS = SPRITE_SIZE + 4
const SCENE_PIXEL_ROWS = SPRITE_SIZE + 1
export const SCENE_ROWS = Math.ceil(SCENE_PIXEL_ROWS / 2)

/** The z's at phase 0-3: a small z and a big Z drifting up beside the torch. [row, column, char]. */
export function zzGlyphs(phase: number): [number, number, string][] {
  return [
    [7 - phase, SPRITE_SIZE + (phase % 2), 'z'],
    [4 - phase, SPRITE_SIZE + 2 + ((phase + 1) % 2), 'Z'],
  ]
}

const ZZ_COLOR: Readonly<Record<string, number>> = {
  z: hexToRgb(PALETTE.z!),
  Z: hexToRgb(PALETTE.g!),
}

// The small torchbearer is the same sprite at half size, derived here, never drawn apart.
// Each 2x2 block becomes one pixel. The body's blocks start one column left so each eye
// stays its own pixel; the torch is its own layer whose blocks start at column 18 so the
// handle is one pixel under a centred flame.
const SMALL_SIZE = SPRITE_SIZE / 2
const TORCH_COLUMN = FLAME_ORIGIN.column
const TORCH_PIXELS = 'kKwXOYyg'
// Pixels that win their block whenever present, so faces and flames survive the halving.
const FEATURE_PIXELS = 'EeGzSyYOXg'

function halveBlock(px: readonly string[], minSolid: number): string {
  const solid = px.filter(p => p !== '.')
  if (solid.length < minSolid) return '.'
  const feature = [...FEATURE_PIXELS].find(f => px.includes(f))
  if (feature !== undefined) return feature
  const counts = new Map<string, number>()
  for (const p of solid) counts.set(p, (counts.get(p) ?? 0) + 1)
  return [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
}

/** A pose's pixel rows at half size: SPRITE_SIZE / 2 square. */
export function halveRows(rows: readonly string[]): string[] {
  const at = (y: number, x: number) => rows[y]?.[x] ?? '.'
  const blockAt = (r: number, c: number, keep: (p: string, x: number) => boolean) =>
    [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]].map(([y, x]) => (keep(at(y!, x!), x!) ? at(y!, x!) : '.'))
  const out: string[] = []
  for (let r = 0; r < rows.length; r += 2) {
    const body: string[] = []
    for (let c = -1; c < TORCH_COLUMN; c += 2) body.push(halveBlock(blockAt(r, c, (_, x) => x < TORCH_COLUMN), 2))
    const torch: string[] = []
    for (let c = TORCH_COLUMN - 1; c < SPRITE_SIZE; c += 2) {
      torch.push(halveBlock(blockAt(r, c, (p, x) => x >= TORCH_COLUMN && TORCH_PIXELS.includes(p)), 1))
    }
    // The torch's first column shares the body's last: it shows there only where it has a pixel.
    if (torch[0] !== '.') body[body.length - 1] = torch[0]!
    out.push([...body, ...torch.slice(1)].join(''))
  }
  return out
}

export type SceneSize = 'small' | 'full'

// The small scene: the half-size sprite, two columns for one z, the same pixel of headroom.
export const SMALL_SCENE_COLUMNS = SMALL_SIZE + 2
export const SMALL_SCENE_ROWS = Math.ceil((SMALL_SIZE + 1) / 2)

export const sceneColumns = (size: SceneSize): number => (size === 'small' ? SMALL_SCENE_COLUMNS : SCENE_COLUMNS)
export const sceneRows = (size: SceneSize): number => (size === 'small' ? SMALL_SCENE_ROWS : SCENE_ROWS)

/** The small scene's z at phase 0-3: one z growing into a Z as it rises beside the flame. */
export function smallZzGlyphs(phase: number): [number, number, string][] {
  return [[3 - phase, SMALL_SIZE + (phase % 2), phase < 2 ? 'z' : 'Z']]
}

/** Cells for a pose, row-major `[codePoint, fg, bg]`, sceneColumns(size) by sceneRows(size). */
export function sceneCells(pose: Pose, size: SceneSize = 'full'): Uint32Array {
  const full = composeRows(pose)
  const rows = size === 'small' ? halveRows(full) : full
  const columns = sceneColumns(size)
  const height = sceneRows(size)
  const offset = 1 - pose.lift
  const glyphs = pose.zz === null ? [] : size === 'small' ? smallZzGlyphs(pose.zz) : zzGlyphs(pose.zz)
  const out = new Uint32Array(columns * height * 3)
  let i = 0
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < columns; c++) {
      const glyph = glyphs.find(([gr, gc]) => gr === r && gc === c)
      const [cp, fg, bg] = glyph
        ? [glyph[2].codePointAt(0)!, ZZ_COLOR[glyph[2]]!, DEFAULT_COLOR]
        : cell(colorAt(rows, r * 2 - offset, c), colorAt(rows, r * 2 + 1 - offset, c))
      out[i++] = cp
      out[i++] = fg
      out[i++] = bg
    }
  }
  return out
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Cells as Raster wants them: little-endian u32s, standard padded base64. */
export function packCells(words: Uint32Array): string {
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((w, i) => view.setUint32(i * 4, w, true))
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += B64[a >> 2]
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : B64[c & 63]
  }
  return out
}
