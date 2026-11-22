// SPDX-License-Identifier: GPL-3.0-only
/**
 * Type-only contract for the AT Protocol read/write adapter.
 *
 * This module ships the shapes the rest of the workspace compiles against
 * before the implementation phase authorizes network code. It exports no
 * runtime function and performs no I/O, so importing it cannot pretend an
 * operation happened.
 */
import type { Effect } from 'effect'
import type { Agent, AtpAgent } from '@atproto/api'
import type {
  ActorSuggestion,
  FeedSource,
  NotificationPage,
  PinnedFeedModel,
  PostModel,
  ProfileModel,
  SearchActorModel,
  ThreadModel,
} from '@benday-client/bsky-model'
import type { ViewerState } from '@benday-client/bsky-model/interactions'

/** The active account changed or was superseded while work was in flight. */
export interface AccountChanged {
  readonly _tag: 'AccountChanged'
  readonly detail: string
}

/** A serializable projection of a transport failure, taken at the SDK edge. */
export interface TransportFailure {
  readonly _tag: 'TransportFailure'
  readonly title: string
  readonly detail: string
  readonly status: number | null
}

/** The caller asked for something the adapter refuses to send. */
export interface InvalidInput {
  readonly _tag: 'InvalidInput'
  readonly detail: string
}

/** Every expected failure of this package. Cancellation stays separate. */
export type BskyFailure = AccountChanged | TransportFailure | InvalidInput

/**
 * The capabilities a viewer-scoped client needs. The application owns session
 * storage, labeler policy and agent construction; this package only calls.
 */
export interface ViewerAccess {
  readonly publicAgent: Effect.Effect<AtpAgent>
  /** Fails before traffic when the active DID differs, and after each await. */
  readonly requireViewer: (viewerDid: string) => Effect.Effect<AtpAgent | Agent, AccountChanged>
  readonly labelers: Effect.Effect<readonly string[]>
}

export interface WriteResult {
  readonly uri: string
  readonly cid: string
}

export type PostRef = Pick<PostModel, 'uri' | 'cid'>

export type ReplyTarget = PostRef & { readonly replyRoot: PostRef | null }

export type FeedFeedbackEvent = 'more' | 'less'

export interface BskyClient {
  fetchFeedPage: (
    source: FeedSource,
    viewerDid: string | null,
    cursor?: string,
    limit?: number,
  ) => Effect.Effect<{ readonly posts: readonly PostModel[]; readonly cursor: string | null }, BskyFailure>

  fetchActorSuggestions: (query: string) => Effect.Effect<readonly ActorSuggestion[], BskyFailure>

  fetchActorSearch: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly SearchActorModel[], BskyFailure>

  fetchLabelerPrefsFor: (viewerDid: string) => Effect.Effect<readonly string[], BskyFailure>

  fetchPinnedFeeds: (viewerDid: string) => Effect.Effect<readonly PinnedFeedModel[], BskyFailure>

  fetchProfile: (
    actor: string,
    viewerDid: string | null,
  ) => Effect.Effect<ProfileModel, BskyFailure>

  fetchThread: (uri: string, viewerDid: string | null) => Effect.Effect<ThreadModel, BskyFailure>

  fetchNotifications: (viewerDid: string) => Effect.Effect<NotificationPage, BskyFailure>

  fetchViewerStates: (
    viewerDid: string,
    uris: readonly string[],
  ) => Effect.Effect<ReadonlyMap<string, ViewerState>, BskyFailure>

  createPost: (viewerDid: string, text: string) => Effect.Effect<WriteResult, BskyFailure>

  createReply: (
    viewerDid: string,
    text: string,
    target: ReplyTarget,
  ) => Effect.Effect<WriteResult, BskyFailure>

  likePost: (viewerDid: string, post: PostRef) => Effect.Effect<WriteResult, BskyFailure>

  repostPost: (viewerDid: string, post: PostRef) => Effect.Effect<WriteResult, BskyFailure>

  follow: (viewerDid: string, did: string) => Effect.Effect<WriteResult, BskyFailure>

  block: (viewerDid: string, did: string) => Effect.Effect<WriteResult, BskyFailure>

  deletePost: (viewerDid: string, uri: string) => Effect.Effect<void, BskyFailure>

  unlikePost: (viewerDid: string, uri: string) => Effect.Effect<void, BskyFailure>

  unrepostPost: (viewerDid: string, uri: string) => Effect.Effect<void, BskyFailure>

  unfollow: (viewerDid: string, uri: string) => Effect.Effect<void, BskyFailure>

  mute: (viewerDid: string, did: string) => Effect.Effect<void, BskyFailure>

  unmute: (viewerDid: string, did: string) => Effect.Effect<void, BskyFailure>

  unblock: (viewerDid: string, uri: string) => Effect.Effect<void, BskyFailure>

  sendFeedFeedback: (
    viewerDid: string,
    feedUri: string,
    generatorDid: string,
    post: Pick<PostModel, 'uri' | 'feedContext' | 'reqId'>,
    event: FeedFeedbackEvent,
  ) => Effect.Effect<void, BskyFailure>

  /** Best-effort: a rejected marker write reports `false`, never a failure. */
  markNotificationsSeen: (viewerDid: string, seenAt: string) => Effect.Effect<boolean>
}
