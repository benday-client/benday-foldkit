// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { formatMediaTime, reduceMedia, type MediaEvent, type MediaState } from './index.js'

const ready = (playing: boolean, current = 0, duration = 0): MediaState => ({
  _tag: 'Ready',
  playing,
  current,
  duration,
})

describe('reduceMedia', () => {
  it('opens a ready session from the untouched poster', () => {
    expect(reduceMedia({ _tag: 'Poster' }, { _tag: 'Ready' })).toEqual(ready(false))
  })

  it('records play, position and pause facts while staying ready', () => {
    expect(reduceMedia(ready(false), { _tag: 'Playing' })).toEqual(ready(true))
    expect(
      reduceMedia(ready(true, 4, 20), { _tag: 'PositionChanged', current: 9, duration: 20 }),
    ).toEqual(ready(true, 9, 20))
    expect(reduceMedia(ready(true, 9, 20), { _tag: 'Paused' })).toEqual(ready(false, 9, 20))
  })

  it('treats ended playback as ready with playback stopped', () => {
    expect(reduceMedia(ready(true, 20, 20), { _tag: 'Ended' })).toEqual(ready(false, 20, 20))
  })

  it('retains counters across a load failure and a later retry', () => {
    const failed = reduceMedia(ready(true, 12, 30), { _tag: 'LoadFailed' })
    expect(failed).toEqual({ _tag: 'LoadFailed', playing: false, current: 12, duration: 30 })
    expect(reduceMedia(failed, { _tag: 'Ready' })).toEqual(ready(false, 12, 30))
  })

  it('keeps the clock while a retried attempt is loading', () => {
    const retried: MediaState = { _tag: 'Loading', playing: false, current: 12, duration: 30 }
    expect(reduceMedia(retried, { _tag: 'LoadFailed' })).toEqual({
      _tag: 'LoadFailed',
      playing: false,
      current: 12,
      duration: 30,
    })
    expect(reduceMedia(retried, { _tag: 'Ready' })).toEqual(ready(false, 12, 30))
  })

  it('keeps the loading phase when play fires before the source is ready', () => {
    const loading: MediaState = { _tag: 'Loading', playing: false, current: 4, duration: 20 }
    expect(reduceMedia(loading, { _tag: 'Playing' })).toEqual({
      _tag: 'Loading',
      playing: true,
      current: 4,
      duration: 20,
    })
  })

  it('keeps a failure or unsupported tag on late playback facts', () => {
    const failed: MediaState = { _tag: 'LoadFailed', playing: false, current: 4, duration: 20 }
    expect(reduceMedia(failed, { _tag: 'Playing' })).toEqual({
      _tag: 'LoadFailed',
      playing: true,
      current: 4,
      duration: 20,
    })
    expect(reduceMedia(failed, { _tag: 'Ended' })._tag).toBe('LoadFailed')
    const unsupported: MediaState = { _tag: 'Unsupported', playing: false, current: 0, duration: 0 }
    expect(reduceMedia(unsupported, { _tag: 'Playing' })._tag).toBe('Unsupported')
  })

  it('keeps a failure while a late position fact arrives', () => {
    const failed: MediaState = { _tag: 'LoadFailed', playing: false, current: 12, duration: 30 }
    expect(reduceMedia(failed, { _tag: 'PositionChanged', current: 13, duration: 30 })).toEqual({
      _tag: 'LoadFailed',
      playing: false,
      current: 13,
      duration: 30,
    })
  })

  it('normalizes an unknown duration but preserves the reported position', () => {
    const position = (duration: number): MediaEvent => ({
      _tag: 'PositionChanged',
      current: 3,
      duration,
    })
    expect(reduceMedia(ready(false, 0, 10), position(Number.NaN))).toEqual(ready(false, 3, 0))
    expect(reduceMedia(ready(false, 0, 10), position(Number.POSITIVE_INFINITY))).toEqual(
      ready(false, 3, 0),
    )
    expect(reduceMedia(ready(false, 0, 10), position(-5))).toEqual(ready(false, 3, 0))
    expect(reduceMedia(ready(false, 0, 10), position(0))).toEqual(ready(false, 3, 0))
  })

  it('marks unsupported playback without dropping the clock', () => {
    expect(reduceMedia(ready(true, 5, 40), { _tag: 'Unsupported' })).toEqual({
      _tag: 'Unsupported',
      playing: false,
      current: 5,
      duration: 40,
    })
  })

  it('never invents playback facts before activation', () => {
    expect(reduceMedia({ _tag: 'Poster' }, { _tag: 'LoadFailed' })).toEqual({ _tag: 'Poster' })
    expect(
      reduceMedia({ _tag: 'Poster' }, { _tag: 'PositionChanged', current: 3, duration: 9 }),
    ).toEqual({ _tag: 'Poster' })
    expect(reduceMedia({ _tag: 'Poster' }, { _tag: 'Paused' })).toEqual({ _tag: 'Poster' })
  })

  it('leaves an unavailable post alone for every fact', () => {
    const unavailable: MediaState = { _tag: 'Unavailable' }
    const events: readonly MediaEvent[] = [
      { _tag: 'Ready' },
      { _tag: 'Playing' },
      { _tag: 'Paused' },
      { _tag: 'Ended' },
      { _tag: 'PositionChanged', current: 1, duration: 2 },
      { _tag: 'LoadFailed' },
      { _tag: 'Unsupported' },
    ]
    for (const event of events) {
      expect(reduceMedia(unavailable, event)).toBe(unavailable)
    }
  })
})

describe('formatMediaTime', () => {
  it('formats whole seconds as minutes and zero-padded seconds', () => {
    expect(formatMediaTime(0)).toBe('0:00')
    expect(formatMediaTime(5)).toBe('0:05')
    expect(formatMediaTime(59)).toBe('0:59')
    expect(formatMediaTime(60)).toBe('1:00')
    expect(formatMediaTime(3599)).toBe('59:59')
    expect(formatMediaTime(3600)).toBe('60:00')
  })

  it('floors fractional seconds rather than rounding them', () => {
    expect(formatMediaTime(59.9)).toBe('0:59')
    expect(formatMediaTime(0.99)).toBe('0:00')
  })

  it('normalizes negative and non-finite durations to zero', () => {
    expect(formatMediaTime(-1)).toBe('0:00')
    expect(formatMediaTime(-0.5)).toBe('0:00')
    expect(formatMediaTime(Number.NaN)).toBe('0:00')
    expect(formatMediaTime(Number.POSITIVE_INFINITY)).toBe('0:00')
    expect(formatMediaTime(Number.NEGATIVE_INFINITY)).toBe('0:00')
  })
})
