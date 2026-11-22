// SPDX-License-Identifier: GPL-3.0-only
import type { FacetFeature, FacetSpan } from './features.js'

export interface TextSegment {
  readonly text: string
  readonly features: readonly FacetFeature[]
}

interface ResolvedSpan {
  readonly start: number
  readonly end: number
  readonly feature: FacetFeature
}

/** UTF-8 width of a code point, with lone surrogates counted as three bytes. */
function utf8Width(codePoint: number): number {
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}

/**
 * Facet offsets from the wire are UTF-8 byte offsets. Build a table that maps
 * every byte boundary to the UTF-16 index where the byte's code point starts.
 * Offsets that land inside a multi-byte code point therefore round down to the
 * start of that code point instead of splitting it.
 */
function buildByteIndex(text: string): number[] {
  let byteLength = 0
  for (const char of text) byteLength += utf8Width(char.codePointAt(0) ?? 0xfffd)

  const map = Array.from({ length: byteLength + 1 }, () => 0)
  let bytePosition = 0
  let utf16Position = 0
  for (const char of text) {
    const width = utf8Width(char.codePointAt(0) ?? 0xfffd)
    for (let offset = 0; offset < width; offset += 1) {
      map[bytePosition + offset] = utf16Position
    }
    bytePosition += width
    utf16Position += char.length
  }
  map[byteLength] = text.length
  return map
}

function resolveSpan(span: FacetSpan, map: number[], byteLength: number): ResolvedSpan | null {
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) return null
  if (span.start < 0 || span.end <= span.start || span.start >= byteLength) return null
  if (span.end > byteLength) return null
  const start = map[span.start] ?? 0
  const end = map[span.end] ?? 0
  if (end <= start) return null
  return { start, end, feature: span.feature }
}

/**
 * Split `text` at every facet boundary. A malformed span loses only its own
 * feature; the text itself is never dropped, and overlapping spans both apply
 * to the segments they cover.
 */
export function segmentText(text: string, facets: readonly FacetSpan[]): readonly TextSegment[] {
  if (text.length === 0) return []
  // plain text needs no byte table at all
  if (facets.length === 0) return [{ text, features: [] }]
  const map = buildByteIndex(text)
  const byteLength = map.length - 1
  const spans: ResolvedSpan[] = []
  for (const facet of facets) {
    const resolved = resolveSpan(facet, map, byteLength)
    if (resolved !== null) spans.push(resolved)
  }
  if (spans.length === 0) return [{ text, features: [] }]

  const ordered = spans.toSorted((left, right) => left.start - right.start || left.end - right.end)

  const boundaries = new Set<number>([0, text.length])
  for (const span of ordered) {
    boundaries.add(span.start)
    boundaries.add(span.end)
  }
  const points = [...boundaries].toSorted((left, right) => left - right)

  const segments: TextSegment[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index] ?? 0
    const end = points[index + 1] ?? start
    const features: FacetFeature[] = []
    for (const span of ordered) {
      if (span.start > start || span.end < end) continue
      if (features.includes(span.feature)) continue
      features.push(span.feature)
    }
    segments.push({ text: text.slice(start, end), features })
  }
  return segments
}

/**
 * The original destination when it is a usable HTTP(S) URL, otherwise `null`.
 * The stored value comes back unchanged: no trailing-slash or case rewriting.
 */
export function safeHttpUrl(raw: string): string | null {
  if (raw.length === 0) return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.hostname.length === 0) return null
  return raw
}
