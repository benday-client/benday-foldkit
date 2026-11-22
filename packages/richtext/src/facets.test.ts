// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { safeHttpUrl, segmentText } from './facets.js'
import type { FacetSpan } from './features.js'

const link = (start: number, end: number, uri: string): FacetSpan => ({
  start,
  end,
  feature: { kind: 'link', uri },
})

describe('segmentText', () => {
  it('returns no segments for empty text and one plain segment without facets', () => {
    expect(segmentText('', [])).toEqual([])
    expect(segmentText('plain', [])).toEqual([{ text: 'plain', features: [] }])
  })

  it('applies UTF-8 byte offsets to multibyte text', () => {
    // "żółć" is 2 bytes per letter; the second letter starts at byte 2
    expect(segmentText('żółć', [link(2, 4, 'https://example.com')])).toEqual([
      { text: 'ż', features: [] },
      { text: 'ó', features: [{ kind: 'link', uri: 'https://example.com' }] },
      { text: 'łć', features: [] },
    ])
  })

  it('rounds a boundary inside a code point down to its start', () => {
    const segments = segmentText('a👩‍💻b', [link(2, 12, 'https://example.com')])
    expect(segments.map((segment) => segment.text)).toEqual(['a', '👩‍💻', 'b'])
    expect(segments[1]?.features).toHaveLength(1)
  })

  it('keeps the text when a span is malformed', () => {
    const facets = [
      { start: 4, end: 2, feature: { kind: 'bold' } } as FacetSpan,
      { start: -1, end: 2, feature: { kind: 'italic' } } as FacetSpan,
      { start: 1.5, end: 3, feature: { kind: 'code' } } as FacetSpan,
      { start: 0, end: 999, feature: { kind: 'strikethrough' } } as FacetSpan,
    ]
    expect(segmentText('text', facets)).toEqual([{ text: 'text', features: [] }])
  })

  it('keeps shared and overlapping features on every covered segment', () => {
    const bold: FacetSpan = { start: 0, end: 4, feature: { kind: 'bold' } }
    const italic: FacetSpan = { start: 2, end: 6, feature: { kind: 'italic' } }
    const segments = segmentText('abcdef', [italic, bold])
    expect(segments.map((segment) => [segment.text, segment.features.length])).toEqual([
      ['ab', 1],
      ['cd', 2],
      ['ef', 1],
    ])
  })
})

describe('safeHttpUrl', () => {
  it('returns the original destination unchanged', () => {
    expect(safeHttpUrl('https://example.com/a(b)c')).toBe('https://example.com/a(b)c')
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com')
  })

  it('rejects non-http schemes, empty hosts and malformed input', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('at://did:plc:x/app.bsky.feed.post/1')).toBeNull()
    expect(safeHttpUrl('https://')).toBeNull()
    expect(safeHttpUrl('not a url')).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
  })
})
