// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { buildBayerPatternDataUri, buildBayerPatternSvg, createDitherFilter } from './index.js'

describe('bayer tile', () => {
  it('is a 16x16 crisp-edge svg with sixty-four cells', () => {
    const svg = buildBayerPatternSvg()
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"')).toBe(
      true,
    )
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg.match(/<rect /g)).toHaveLength(64)
  })

  it('encodes to the same bytes a browser btoa would produce', () => {
    const uri = buildBayerPatternDataUri()
    expect(uri).toBe(`data:image/svg+xml;base64,${btoa(buildBayerPatternSvg())}`)
    expect(atob(uri.slice('data:image/svg+xml;base64,'.length))).toBe(buildBayerPatternSvg())
  })
})

describe('createDitherFilter', () => {
  const spec = createDitherFilter({
    id: 'probe',
    dark: [
      [0.035, 0.035, 0.035],
      [0.77, 0.77, 0.77],
    ],
    light: [
      [0.16, 0.15, 0.17],
      [0.96, 0.95, 0.94],
    ],
  })

  it('builds one full graph per colour scheme with caller-scoped ids', () => {
    expect(spec.filters.map((filter) => (filter.tag === 'filter' ? filter.attributes.id : null))).toEqual([
      'probe-dark',
      'probe-light',
    ])
    for (const filter of spec.filters) {
      expect(filter.tag).toBe('filter')
      expect(filter.children.map((child) => child.tag)).toEqual([
        'feColorMatrix',
        'feTurbulence',
        'feColorMatrix',
        'feComposite',
        'feImage',
        'feTile',
        'feComposite',
        'feComponentTransfer',
        'feComponentTransfer',
      ])
      expect(filter.children[8]?.attributes).toEqual({ in: 'binary' })
    }
  })

  it('keeps the source grunge and arithmetic constants', () => {
    const turbulence = spec.filters[0]?.children[1]
    expect(turbulence?.attributes).toMatchObject({ baseFrequency: 0.9, seed: 17, numOctaves: '2' })
    expect(spec.filters[0]?.children[3]?.attributes).toMatchObject({
      k2: '1',
      k3: '0.2',
      k4: '-0.1',
    })
    expect(spec.filters[0]?.children[6]?.attributes).toMatchObject({ k2: '1', k3: '0.85', k4: '-0.425' })
    expect(spec.filters[0]?.children[8]?.children.map((node) => node.attributes)).toEqual([
      { type: 'table', tableValues: '0.035 0.77' },
      { type: 'table', tableValues: '0.035 0.77' },
      { type: 'table', tableValues: '0.035 0.77' },
    ])
  })

  it('keeps independent consumers from colliding', () => {
    const other = createDitherFilter({
      id: 'second',
      dark: [
        [0, 0, 0],
        [1, 1, 1],
      ],
      light: [
        [0, 0, 0],
        [1, 1, 1],
      ],
    })
    const first = other.filters[0]
    expect(first?.tag === 'filter' ? first.attributes.id : null).toBe('second-dark')
  })
})
