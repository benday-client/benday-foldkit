// SPDX-License-Identifier: GPL-3.0-only
import type { FacetSpan } from './features.js'

export interface ParsedMarkdown {
  readonly text: string
  readonly facets: readonly FacetSpan[]
}

// A labelled link is the only markup the composer interprets: the label becomes
// the literal text and the destination becomes one link facet. Every other
// marker — emphasis delimiters, backticks, bare urls and hashtags — stays
// literal text, so what the editor sends is exactly what the reader typed.
const LINK = /\[(?<label>[^\]]+)\]\((?<url>https?:\/\/[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)\)/gu

const encoder = new TextEncoder()

/** Parse composer input into literal text plus UTF-8-byte-addressed link facets. */
export function parseMarkdown(input: string): ParsedMarkdown {
  const facets: FacetSpan[] = []
  let text = ''
  let byte = 0
  let cursor = 0

  for (const match of input.matchAll(LINK)) {
    const index = match.index
    const label = match.groups?.['label']
    const url = match.groups?.['url']
    if (index === undefined || label === undefined || url === undefined) continue

    const literal = input.slice(cursor, index)
    if (literal.length > 0) {
      text += literal
      byte += encoder.encode(literal).length
    }

    const start = byte
    text += label
    byte += encoder.encode(label).length
    facets.push({ start, end: byte, feature: { kind: 'link', uri: url } })

    cursor = index + match[0].length
  }

  const rest = input.slice(cursor)
  if (rest.length > 0) text += rest

  return { text, facets }
}
