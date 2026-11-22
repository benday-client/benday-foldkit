// SPDX-License-Identifier: GPL-3.0-only

import { QueryClient, type QueryClientConfig } from '@tanstack/query-core'
import { Effect, Fiber, Option, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { makeQueryCache } from './index.js'

const config: QueryClientConfig = {
  defaultOptions: { queries: { retry: false } },
}

interface Controlled<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

const controlled = <T>(): Controlled<T> => {
  const { promise, resolve } = Promise.withResolvers<T>()
  return { promise, resolve }
}

describe('makeQueryCache', () => {
  it('publishes the initial observer result', async () => {
    const gate = controlled<string>()
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const cache = yield* makeQueryCache(config)
          const head = yield* Stream.runHead(
            cache.observeQuery({
              queryKey: ['initial'],
              queryFn: () => gate.promise,
            }),
          )
          return Option.getOrThrow(head)
        }),
      ),
    )

    expect(result.status).toBe('pending')
    expect(result.fetchStatus).toBe('fetching')
  })

  it('shares one in-flight request between two observers of the same key', async () => {
    const gate = controlled<string>()
    let calls = 0

    const observed = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const cache = yield* makeQueryCache(config)
          const queryFn = (): Promise<string> => {
            calls += 1
            return gate.promise
          }
          const first = yield* Stream.runHead(
            cache.observeQuery({ queryKey: ['shared'], queryFn }),
          )
          const second = yield* Stream.runHead(
            cache.observeQuery({ queryKey: ['shared'], queryFn }),
          )
          return {
            first: Option.getOrThrow(first),
            second: Option.getOrThrow(second),
          }
        }),
      ),
    )

    expect(calls).toBe(1)
    expect(observed.first.status).toBe('pending')
    expect(observed.second.status).toBe('pending')
    gate.resolve('payload')
  })

  it('stops publishing after its stream scope closes', async () => {
    const gate = controlled<number>()
    let received = 0
    let observersAfterClose = -1

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const cache = yield* makeQueryCache(config)
          yield* cache
            .observeQuery({
              queryKey: ['unsubscribe'],
              queryFn: () => gate.promise,
            })
            .pipe(
              Stream.take(1),
              Stream.runForEach(() =>
                Effect.sync(() => {
                  received += 1
                }),
              ),
            )
          observersAfterClose =
            cache.client
              .getQueryCache()
              .find({ queryKey: ['unsubscribe'] })
              ?.getObserversCount() ?? -1
        }),
      ),
    )

    expect(received).toBe(1)
    expect(observersAfterClose).toBe(0)

    gate.resolve(42)
    await Promise.resolve()
    await Promise.resolve()
    expect(received).toBe(1)
  })

  it('mounts on acquisition and unmounts then clears on scope release', async () => {
    const mount = vi.spyOn(QueryClient.prototype, 'mount')
    const unmount = vi.spyOn(QueryClient.prototype, 'unmount')
    const clear = vi.spyOn(QueryClient.prototype, 'clear')
    try {
      const cache = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const service = yield* makeQueryCache(config)
            service.client.setQueryData(['scoped'], 'cached')
            expect(service.client.getQueryCache().getAll()).toHaveLength(1)
            return service
          }),
        ),
      )

      expect(mount).toHaveBeenCalledTimes(1)
      expect(unmount).toHaveBeenCalledTimes(1)
      expect(clear).toHaveBeenCalledTimes(1)
      expect(cache.client.getQueryCache().getAll()).toHaveLength(0)

      const unmountOrder = unmount.mock.invocationCallOrder.at(0) ?? 0
      const clearOrder = clear.mock.invocationCallOrder.at(0) ?? 0
      expect(unmountOrder).toBeLessThan(clearOrder)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('emits the native query hash when a cached query is removed', async () => {
    const observed = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const cache = yield* makeQueryCache(config)
          const fiber = yield* Stream.runHead(cache.removed).pipe(
            Effect.forkChild({ startImmediately: true }),
          )
          yield* Effect.yieldNow

          cache.client.setQueryData(['removed-query'], 'cached')
          const query = cache.client
            .getQueryCache()
            .find({ queryKey: ['removed-query'] })
          if (query === undefined) {
            throw new Error('expected the query to be cached')
          }
          const expectedHash = query.queryHash
          cache.client.getQueryCache().remove(query)

          const head = yield* Fiber.join(fiber)
          return { emitted: Option.getOrThrow(head), expectedHash }
        }),
      ),
    )

    expect(observed.emitted).toBe(observed.expectedHash)
    expect(observed.emitted).toBe('["removed-query"]')
  })
})
