// Pixel data and palette for the torchbearer. Data only: composition lives in frames.ts.
// Every string is one pixel row; "." is transparent.

export const SPRITE_SIZE = 24

export const PALETTE: Readonly<Record<string, string>> = {
  o: '#2C2C2A', // outline
  d: '#2C2C2A', // hood interior
  h: '#D3D1C7', // hood
  H: '#F1EFE8', // hood highlight
  s: '#B4B2A9', // hood shadow
  E: '#FAC775', // eye top, bright
  e: '#EF9F27', // eye bottom
  t: '#1D9E75', // scarf
  T: '#5DCAA5', // scarf highlight
  u: '#0F6E56', // tunic
  b: '#712B13', // belt
  B: '#4A1B0C', // boot
  k: '#854F0B', // torch handle
  K: '#633806', // handle tip
  w: '#BA7517', // torch wrap
  X: '#D85A30', // flame outer
  O: '#EF9F27', // flame
  Y: '#FAC775', // flame inner
  y: '#FAEEDA', // flame core
  g: '#B4B2A9', // smoke
  G: '#854F0B', // tired eye
  z: '#888780', // closed eye
  S: '#85B7EB', // sweat drop
}

export const BODY: readonly string[] = [
  '............oo..........',
  '...........ohho.........',
  '.........oohhho.........',
  '.......oohhhHho.........',
  '.....oohhhhHHho.........',
  '....ohhhhhhhHhho........',
  '...ohhhhhhhhhHhho.......',
  '..ohhhoooooooohhho..ww..',
  '..ohhoddddddddohho..ww..',
  '.ohhsddddddddddshho.kk..',
  '.ohhsddEEddEEddshho.kk..',
  '.ohhsddeeddeeddshho.kk..',
  '.ohhsddddddddddshho.kk..',
  '.ohhhoddddddddohhho.kk..',
  '..ohhhoooooooohhho..kk..',
  '..ottTTtttttttttuo..kk..',
  '..ohhsuuuuuuuushhohhkk..',
  '..ohhsuuuuuuuushhohhkk..',
  '..ohhsbbbbbbbbshho..kk..',
  '..ohhsuuuuuuuushho..KK..',
  '...ohsuuuuuuuusho.......',
  '....oouuuuuuuuoo........',
  '......oBBooBBo..........',
  '......oooooooo..........',
]

// Flame frames are 4 wide and 6 tall, laid over columns 19-22, rows 1-6.
export const FLAME_ORIGIN = { column: 19, row: 1 } as const
export const FLAME_WIDTH = 4
export const FLAME_HEIGHT = 6

export const FLAMES = {
  awake: [
    ['..X.', '.XX.', 'XOOX', 'XOYO', 'OYyO', 'XYYX'],
    ['.X..', '.XX.', 'XOOX', 'OYOX', 'OyYO', 'XYYX'],
  ],
  tired: [
    ['....', '....', '....', '..X.', '.XO.', '.OY.'],
    ['....', '....', '....', '.X..', '.OX.', '.YO.'],
  ],
  sleep: [
    ['..g.', '.g..', '..g.', '....', '....', '.gg.'],
    ['.g..', '..g.', '.g..', '....', '....', '.gg.'],
  ],
} as const satisfies Record<string, readonly (readonly string[])[]>

// State variations on the body. Coordinates are [row, column], 0-based.
export const EYE_ROWS = [10, 11] as const
export const TIRED_EYES = { E: 'd', e: 'G' } as const
export const SLEEP_EYES = { E: 'd', e: 'z' } as const
export const SWEAT: readonly (readonly [number, number])[] = [
  [8, 1],
  [9, 0],
]
