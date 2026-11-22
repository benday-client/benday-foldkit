// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { insertSuggestion, suggestionAt } from './suggestions.js'

describe('suggestionAt', () => {
  it('finds a token at the end of the text', () => {
    expect(suggestionAt('hello @alias', 12)).toEqual({ start: 6, end: 12, query: 'alias' })
  })

  it('requires a boundary before the at sign', () => {
    expect(suggestionAt('mail@alias', 10)).toBeNull()
  })

  it('extends the span past the caret into the existing handle', () => {
    expect(suggestionAt('hi @alice smith', 8)).toEqual({ start: 3, end: 9, query: 'alic' })
  })

  it('stops the span before sentence punctuation', () => {
    const text = 'hi @alice. more'
    expect(suggestionAt(text, 9)).toEqual({ start: 3, end: 9, query: 'alice' })
  })

  it('accepts an empty query right after the at sign', () => {
    expect(suggestionAt('hey @', 5)).toEqual({ start: 4, end: 5, query: '' })
  })

  it('works after a newline', () => {
    expect(suggestionAt('line\n@qu', 9)).toEqual({ start: 5, end: 9, query: 'qu' })
  })
})

describe('insertSuggestion', () => {
  it('adds a trailing space at the end of the text', () => {
    expect(insertSuggestion('hello @al', { start: 6, end: 9, query: 'al' }, 'alice')).toEqual({
      text: 'hello @alice ',
      cursor: 13,
    })
  })

  it('reuses an existing separator and lands after the whole run', () => {
    expect(
      insertSuggestion('hi @al  rest', { start: 3, end: 6, query: 'al' }, 'alice'),
    ).toEqual({ text: 'hi @alice  rest', cursor: 11 })
  })

  it('does not double a single space', () => {
    expect(insertSuggestion('@al rest', { start: 0, end: 3, query: 'al' }, 'alice')).toEqual({
      text: '@alice rest',
      cursor: 7,
    })
  })

  it('never lands inside a CRLF pair', () => {
    expect(insertSuggestion('@al\r\nnext', { start: 0, end: 3, query: 'al' }, 'alice')).toEqual({
      text: '@alice\r\nnext',
      cursor: 8,
    })
  })

  it('stops at punctuation instead of consuming it', () => {
    expect(insertSuggestion('@al, next', { start: 0, end: 3, query: 'al' }, 'alice')).toEqual({
      text: '@alice, next',
      cursor: 6,
    })
  })
})
