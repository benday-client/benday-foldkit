// SPDX-License-Identifier: GPL-3.0-only
/**
 * Type-only contract for browser password and OAuth session ownership.
 * The implementation phase supplies `makeSessionService`; until then this
 * module exports no constructor.
 */
import type { Effect, Redacted, Scope, Stream } from 'effect'
import type { Agent, AtpAgent } from '@atproto/api'
import type { AccountChanged } from '../index.js'

export interface SessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SessionConfig {
  readonly publicOrigin: string
  readonly hostedOauthClientId: string
  readonly scope: string
  readonly redirectPath: string
  readonly resolverOrigin: string
  readonly fallbackPds: string
  readonly fetch: typeof globalThis.fetch
  readonly storage: SessionStorage
  readonly sessionKey: string
  readonly signedOutKey: string
}

/** Only serializable facts cross into the application model. */
export interface AuthSnapshot {
  readonly status: 'signedOut' | 'restoring' | 'authenticated' | 'failed'
  readonly account: { readonly did: string; readonly handle: string } | null
  readonly pending: 'password' | 'portal' | null
  readonly error: string | null
  readonly restoreError: string | null
  readonly epoch: number
}

export interface AuthenticationRejected {
  readonly _tag: 'AuthenticationRejected'
  readonly detail: string
}

export interface RestoreFailed {
  readonly _tag: 'RestoreFailed'
  readonly detail: string
}

export interface RedirectFailed {
  readonly _tag: 'RedirectFailed'
  readonly detail: string
}

export type AuthFailure = AuthenticationRejected | RestoreFailed | RedirectFailed

export interface SessionService {
  readonly changes: Stream.Stream<AuthSnapshot>
  readonly snapshot: Effect.Effect<AuthSnapshot>
  readonly restore: Effect.Effect<void, AuthFailure>
  readonly signIn: (
    identifier: string,
    password: Redacted.Redacted,
  ) => Effect.Effect<boolean, AuthFailure>
  readonly beginPortal: (identifier: string) => Effect.Effect<void, AuthFailure>
  readonly signOut: Effect.Effect<void>
  readonly clearError: Effect.Effect<void>
  readonly requireViewer: (viewerDid: string) => Effect.Effect<AtpAgent | Agent, AccountChanged>
}

export type SessionServiceError = never
export type SessionServiceScope = Scope.Scope
