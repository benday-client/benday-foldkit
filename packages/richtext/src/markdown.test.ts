// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './markdown.js'

const encoder = new TextEncoder()

describe('parseMarkdown', () => {
  it('keeps bare text literal', () => {
    expect(parseMarkdown('*bold* _italic_ `code` https://x.test #tag')).toEqual({
      text: '*bold* _italic_ `code` https://x.test #tag',
      facets: [],
    })
  })

  it('turns a labelled link into label text plus a byte-addressed link', () => {
    const parsed = parseMarkdown('[żółć](https://example.com) tail')
    expect(parsed.text).toBe('żółć tail')
    expect(parsed.facets).toEqual([
      { start: 0, end: encoder.encode('żółć').length, feature: { kind: 'link', uri: 'https://example.com' } },
    ])
  })

  it('measures the facet at its real byte position after multibyte literals', () => {
    const parsed = parseMarkdown('👩‍💻 ok [site](https://example.com/a(b)c)')
    const start = encoder.encode('👩‍💻 ok ').length
    expect(parsed.text).toBe('👩‍💻 ok site')
    expect(parsed.facets).toEqual([
      { start, end: start + 4, feature: { kind: 'link', uri: 'https://example.com/a(b)c' } },
    ])
  })

  it('leaves non-http destinations literal', () => {
    const parsed = parseMarkdown('[x](at://did:plc:1/app.bsky.feed.post/1)')
    expect(parsed).toEqual({
      text: '[x](at://did:plc:1/app.bsky.feed.post/1)',
      facets: [],
    })
  })

  it('ignores empty labels', () => {
    expect(parseMarkdown('[](https://example.com)')).toEqual({
      text: '[](https://example.com)',
      facets: [],
    })
  })
})
