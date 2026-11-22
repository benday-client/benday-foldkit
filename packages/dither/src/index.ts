// SPDX-License-Identifier: GPL-3.0-only
/**
 * Ordered-dither primitives.
 *
 * The pattern is a 16x16 SVG tile made of sixty-four 2x2 cells. Each cell is
 * filled with the inverted Bayer threshold for its position, so an SVG
 * feComposite arithmetic step can compare a grayscale image against the tile
 * without canvas or an image proxy.
 */

export type Rgb = readonly [number, number, number]

const BAYER_MATRIX: readonly (readonly number[])[] = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

const BAYER_SIZE = 8
const CELL_SIZE = 2
const LEVELS = BAYER_SIZE * BAYER_SIZE

/** Width and height of one pattern tile in CSS pixels. */
export const BAYER_TILE_SIZE = BAYER_SIZE * CELL_SIZE

/**
 * Tile fill for a threshold in the open interval (0, 1). The filter inverts
 * this fill and compares the image against it, so a cell whose threshold is
 * `t` turns to the light end of the ramp once the image value reaches `t`.
 */
function thresholdFill(threshold: number): string {
  const level = ((1 - threshold) * 100).toFixed(3).replace(/\.?0+$/, '')
  return `rgb(${level}%, ${level}%, ${level}%)`
}

/**
 * Deterministic 16x16 pattern tile: black ground plus sixty-four 2x2 cells.
 * Every byte is ASCII, so the data URI form needs no browser encoder.
 */
export function buildBayerPatternSvg(): string {
  const cells: string[] = []

  for (let row = 0; row < BAYER_SIZE; row += 1) {
    for (let column = 0; column < BAYER_SIZE; column += 1) {
      const value = BAYER_MATRIX[row]?.[column] ?? 0
      const x = column * CELL_SIZE
      const y = row * CELL_SIZE
      cells.push(
        `<rect x="${x}" y="${y}" width="${CELL_SIZE}"` +
          ` height="${CELL_SIZE}" fill="${thresholdFill((value + 0.5) / LEVELS)}"/>`,
      )
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAYER_TILE_SIZE}"` +
    ` height="${BAYER_TILE_SIZE}" viewBox="0 0 ${BAYER_TILE_SIZE} ${BAYER_TILE_SIZE}"` +
    ` shape-rendering="crispEdges">` +
    `<path d="M0 0h${BAYER_TILE_SIZE}v${BAYER_TILE_SIZE}H0z" fill="#000"/>` +
    `${cells.join('')}</svg>`
  )
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64Ascii(input: string): string {
  let output = ''
  for (let index = 0; index < input.length; index += 3) {
    const first = input.charCodeAt(index)
    const second = index + 1 < input.length ? input.charCodeAt(index + 1) : 0
    const third = index + 2 < input.length ? input.charCodeAt(index + 2) : 0
    const hasSecond = index + 1 < input.length
    const hasThird = index + 2 < input.length
    output += BASE64_ALPHABET.charAt(first >> 2)
    output += BASE64_ALPHABET.charAt(((first & 3) << 4) | (second >> 4))
    output += hasSecond ? BASE64_ALPHABET.charAt(((second & 15) << 2) | (third >> 6)) : '='
    output += hasThird ? BASE64_ALPHABET.charAt(third & 63) : '='
  }
  return output
}

/** Inline data URI for the pattern tile, safe to reference from an SVG filter. */
export function buildBayerPatternDataUri(): string {
  return `data:image/svg+xml;base64,${toBase64Ascii(buildBayerPatternSvg())}`
}

/** One node of the recursive SVG filter description the caller renders. */
export type SvgFilterNode =
  | {
      readonly tag: 'filter'
      readonly attributes: Readonly<{
        id: string
        x: '0'
        y: '0'
        width: '100%'
        height: '100%'
        colorInterpolationFilters: 'sRGB'
      }>
      readonly children: readonly SvgFilterNode[]
    }
  | {
      readonly tag: 'feColorMatrix'
      readonly attributes: Readonly<{
        in?: string
        type: 'matrix' | 'saturate'
        values: string
        result: string
      }>
      readonly children: readonly []
    }
  | {
      readonly tag: 'feTurbulence'
      readonly attributes: Readonly<{
        type: 'fractalNoise'
        baseFrequency: number
        numOctaves: '2'
        seed: 17
        result: string
      }>
      readonly children: readonly []
    }
  | {
      readonly tag: 'feComposite'
      readonly attributes: Readonly<{
        in: string
        in2: string
        operator: 'arithmetic'
        k1: '0'
        k2: '1'
        k3: '0.2' | '0.85'
        k4: '-0.1' | '-0.425'
        result: string
      }>
      readonly children: readonly []
    }
  | {
      readonly tag: 'feImage'
      readonly attributes: Readonly<{
        href: string
        x: '0'
        y: '0'
        width: 16
        height: 16
        preserveAspectRatio: 'none'
        result: string
      }>
      readonly children: readonly []
    }
  | {
      readonly tag: 'feTile'
      readonly attributes: Readonly<{ in: string; result: string }>
      readonly children: readonly []
    }
  | {
      readonly tag: 'feComponentTransfer'
      readonly attributes: Readonly<{ in?: string; result?: string }>
      readonly children: readonly SvgFilterNode[]
    }
  | {
      readonly tag: 'feFuncR' | 'feFuncG' | 'feFuncB'
      readonly attributes: Readonly<{
        type: 'discrete' | 'table'
        tableValues: string
      }>
      readonly children: readonly []
    }

/** The complete filter graph for one colour-scheme variant. */
export interface DitherFilterSpec {
  readonly filters: readonly SvgFilterNode[]
}

// The grungy Bayer screen stays monochrome; violet belongs to interaction.
const GRUNGE_SEED = 17
const GRUNGE_FREQUENCY = 0.9

const GRAYSCALE =
  '0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0'

const BAYER_PATTERN_URI = buildBayerPatternDataUri()

function binaryThreshold(): SvgFilterNode {
  return {
    tag: 'feComponentTransfer',
    attributes: { in: 'mixed', result: 'binary' },
    children: [
      { tag: 'feFuncR', attributes: { type: 'discrete', tableValues: '0 1' }, children: [] },
      { tag: 'feFuncG', attributes: { type: 'discrete', tableValues: '0 1' }, children: [] },
      { tag: 'feFuncB', attributes: { type: 'discrete', tableValues: '0 1' }, children: [] },
    ],
  }
}

function ramp(from: Rgb, to: Rgb): SvgFilterNode {
  return {
    tag: 'feComponentTransfer',
    attributes: { in: 'binary' },
    children: [
      {
        tag: 'feFuncR',
        attributes: { type: 'table', tableValues: `${from[0]} ${to[0]}` },
        children: [],
      },
      {
        tag: 'feFuncG',
        attributes: { type: 'table', tableValues: `${from[1]} ${to[1]}` },
        children: [],
      },
      {
        tag: 'feFuncB',
        attributes: { type: 'table', tableValues: `${from[2]} ${to[2]}` },
        children: [],
      },
    ],
  }
}

/**
 * The exact source filter graph, as one typed description per colour scheme.
 * The caller supplies a unique `id` prefix and its two ramps; the library owns
 * every node and threshold so two consumers cannot drift.
 */
export function createDitherFilter(config: {
  readonly id: string
  readonly dark: readonly [Rgb, Rgb]
  readonly light: readonly [Rgb, Rgb]
}): DitherFilterSpec {
  const variants = [
    { suffix: 'dark', ramp: config.dark },
    { suffix: 'light', ramp: config.light },
  ] as const

  return {
    filters: variants.map(({ suffix, ramp: [from, to] }) => ({
      tag: 'filter',
      attributes: {
        id: `${config.id}-${suffix}`,
        x: '0',
        y: '0',
        width: '100%',
        height: '100%',
        colorInterpolationFilters: 'sRGB',
      },
      children: [
        {
          tag: 'feColorMatrix',
          attributes: { type: 'matrix', values: GRAYSCALE, result: 'gray' },
          children: [],
        },
        {
          tag: 'feTurbulence',
          attributes: {
            type: 'fractalNoise',
            baseFrequency: GRUNGE_FREQUENCY,
            numOctaves: '2',
            seed: GRUNGE_SEED,
            result: 'noise',
          },
          children: [],
        },
        {
          tag: 'feColorMatrix',
          attributes: { in: 'noise', type: 'saturate', values: '0', result: 'noise-gray' },
          children: [],
        },
        {
          tag: 'feComposite',
          attributes: {
            in: 'gray',
            in2: 'noise-gray',
            operator: 'arithmetic',
            k1: '0',
            k2: '1',
            k3: '0.2',
            k4: '-0.1',
            result: 'grungy',
          },
          children: [],
        },
        {
          tag: 'feImage',
          attributes: {
            href: BAYER_PATTERN_URI,
            x: '0',
            y: '0',
            width: 16,
            height: 16,
            preserveAspectRatio: 'none',
            result: 'pattern',
          },
          children: [],
        },
        { tag: 'feTile', attributes: { in: 'pattern', result: 'tile' }, children: [] },
        {
          tag: 'feComposite',
          attributes: {
            in: 'grungy',
            in2: 'tile',
            operator: 'arithmetic',
            k1: '0',
            k2: '1',
            k3: '0.85',
            k4: '-0.425',
            result: 'mixed',
          },
          children: [],
        },
        binaryThreshold(),
        ramp(from, to),
      ],
    })),
  }
}
