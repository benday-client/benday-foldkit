// SPDX-License-Identifier: GPL-3.0-only
/**
 * Element-scoped video attachment with a lazily imported HLS transport.
 *
 * Nothing here runs at import time: the module only touches DOM globals inside
 * {@link attachVideo}'s acquisition, and `hls.js` is imported after explicit
 * activation. Releasing the owning scope destroys the transport, detaches the
 * source, and aborts native resource selection.
 */
import { Data, Effect, Queue, Stream } from 'effect'
import type { Cause, Scope } from 'effect'
import type Hls from 'hls.js'
import type { MediaEvent } from './index.js'

/** Acquisition could not produce an element-scoped player. */
export class MediaSetupFailure extends Data.TaggedError('MediaSetupFailure')<{
  readonly detail: string
}> {}

/** A genuine playback failure after the source became ready. */
export class MediaPlaybackFailure extends Data.TaggedError('MediaPlaybackFailure')<{
  readonly detail: string
}> {}

export interface VideoSource {
  readonly playlist: string
  /** App-owned retry identity; a fresh value acquires a fresh element scope. */
  readonly attempt: number
}

export interface VideoHandle {
  /** Media facts for the lifetime of the owning scope. */
  readonly events: Stream.Stream<MediaEvent>
  /**
   * Start playback, restarting HLS loading when paused. Resolves `false` for
   * the source's benign autoplay refusals (`NotAllowedError`/`AbortError`);
   * a genuine failure after readiness publishes `LoadFailed` and fails.
   */
  readonly play: Effect.Effect<boolean, MediaPlaybackFailure>
  readonly pause: Effect.Effect<void>
  readonly seek: (seconds: number) => Effect.Effect<void>
}

type Attachment = {
  readonly handle: VideoHandle
  readonly release: () => void
}

/**
 * Attach `source.playlist` to `element` for the lifetime of the returned
 * handle's scope.
 *
 * The native source is chosen when the browser has no MSE but reports native
 * HLS support; otherwise `hls.js` is imported on activation and started with
 * `autoStartLoad: false`, matching the source player. An empty playlist is the
 * app's `Unavailable` decision and is never acquired; a defensive call fails
 * with {@link MediaSetupFailure} instead of attaching an empty source.
 */
export function attachVideo(
  element: HTMLVideoElement,
  source: VideoSource,
): Effect.Effect<VideoHandle, MediaSetupFailure, Scope.Scope> {
  const acquire = Effect.gen(function* () {
    if (source.playlist.length === 0) {
      return yield* Effect.fail(new MediaSetupFailure({ detail: 'playlist is empty' }))
    }

    // The queue's error type is `Cause.Done` so ending it completes the
    // stream instead of failing it when the element scope releases.
    const queue = yield* Queue.unbounded<MediaEvent, Cause.Done>()
    const events = Stream.fromQueue(queue)

    let hls: Hls | null = null
    let ready = false
    let attached = false
    let released = false
    let duration = 0

    const publish = (event: MediaEvent): void => {
      if (!released) Queue.offerUnsafe(queue, event)
    }

    // The element is the only source of truth for the clock; a non-finite or
    // non-positive duration means unknown, exactly as in the source player.
    const readDuration = (): void => {
      const next = element.duration
      duration = Number.isFinite(next) && next > 0 ? next : 0
    }

    const publishPosition = (current: number): void => {
      publish({ _tag: 'PositionChanged', current, duration })
    }

    const onCanPlay = (): void => {
      if (ready) return
      ready = true
      publish({ _tag: 'Ready' })
    }

    const onPlay = (): void => {
      publish({ _tag: 'Playing' })
    }

    const onPause = (): void => {
      publish({ _tag: 'Paused' })
      // Playback after readiness stops the transport; an ended element keeps
      // its own terminal stop.
      if (ready && !element.ended) hls?.stopLoad()
    }

    const onEnded = (): void => {
      publish({ _tag: 'Ended' })
      hls?.stopLoad()
    }

    const onLoadedMetadata = (): void => {
      readDuration()
      publishPosition(element.currentTime)
    }

    const onTimeUpdate = (): void => {
      publishPosition(element.currentTime)
    }

    const onError = (): void => {
      // An error before a source reached the element is about the activation
      // attempt, not about the source, so it never invents a load failure.
      if (!attached) return
      publish({ _tag: 'LoadFailed' })
    }

    element.addEventListener('canplay', onCanPlay)
    element.addEventListener('play', onPlay)
    element.addEventListener('pause', onPause)
    element.addEventListener('ended', onEnded)
    element.addEventListener('loadedmetadata', onLoadedMetadata)
    element.addEventListener('durationchange', onLoadedMetadata)
    element.addEventListener('timeupdate', onTimeUpdate)
    element.addEventListener('error', onError)

    const attach = Effect.gen(function* () {
      const canUseMse =
        typeof MediaSource !== 'undefined' ||
        (typeof window !== 'undefined' && 'ManagedMediaSource' in window)

      // Only a browser without MSE plays HLS itself. `canPlayType` answers
      // "maybe" in Chromium, so any non-empty answer alone is not proof.
      if (!canUseMse && element.canPlayType('application/vnd.apple.mpegurl') !== '') {
        element.src = source.playlist
        attached = true
        return
      }

      const hlsModule = yield* Effect.tryPromise({
        try: () => import('hls.js'),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch(() =>
          Effect.sync((): null => {
            publish({ _tag: 'LoadFailed' })
            return null
          }),
        ),
      )

      if (hlsModule === null || released) return

      const HlsPlayer = hlsModule.default
      if (!HlsPlayer.isSupported()) {
        publish({ _tag: 'Unsupported' })
        return
      }

      const started = yield* Effect.try({
        try: (): boolean => {
          const player = new HlsPlayer({ autoStartLoad: false })
          // Retain the player before wiring so a throw during setup still
          // leaves the transport to scope release.
          hls = player
          player.on(HlsPlayer.Events.ERROR, (_event, data) => {
            if (released || !data.fatal) return
            publish({ _tag: 'LoadFailed' })
          })
          player.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
            if (released || ready) return
            ready = true
            publish({ _tag: 'Ready' })
          })
          player.loadSource(source.playlist)
          player.attachMedia(element)
          attached = true
          player.startLoad()
          return true
        },
        catch: (cause) => cause,
      }).pipe(
        Effect.catch(() =>
          Effect.sync(() => {
            publish({ _tag: 'LoadFailed' })
            return false
          }),
        ),
      )

      if (!started) return
    })

    // A late import or a slow manifest must never attach to an element whose
    // scope already released; interruption handles that, the flag guards the
    // synchronous tail.
    yield* Effect.forkScoped(attach)

    const play = Effect.gen(function* () {
      if (released) return false
      if (!element.paused) return true

      hls?.startLoad()
      // Resolve in both branches so a benign refusal is a value, not an
      // error; the promise itself cannot reject here.
      type PlayOutcome =
        | { readonly ok: true }
        | { readonly ok: false; readonly reason: unknown }

      const outcome = yield* Effect.promise(
        (): Promise<PlayOutcome> =>
          element.play().then(
            (): PlayOutcome => ({ ok: true }),
            (reason: unknown): PlayOutcome => ({ ok: false, reason }),
          ),
      )

      if (!outcome.ok) {
        let refused = false
        if (typeof DOMException !== 'undefined' && outcome.reason instanceof DOMException) {
          refused =
            outcome.reason.name === 'NotAllowedError' || outcome.reason.name === 'AbortError'
        }
        // A refused or interrupted play leaves the player paused on its own
        // control; only a genuine failure after readiness is a load failure.
        if (refused) return false
        if (ready) publish({ _tag: 'LoadFailed' })
        return yield* Effect.fail(
          new MediaPlaybackFailure({
            detail:
              outcome.reason instanceof Error
                ? `${outcome.reason.name}: ${outcome.reason.message}`
                : 'video playback failed',
          }),
        )
      }

      return true
    })

    const pause = Effect.sync(() => {
      if (!released) element.pause()
    })

    const seek = (seconds: number): Effect.Effect<void> =>
      Effect.sync(() => {
        if (released) return
        element.currentTime = seconds
        publishPosition(seconds)
      })

    const handle: VideoHandle = { events, play, pause, seek }

    const release = (): void => {
      if (released) return
      released = true
      element.removeEventListener('canplay', onCanPlay)
      element.removeEventListener('play', onPlay)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('ended', onEnded)
      element.removeEventListener('loadedmetadata', onLoadedMetadata)
      element.removeEventListener('durationchange', onLoadedMetadata)
      element.removeEventListener('timeupdate', onTimeUpdate)
      element.removeEventListener('error', onError)
      if (hls !== null) {
        const player = hls
        hls = null
        player.destroy()
      }
      // Removing the source alone only detaches listeners, so `load()` makes
      // the browser abort native resource selection and decoding.
      element.removeAttribute('src')
      element.load()
      Queue.endUnsafe(queue)
    }

    const attachment: Attachment = { handle, release }
    return attachment
  })

  return Effect.map(
    Effect.acquireRelease(acquire, (attachment) => Effect.sync(attachment.release)),
    (attachment) => attachment.handle,
  )
}
