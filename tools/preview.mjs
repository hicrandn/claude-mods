#!/usr/bin/env node
// Previews the Usage Torch sprite without Claude Code.
//
//   node tools/preview.mjs awake|tired|sleep [--frame a|b] [--png <file>] [--scale <n>]
//
// Prints both flame frames side by side as truecolor ANSI half blocks. With --png,
// also writes the chosen frame (default a) as an enlarged PNG with a transparent
// background. Needs Node 22.18+ (it imports the mod's TypeScript directly).

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { composeFrame, colorAt, TRANSPARENT } from '../plugins/usage-torch/src/frames.ts'
import { SPRITE_SIZE } from '../plugins/usage-torch/src/sprite.ts'

const LOOKS = ['awake', 'tired', 'sleep']

function parseArgs(argv) {
  const args = { look: undefined, frame: 'a', png: undefined, scale: 16 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--png') args.png = argv[++i]
    else if (a === '--frame') args.frame = argv[++i]
    else if (a === '--scale') args.scale = Number(argv[++i])
    else if (!a.startsWith('--')) args.look = a
  }
  return args
}

const rgb = n => [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]

function ansiRows(rows) {
  const lines = []
  for (let r = 0; r < SPRITE_SIZE; r += 2) {
    let line = ''
    for (let c = 0; c < SPRITE_SIZE; c++) {
      const top = colorAt(rows, r, c)
      const bottom = colorAt(rows, r + 1, c)
      if (top === TRANSPARENT && bottom === TRANSPARENT) {
        line += '\x1b[0m '
      } else if (bottom === TRANSPARENT) {
        line += `\x1b[0m\x1b[38;2;${rgb(top).join(';')}m▀`
      } else if (top === TRANSPARENT) {
        line += `\x1b[0m\x1b[38;2;${rgb(bottom).join(';')}m▄`
      } else {
        line += `\x1b[38;2;${rgb(top).join(';')};48;2;${rgb(bottom).join(';')}m▀`
      }
    }
    lines.push(line + '\x1b[0m')
  }
  return lines
}

// Minimal PNG writer: 8-bit RGBA, one IDAT, filter 0 on every scanline.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(rows, scale) {
  const size = SPRITE_SIZE * scale
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const line = y * (size * 4 + 1)
    raw[line] = 0
    for (let x = 0; x < size; x++) {
      const color = colorAt(rows, Math.floor(y / scale), Math.floor(x / scale))
      const p = line + 1 + x * 4
      if (color === TRANSPARENT) continue
      ;[raw[p], raw[p + 1], raw[p + 2]] = rgb(color)
      raw[p + 3] = 0xff
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const args = parseArgs(process.argv.slice(2))
if (!LOOKS.includes(args.look) || !['a', 'b'].includes(args.frame) || !(args.scale >= 1)) {
  console.error('usage: node tools/preview.mjs awake|tired|sleep [--frame a|b] [--png <file>] [--scale <n>]')
  process.exit(1)
}

const a = ansiRows(composeFrame(args.look, 0))
const b = ansiRows(composeFrame(args.look, 1))
console.log(`${args.look}: frame a${' '.repeat(SPRITE_SIZE - 7)}    frame b`)
a.forEach((line, i) => console.log(`${line}    ${b[i]}`))

if (args.png) {
  const tick = args.frame === 'a' ? 0 : 1
  writeFileSync(args.png, encodePng(composeFrame(args.look, tick), Math.floor(args.scale)))
  console.log(`wrote ${args.png}`)
}
