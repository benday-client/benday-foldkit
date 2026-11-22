// SPDX-License-Identifier: GPL-3.0-only

import {
  InfiniteQueryObserver,
  QueryClient,
  QueryObserver,
  type DefaultError,
  type InfiniteData,
  type InfiniteQueryObserverOptions,
  type InfiniteQueryObserverResult,
  type QueryClientConfig,
  type QueryKey,
  type QueryObserverOptions,
  type QueryObserverResult,
} from '@tanstack/query-core'
import { Effect, Queue, Stream, type Scope } from 'effect'

/**
 * A scoped owner of one native TanStack `QueryClient`.
 *
 * The client is mounted on acquisition and unmounted plus cleared when the
 * surrounding scope closes. Every observer stream owns exactly one native
 * observer and releases it when its own stream scope ends.
 */
export interface QueryCache {
  /** The single native client owned by this service value. */
  readonly client: QueryClient
  /** Native query hashes of entries removed from the client's query cache. */
  readonly removed: Stream.Stream<string>
  observeQuery<
    TQueryFnData = unknown,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
  ): Stream.Stream<QueryObserverResult<TData, TError>>
  observeInfiniteQuery<
    TQueryFnData = unknown,
    TError = DefaultError,
    TData = InfiniteData<TQueryFnData>,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  ): Stream.Stream<InfiniteQueryObserverResult<TData, TError>>
}

const removedQueries = (client: QueryClient): Stream.Stream<string> =>
  Stream.callback<string>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        client.getQueryCache().subscribe((event) => {
          if (event.type === 'removed') {
            Queue.offerUnsafe(queue, event.query.queryHash)
          }
        }),
      ),
      (unsubscribe) => Effect.sync(() => unsubscribe()),
    ),
  )

const observeNativeQuery = <
  TQueryFnData,
  TError,
  TData,
  TQueryData,
  TQueryKey extends QueryKey,
>(
  client: QueryClient,
  options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
): Stream.Stream<QueryObserverResult<TData, TError>> =>
  Stream.callback<QueryObserverResult<TData, TError>>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new QueryObserver<
          TQueryFnData,
          TError,
          TData,
          TQueryData,
          TQueryKey
        >(client, options)
        let notified = false
        const unsubscribe = observer.subscribe((result) => {
          notified = true
          Queue.offerUnsafe(queue, result)
        })
        // `subscribe` starts the initial fetch or computes the current result
        // when no fetch is required. Publish the current result exactly once
        // even when the subscription itself did not notify synchronously.
        observer.updateResult()
        if (!notified) {
          Queue.offerUnsafe(queue, observer.getCurrentResult())
        }
        return { observer, unsubscribe }
      }),
      ({ observer, unsubscribe }) =>
        Effect.sync(() => {
          unsubscribe()
          observer.destroy()
        }),
    ),
  )

const observeNativeInfiniteQuery = <
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
  TPageParam,
>(
  client: QueryClient,
  options: InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
): Stream.Stream<InfiniteQueryObserverResult<TData, TError>> =>
  Stream.callback<InfiniteQueryObserverResult<TData, TError>>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new InfiniteQueryObserver<
          TQueryFnData,
          TError,
          TData,
          TQueryKey,
          TPageParam
        >(client, options)
        let notified = false
        const unsubscribe = observer.subscribe((result) => {
          notified = true
          Queue.offerUnsafe(queue, result)
        })
        observer.updateResult()
        if (!notified) {
          Queue.offerUnsafe(queue, observer.getCurrentResult())
        }
        return { observer, unsubscribe }
      }),
      ({ observer, unsubscribe }) =>
        Effect.sync(() => {
          unsubscribe()
          observer.destroy()
        }),
    ),
  )

/**
 * Acquires one native query client and its query-removal stream.
 *
 * Releasing the scope unmounts the client and clears its caches; observer
 * streams always release their own observers when their stream scope ends.
 */
export const makeQueryCache = (
  config: QueryClientConfig,
): Effect.Effect<QueryCache, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const client = new QueryClient(config)
      client.mount()
      return client
    }),
    (client) =>
      Effect.sync(() => {
        client.unmount()
        client.clear()
      }),
  ).pipe(
    Effect.map(
      (client): QueryCache => ({
        client,
        removed: removedQueries(client),
        observeQuery: <
          TQueryFnData = unknown,
          TError = DefaultError,
          TData = TQueryFnData,
          TQueryData = TQueryFnData,
          TQueryKey extends QueryKey = QueryKey,
        >(
          options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
        ): Stream.Stream<QueryObserverResult<TData, TError>> =>
          observeNativeQuery(client, options),
        observeInfiniteQuery: <
          TQueryFnData = unknown,
          TError = DefaultError,
          TData = InfiniteData<TQueryFnData>,
          TQueryKey extends QueryKey = QueryKey,
          TPageParam = unknown,
        >(
          options: InfiniteQueryObserverOptions<
            TQueryFnData,
            TError,
            TData,
            TQueryKey,
            TPageParam
          >,
        ): Stream.Stream<InfiniteQueryObserverResult<TData, TError>> =>
          observeNativeInfiniteQuery(client, options),
      }),
    ),
  )
