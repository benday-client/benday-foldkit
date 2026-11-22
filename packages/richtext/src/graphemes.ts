// SPDX-License-Identifier: GPL-3.0-only
/**
 * One grapheme segmenter and one UTF-8 encoder for this module graph, so
 * length limits, truncation and byte accounting cannot disagree.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const encoder = new TextEncoder()

/** The first whole grapheme cluster, or `''` for an empty string. */
export function firstGrapheme(value: string): string {
  if (value.length === 0) return ''
  for (const segment of segmenter.segment(value)) return segment.segment
  return ''
}

/**
 * At most `limit` whole grapheme clusters from the start of `value`, without
 * ever splitting a cluster. The whole value comes back when it is already
 * short enough; no ellipsis is appended here, the caller owns that.
 */
export function truncateGraphemes(value: string, limit: number): string {
  if (limit <= 0) return ''
  let taken = ''
  let count = 0
  for (const segment of segmenter.segment(value)) {
    if (count === limit) return taken
    taken += segment.segment
    count += 1
  }
  return taken
}

/** Grapheme clusters and UTF-8 bytes in one string. */
export function measureText(text: string): { readonly graphemes: number; readonly bytes: number } {
  // the segmenter yields no zero-length cluster, so the count is its length
  const graphemes = [...segmenter.segment(text)].length
  return { graphemes, bytes: encoder.encode(text).length }
}

/** UTF-8 byte width of `text`, reusing the shared encoder. */
export function utf8Length(text: string): number {
  return encoder.encode(text).length
}
