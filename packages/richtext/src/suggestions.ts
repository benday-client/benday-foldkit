// SPDX-License-Identifier: GPL-3.0-only
/**
 * Mention completion. Token and cursor positions are UTF-16 code-unit indices
 * into the JavaScript string, unlike wire facet offsets.
 */
export interface SuggestionToken {
  readonly start: number
  readonly end: number
  readonly query: string
}

const TOKEN_CHAR = /[\p{L}\p{N}._-]/u
const WHITESPACE = /\s/u
const TRAILING_TOKEN_PUNCTUATION: Record<string, true> = { '.': true, '-': true }

/** The mention token the caret sits in, or `null` when there is none. */
export function suggestionAt(text: string, cursor: number): SuggestionToken | null {
  const before = text.slice(0, cursor)
  const match = /(^|\s)@([\p{L}\p{N}._-]*)$/u.exec(before)
  if (match === null) return null

  const start = before.lastIndexOf('@')
  if (start < 0) return null

  let end = cursor
  while (end < text.length && TOKEN_CHAR.test(text.charAt(end))) end += 1
  // a handle never ends in `.` or `-`: those characters belong to the sentence
  // around the token, so the replacement span and its query stop before them
  while (end > start + 1 && TRAILING_TOKEN_PUNCTUATION[text.charAt(end - 1)] === true) end -= 1
  const query = text.slice(start + 1, Math.min(cursor, end))
  return { start, end, query }
}

/**
 * Replacement for an accepted suggestion. The text around the token is
 * unchanged; at the end of the text one space follows the handle, and a caret
 * already before whitespace or punctuation keeps its place.
 */
export function insertSuggestion(
  text: string,
  token: SuggestionToken,
  value: string,
): { readonly text: string; readonly cursor: number } {
  const inserted = `@${value}`
  const head = text.slice(0, token.start)
  const suffix = text.slice(token.end)
  let next = `${head}${inserted}${suffix}`
  let cursor = head.length + inserted.length

  if (suffix.length === 0) {
    next += ' '
    return { text: next, cursor: cursor + 1 }
  }

  // an existing separator is reused instead of doubled, and the caret lands
  // after the whole run so typing continues past it and never inside a CRLF
  while (cursor < next.length && WHITESPACE.test(next.charAt(cursor))) cursor += 1
  return { text: next, cursor }
}
