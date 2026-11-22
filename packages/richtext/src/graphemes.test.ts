// SPDX-License-Identifier: GPL-3.0-only
import { RichText } from '@atproto/api'
import { describe, expect, it } from 'vitest'
import { firstGrapheme, measureText, truncateGraphemes } from './graphemes.js'

const SAMPLES = [
  '',
  'plain ascii',
  'e\u0301 combining acute',
  '🇫🇷 flag',
  '👨‍👩‍👧‍👦 family',
  'żółć',
  'a\uD800lone high surrogate',
  'lone low \uDC00 here',
  'mixed 👩‍💻 é 🇵🇱 ż',
]

describe('measureText', () => {
  it('agrees with the pinned SDK on graphemes and UTF-8 bytes', () => {
    for (const text of SAMPLES) {
      const rich = new RichText({ text })
      expect(measureText(text).graphemes).toBe(rich.graphemeLength)
      expect(measureText(text).bytes).toBe(rich.unicodeText.utf16IndexToUtf8Index(text.length))
    }
  })

  it('reports zero for empty text', () => {
    expect(measureText('')).toEqual({ graphemes: 0, bytes: 0 })
  })
})

describe('firstGrapheme', () => {
  it('keeps a whole cluster', () => {
    expect(firstGrapheme('👨‍👩‍👧‍👦 rest')).toBe('👨‍👩‍👧‍👦')
    expect(firstGrapheme('🇫🇷')).toBe('🇫🇷')
    expect(firstGrapheme('e\u0301x')).toBe('e\u0301')
  })

  it('returns empty for empty input', () => {
    expect(firstGrapheme('')).toBe('')
  })
})

describe('truncateGraphemes', () => {
  it('never splits a cluster', () => {
    expect(truncateGraphemes('👨‍👩‍👧‍👦🇫🇷ab', 2)).toBe('👨‍👩‍👧‍👦🇫🇷')
    expect(truncateGraphemes('e\u0301e\u0301', 1)).toBe('e\u0301')
  })

  it('returns the whole value when it is short enough and nothing for a zero limit', () => {
    expect(truncateGraphemes('three', 9)).toBe('three')
    expect(truncateGraphemes('three', 0)).toBe('')
    expect(truncateGraphemes('three', -1)).toBe('')
  })
})
