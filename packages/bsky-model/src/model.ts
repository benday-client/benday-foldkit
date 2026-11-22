// SPDX-License-Identifier: GPL-3.0-only
import {
  type AppBskyActorDefs,
  AppBskyEmbedExternal,
  AppBskyEmbedGallery,
  AppBskyEmbedImages,
  AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyEmbedVideo,
  AppBskyFeedDefs,
  type ComAtprotoLabelDefs,
} from '@atproto/api'
import type { FacetSpan } from '@benday-client/richtext'
import { Schema } from 'effect'

const MAX_THREAD_ENTRIES = 80

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * A parsed or persisted JSON object. Arrays are excluded: every guarded value
 * in this package is a keyed record, so an array is never a valid value here.
 * Field validation stays with each caller.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** SDK viewer fields report absence as either null or undefined. */
function present(value: unknown): boolean {
  return value !== null && value !== undefined
}

type EmbedView = NonNullable<AppBskyFeedDefs.PostView['embed']>
type QuotedRecord = AppBskyEmbedRecord.View['record']
type AspectRatio = { readonly width: number; readonly height: number }

export const StrongRefModel = Schema.Struct({
  uri: Schema.String,
  cid: Schema.String,
})
export type StrongRefModel = typeof StrongRefModel.Type

export const AuthorModel = Schema.Struct({
  did: Schema.String,
  handle: Schema.String,
  displayName: Schema.String,
  avatar: Schema.NullOr(Schema.String),
  muted: Schema.Boolean,
  blocked: Schema.Boolean,
})
export type AuthorModel = typeof AuthorModel.Type

export const SearchActorModel = Schema.Struct({
  did: Schema.String,
  handle: Schema.String,
  displayName: Schema.String,
  avatar: Schema.NullOr(Schema.String),
  description: Schema.String,
})
export type SearchActorModel = typeof SearchActorModel.Type

export const ActorSuggestion = Schema.Struct({
  did: Schema.String,
  handle: Schema.String,
  displayName: Schema.String,
  avatar: Schema.NullOr(Schema.String),
})
export type ActorSuggestion = typeof ActorSuggestion.Type

/**
 * The neutral richtext feature shape, mirrored as a schema so mapped values can
 * be checked without depending on the SDK's wire types. The public
 * `FacetFeature`/`FacetSpan` types come from `@benday-client/richtext`.
 */
export const FacetFeatureSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('mention'),
    did: Schema.String,
    handle: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('link'),
    uri: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('tag'),
    tag: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal('bold') }),
  Schema.Struct({ kind: Schema.Literal('italic') }),
  Schema.Struct({ kind: Schema.Literal('strikethrough') }),
  Schema.Struct({ kind: Schema.Literal('code') }),
  Schema.Struct({
    kind: Schema.Literal('unknown'),
    typeName: Schema.String,
  }),
])

export const FacetSpanSchema = Schema.Struct({
  start: Schema.Number,
  end: Schema.Number,
  feature: FacetFeatureSchema,
})

export const ImageModel = Schema.Struct({
  thumb: Schema.String,
  fullsize: Schema.String,
  alt: Schema.String,
  width: Schema.NullOr(Schema.Number),
  height: Schema.NullOr(Schema.Number),
})
export type ImageModel = typeof ImageModel.Type

export const ImageEmbed = Schema.Struct({
  type: Schema.Literal('images'),
  images: Schema.Array(ImageModel),
})
export type ImageEmbed = typeof ImageEmbed.Type

export const ExternalEmbed = Schema.Struct({
  type: Schema.Literal('external'),
  uri: Schema.String,
  title: Schema.String,
  description: Schema.String,
  thumb: Schema.NullOr(Schema.String),
  domain: Schema.String,
})
export type ExternalEmbed = typeof ExternalEmbed.Type

export const QuotedPostModel = Schema.Struct({
  uri: Schema.String,
  cid: Schema.String,
  author: AuthorModel,
  text: Schema.String,
  facets: Schema.Array(FacetSpanSchema),
  indexedAt: Schema.String,
  embedType: Schema.NullOr(Schema.String),
})
export type QuotedPostModel = typeof QuotedPostModel.Type

export const QuoteEmbed = Schema.Struct({
  type: Schema.Literal('quote'),
  post: QuotedPostModel,
})
export type QuoteEmbed = typeof QuoteEmbed.Type

export const VideoEmbed = Schema.Struct({
  type: Schema.Literal('video'),
  thumbnail: Schema.NullOr(Schema.String),
  alt: Schema.String,
  playlist: Schema.NullOr(Schema.String),
})
export type VideoEmbed = typeof VideoEmbed.Type

export const UnknownEmbed = Schema.Struct({
  type: Schema.Literal('unknown'),
  typeName: Schema.String,
})
export type UnknownEmbed = typeof UnknownEmbed.Type

export const MediaEmbed = Schema.Union([ImageEmbed, ExternalEmbed, VideoEmbed, UnknownEmbed])
export type MediaEmbed = typeof MediaEmbed.Type

export const UnavailableEmbed = Schema.Struct({
  type: Schema.Literal('unavailable'),
  reason: Schema.Literals(['blocked', 'notFound', 'detached']),
  uri: Schema.String,
  label: Schema.String,
})
export type UnavailableEmbed = typeof UnavailableEmbed.Type

export const RecordWithMediaEmbed = Schema.Struct({
  type: Schema.Literal('recordWithMedia'),
  quote: QuotedPostModel,
  media: MediaEmbed,
})
export type RecordWithMediaEmbed = typeof RecordWithMediaEmbed.Type

export const EmbedModel = Schema.Union([
  MediaEmbed,
  QuoteEmbed,
  UnavailableEmbed,
  RecordWithMediaEmbed,
])
export type EmbedModel = typeof EmbedModel.Type

export const PostReason = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('repost'),
    by: AuthorModel,
  }),
  Schema.Struct({ type: Schema.Literal('pin') }),
])
export type PostReason = typeof PostReason.Type

export const PinnedFeedModel = Schema.Struct({
  uri: Schema.String,
  name: Schema.String,
  description: Schema.String,
  avatar: Schema.NullOr(Schema.String),
  /** the feed generator's service DID, the target for feedback */
  generatorDid: Schema.NullOr(Schema.String),
  /** null when the generator record could not be resolved */
  acceptsInteractions: Schema.NullOr(Schema.Boolean),
})
export type PinnedFeedModel = typeof PinnedFeedModel.Type

export const ReplyContextModel = Schema.Struct({
  uri: Schema.String,
  cid: Schema.String,
  author: AuthorModel,
  text: Schema.String,
  facets: Schema.Array(FacetSpanSchema),
  indexedAt: Schema.String,
})
export type ReplyContextModel = typeof ReplyContextModel.Type

export const PostModel = Schema.Struct({
  uri: Schema.String,
  cid: Schema.String,
  author: AuthorModel,
  text: Schema.String,
  facets: Schema.Array(FacetSpanSchema),
  indexedAt: Schema.String,
  replyCount: Schema.Number,
  repostCount: Schema.Number,
  likeCount: Schema.Number,
  quoteCount: Schema.Number,
  embed: Schema.NullOr(EmbedModel),
  reason: Schema.NullOr(PostReason),
  isReply: Schema.Boolean,
  replyRoot: Schema.NullOr(StrongRefModel),
  replyParent: Schema.NullOr(StrongRefModel),
  replyContext: Schema.NullOr(ReplyContextModel),
  labels: Schema.Array(Schema.String),
  feedContext: Schema.optionalKey(Schema.String),
  reqId: Schema.optionalKey(Schema.String),
})
export type PostModel = typeof PostModel.Type

export const ProfileLink = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
})
export type ProfileLink = typeof ProfileLink.Type

export const ProfileActivitySubscription = Schema.Struct({
  post: Schema.Boolean,
  reply: Schema.Boolean,
})
export type ProfileActivitySubscription = typeof ProfileActivitySubscription.Type

export const ProfileViewerState = Schema.Struct({
  following: Schema.NullOr(Schema.String),
  followedBy: Schema.NullOr(Schema.String),
  muted: Schema.Boolean,
  mutedOnlyReposts: Schema.Boolean,
  mutedOnlyQuoteposts: Schema.Boolean,
  blocking: Schema.NullOr(Schema.String),
  blockedBy: Schema.Boolean,
  activitySubscription: Schema.NullOr(ProfileActivitySubscription),
})
export type ProfileViewerState = typeof ProfileViewerState.Type

export const ProfileModel = Schema.Struct({
  did: Schema.String,
  handle: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  pronouns: Schema.String,
  avatar: Schema.NullOr(Schema.String),
  banner: Schema.NullOr(Schema.String),
  followersCount: Schema.Number,
  followsCount: Schema.Number,
  postsCount: Schema.Number,
  createdAt: Schema.NullOr(Schema.String),
  labels: Schema.Array(Schema.String),
  links: Schema.Array(ProfileLink),
  isBot: Schema.Boolean,
  viewer: ProfileViewerState,
})
export type ProfileModel = typeof ProfileModel.Type

export const ThreadEntry = Schema.Struct({
  post: PostModel,
  depth: Schema.Number,
  role: Schema.Literals(['ancestor', 'focus', 'reply']),
})
export type ThreadEntry = typeof ThreadEntry.Type

export const ThreadModel = Schema.Struct({
  focusUri: Schema.String,
  entries: Schema.Array(ThreadEntry),
})
export type ThreadModel = typeof ThreadModel.Type

export const FeedSource = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('author'),
    actor: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('search'),
    query: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('feed'),
    uri: Schema.String,
  }),
])
export type FeedSource = typeof FeedSource.Type

function rawTypeName(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('$type' in value)) return null
  const type = value.$type
  return typeof type === 'string' && type.length > 0 ? type : null
}

function typeNameOf(value: unknown): string {
  return rawTypeName(value) ?? 'unknown'
}

interface ReplyRefs {
  readonly root: StrongRefModel
  readonly parent: StrongRefModel
}

/** The only parts of a post record this client reads, narrowed from unknown. */
interface ParsedPostRecord {
  readonly text: string
  // still unknown: mapFacets owns the facet shape
  readonly facets: unknown
  readonly reply: ReplyRefs | null
}

function readStrongRef(value: unknown): StrongRefModel | null {
  if (!isRecord(value)) return null
  const uri = value['uri']
  const cid = value['cid']
  if (typeof uri !== 'string' || typeof cid !== 'string') return null
  if (uri.length === 0 || cid.length === 0) return null
  return { uri, cid }
}

function readReplyRefs(value: unknown): ReplyRefs | null {
  if (!isRecord(value)) return null
  const root = readStrongRef(value['root'])
  const parent = readStrongRef(value['parent'])
  // a reply needs both references; half of one is not a thread position
  if (root === null || parent === null) return null
  return { root, parent }
}

/**
 * `record` and a quoted `value` are lexicon `unknown`: the sdk validates the
 * outer response, not the post body. Project the fields this client renders and
 * leave anything malformed empty rather than asserting the full sdk record.
 */
function readPostRecord(value: unknown): ParsedPostRecord | null {
  if (!isRecord(value) || value['$type'] !== 'app.bsky.feed.post') return null
  const text = value['text']
  return {
    text: typeof text === 'string' ? text : '',
    facets: value['facets'],
    reply: readReplyRefs(value['reply']),
  }
}

type AuthorView = AppBskyActorDefs.ProfileViewBasic | AppBskyActorDefs.ProfileView

export function mapAuthor(author: AuthorView): AuthorModel {
  const viewer = author.viewer
  return {
    did: author.did,
    handle: author.handle,
    displayName: author.displayName ?? '',
    avatar: author.avatar ?? null,
    muted: viewer?.muted === true || present(viewer?.mutedByList),
    blocked:
      viewer?.blockedBy === true || present(viewer?.blocking) || present(viewer?.blockingByList),
  }
}

/** a muted or blocked account does not get a card, a reply or a notification */
export function hidesAuthor(author: AuthorModel): boolean {
  return author.muted || author.blocked
}

function mapImage(
  thumb: string,
  fullsize: string,
  alt: string,
  ratio: AspectRatio | undefined,
): ImageModel {
  return {
    thumb,
    fullsize,
    alt,
    width: ratio?.width ?? null,
    height: ratio?.height ?? null,
  }
}

function domainOf(uri: string): string {
  try {
    return new URL(uri).hostname
  } catch {
    return ''
  }
}

function readFeatureSpan(
  feature: unknown,
  bytes: Uint8Array,
  start: number,
  end: number,
): FacetSpan | null {
  if (!isRecord(feature)) return null
  const type = feature['$type']

  if (type === 'app.bsky.richtext.facet#mention') {
    const did = feature['did']
    if (typeof did !== 'string') return null
    const slice = decoder.decode(bytes.slice(start, end))
    const withoutPrefix = slice.startsWith('@') ? slice.slice(1) : slice
    const handle = withoutPrefix.trim()
    const resolved = handle.length > 0 ? handle : did
    return { start, end, feature: { kind: 'mention', did, handle: resolved } }
  }

  if (type === 'app.bsky.richtext.facet#link') {
    const uri = feature['uri']
    if (typeof uri !== 'string') return null
    return { start, end, feature: { kind: 'link', uri } }
  }

  if (type === 'app.bsky.richtext.facet#tag') {
    const tag = feature['tag']
    if (typeof tag !== 'string') return null
    return { start, end, feature: { kind: 'tag', tag } }
  }

  if (type === 'app.bsky.richtext.facet#bold') return { start, end, feature: { kind: 'bold' } }
  if (type === 'app.bsky.richtext.facet#italic') return { start, end, feature: { kind: 'italic' } }
  if (type === 'app.bsky.richtext.facet#strikethrough') {
    return { start, end, feature: { kind: 'strikethrough' } }
  }
  if (type === 'app.bsky.richtext.facet#code') return { start, end, feature: { kind: 'code' } }

  // an unknown or missing type is still worth naming so the renderer can skip it
  return { start, end, feature: { kind: 'unknown', typeName: typeNameOf(feature) } }
}

/**
 * Facets are opaque too, so every level is checked here: the array, each
 * facet's integer byte range and its feature list, then each typed payload.
 * A malformed facet or feature is ignored without discarding the post text.
 */
export function mapFacets(facets: unknown, text: string): readonly FacetSpan[] {
  if (!Array.isArray(facets)) return []
  const bytes = encoder.encode(text)
  const spans: FacetSpan[] = []

  for (const facet of facets) {
    if (!isRecord(facet)) continue
    const index = facet['index']
    if (!isRecord(index)) continue
    const byteStart = index['byteStart']
    const byteEnd = index['byteEnd']
    if (typeof byteStart !== 'number' || typeof byteEnd !== 'number') continue
    if (!Number.isInteger(byteStart) || !Number.isInteger(byteEnd)) continue
    if (byteStart < 0 || byteEnd <= byteStart || byteEnd > bytes.length) continue

    const features = facet['features']
    if (!Array.isArray(features)) continue

    for (const feature of features) {
      const span = readFeatureSpan(feature, bytes, byteStart, byteEnd)
      if (span !== null) spans.push(span)
    }
  }

  return spans
}

function mapQuotedRecord(record: QuotedRecord): QuoteEmbed | UnavailableEmbed | UnknownEmbed {
  if (AppBskyEmbedRecord.isViewBlocked(record)) {
    return { type: 'unavailable', reason: 'blocked', uri: record.uri, label: 'blocked post' }
  }
  if (AppBskyEmbedRecord.isViewNotFound(record)) {
    return { type: 'unavailable', reason: 'notFound', uri: record.uri, label: 'post not found' }
  }
  if (AppBskyEmbedRecord.isViewDetached(record)) {
    return { type: 'unavailable', reason: 'detached', uri: record.uri, label: 'detached post' }
  }
  if (!AppBskyEmbedRecord.isViewRecord(record)) {
    return { type: 'unknown', typeName: typeNameOf(record) }
  }

  const value = readPostRecord(record.value)
  if (value === null) {
    return { type: 'unknown', typeName: typeNameOf(record.value) }
  }

  const quoted: QuotedPostModel = {
    uri: record.uri,
    cid: record.cid,
    author: mapAuthor(record.author),
    text: value.text,
    facets: mapFacets(value.facets, value.text),
    indexedAt: record.indexedAt,
    embedType: rawTypeName(record.embeds?.[0]),
  }
  return { type: 'quote', post: quoted }
}

function isMediaEmbed(embed: EmbedModel): embed is MediaEmbed {
  return (
    embed.type === 'images' ||
    embed.type === 'external' ||
    embed.type === 'video' ||
    embed.type === 'unknown'
  )
}

function mapEmbed(embed: EmbedView): EmbedModel | null {
  if (AppBskyEmbedImages.isView(embed)) {
    const images: ImageEmbed = {
      type: 'images',
      images: embed.images.map((image) =>
        mapImage(image.thumb, image.fullsize, image.alt, image.aspectRatio),
      ),
    }
    return images
  }

  if (AppBskyEmbedGallery.isView(embed)) {
    return {
      type: 'images',
      images: embed.items.flatMap((item) =>
        AppBskyEmbedGallery.isViewImage(item)
          ? [mapImage(item.thumbnail, item.fullsize, item.alt, item.aspectRatio)]
          : [],
      ),
    }
  }

  if (AppBskyEmbedExternal.isView(embed)) {
    const external: ExternalEmbed = {
      type: 'external',
      uri: embed.external.uri,
      title: embed.external.title,
      description: embed.external.description,
      thumb: embed.external.thumb ?? null,
      domain: domainOf(embed.external.uri),
    }
    return external
  }

  if (AppBskyEmbedVideo.isView(embed)) {
    return {
      type: 'video',
      thumbnail: embed.thumbnail ?? null,
      alt: embed.alt ?? '',
      playlist:
        typeof embed.playlist === 'string' && embed.playlist.length > 0 ? embed.playlist : null,
    }
  }

  if (AppBskyEmbedRecord.isView(embed)) {
    const quote = mapQuotedRecord(embed.record)
    // a quote of a muted or blocked account is not shown at all
    if (quote.type === 'quote' && hidesAuthor(quote.post.author)) return null
    return quote
  }

  if (AppBskyEmbedRecordWithMedia.isView(embed)) {
    const quote = mapQuotedRecord(embed.record.record)
    const media = mapEmbed(embed.media)
    if (quote.type === 'unavailable') return quote
    if (quote.type === 'quote' && hidesAuthor(quote.post.author)) {
      return media !== null && isMediaEmbed(media) ? media : null
    }
    if (quote.type === 'quote' && media !== null && isMediaEmbed(media)) {
      return { type: 'recordWithMedia', quote: quote.post, media }
    }
    return { type: 'unknown', typeName: typeNameOf(embed) }
  }

  return { type: 'unknown', typeName: typeNameOf(embed) }
}

function mapReason(reason: AppBskyFeedDefs.FeedViewPost['reason']): PostReason | null {
  if (!reason) return null
  if (AppBskyFeedDefs.isReasonRepost(reason)) {
    return { type: 'repost', by: mapAuthor(reason.by) }
  }
  if (AppBskyFeedDefs.isReasonPin(reason)) {
    return { type: 'pin' }
  }
  return null
}

function mapReplyContext(view: AppBskyFeedDefs.PostView): ReplyContextModel {
  const record = readPostRecord(view.record)
  const text = record?.text ?? ''

  return {
    uri: view.uri,
    cid: view.cid,
    author: mapAuthor(view.author),
    text,
    facets: mapFacets(record?.facets, text),
    indexedAt: view.indexedAt,
  }
}

export function mapPostView(view: AppBskyFeedDefs.PostView): PostModel {
  const record = readPostRecord(view.record)
  const text = record?.text ?? ''
  const reply = record?.reply ?? null

  return {
    uri: view.uri,
    cid: view.cid,
    author: mapAuthor(view.author),
    text,
    facets: mapFacets(record?.facets, text),
    indexedAt: view.indexedAt,
    replyCount: view.replyCount ?? 0,
    repostCount: view.repostCount ?? 0,
    likeCount: view.likeCount ?? 0,
    quoteCount: view.quoteCount ?? 0,
    embed: view.embed ? mapEmbed(view.embed) : null,
    reason: null,
    isReply: reply !== null,
    replyRoot: reply?.root ?? null,
    replyParent: reply?.parent ?? null,
    replyContext: null,
    labels: readLabels(view.labels),
  }
}

function replyContextFromPost(post: PostModel): ReplyContextModel {
  return {
    uri: post.uri,
    cid: post.cid,
    author: post.author,
    text: post.text,
    facets: post.facets,
    indexedAt: post.indexedAt,
  }
}

export function mapFeedViewPost(view: AppBskyFeedDefs.FeedViewPost): PostModel {
  const parent = view.reply?.parent
  const replyContext =
    parent !== undefined && AppBskyFeedDefs.isPostView(parent) ? mapReplyContext(parent) : null

  return {
    ...mapPostView(view.post),
    reason: mapReason(view.reason),
    replyContext,
    ...(view.feedContext !== undefined ? { feedContext: view.feedContext } : {}),
    ...(view.reqId !== undefined ? { reqId: view.reqId } : {}),
  }
}

// a retracted label (neg) must stop rendering, and a malformed value must not
// stand in for one; chips key on the value, so a repeated value renders once
function readLabels(labels: readonly ComAtprotoLabelDefs.Label[] | undefined): string[] {
  const values: string[] = []
  const seen = new Set<string>()
  for (const label of labels ?? []) {
    if (label.neg === true) continue
    if (typeof label.val !== 'string') continue
    if (seen.has(label.val)) continue
    seen.add(label.val)
    values.push(label.val)
  }
  return values
}

export function mapProfileViewer(
  viewer: AppBskyActorDefs.ProfileViewDetailed['viewer'] | null,
): ProfileViewerState {
  return {
    following: viewer?.following ?? null,
    followedBy: viewer?.followedBy ?? null,
    muted: viewer?.muted ?? false,
    mutedOnlyReposts: viewer?.mutedOnlyReposts ?? false,
    mutedOnlyQuoteposts: viewer?.mutedOnlyQuoteposts ?? false,
    blocking: viewer?.blocking ?? null,
    blockedBy: viewer?.blockedBy ?? false,
    activitySubscription:
      viewer?.activitySubscription === undefined
        ? null
        : {
            post: viewer.activitySubscription.post,
            reply: viewer.activitySubscription.reply,
          },
  }
}

export function mapProfile(view: AppBskyActorDefs.ProfileViewDetailed): ProfileModel {
  const labels = readLabels(view.labels)
  const isBot = labels.some((label) => label.toLowerCase() === 'bot')

  return {
    did: view.did,
    handle: view.handle,
    displayName: view.displayName ?? '',
    description: view.description ?? '',
    pronouns: view.pronouns ?? '',
    avatar: view.avatar ?? null,
    banner: view.banner ?? null,
    followersCount: view.followersCount ?? 0,
    followsCount: view.followsCount ?? 0,
    postsCount: view.postsCount ?? 0,
    createdAt: view.createdAt ?? null,
    labels,
    links: (view.links ?? []).map((link) => ({
      url: link.url,
      title: link.title ?? '',
    })),
    isBot,
    viewer: mapProfileViewer(view.viewer ?? null),
  }
}

const EMPTY_HIDDEN: ReadonlySet<string> = new Set<string>()

function collectReplies(
  replies: AppBskyFeedDefs.ThreadViewPost['replies'],
  depth: number,
  entries: ThreadEntry[],
  hidden: ReadonlySet<string>,
): void {
  if (!replies) return
  for (const reply of replies) {
    if (!AppBskyFeedDefs.isThreadViewPost(reply)) continue
    const post = mapPostView(reply.post)
    // a hidden author takes their subtree with them
    if (hidesAuthor(post.author) || hidden.has(post.author.did)) continue
    // hidden replies are skipped before the cap so they cannot crowd out
    // replies the reader can actually see
    if (entries.length >= MAX_THREAD_ENTRIES) return
    entries.push({ post, depth, role: 'reply' })
    collectReplies(reply.replies, depth + 1, entries, hidden)
  }
}

/**
 * Every author a reader must resolve moderation state for: the post's own
 * author, its repost author, the reply context it carries, and its quote.
 */
export function postAuthorDids(post: PostModel): readonly string[] {
  const dids: string[] = [post.author.did]
  if (post.reason?.type === 'repost') dids.push(post.reason.by.did)
  if (post.replyContext !== null) dids.push(post.replyContext.author.did)
  if (post.embed?.type === 'quote') dids.push(post.embed.post.author.did)
  if (post.embed?.type === 'recordWithMedia') dids.push(post.embed.quote.author.did)
  return dids
}

/**
 * Every author in the raw thread tree, including nested quote and reply-context
 * authors. The focus post's own author is included too, but flattenThread keeps
 * the deliberately opened focus post regardless.
 */
export function threadAuthorDids(thread: AppBskyFeedDefs.ThreadViewPost): readonly string[] {
  const dids = new Set<string>()

  const addNode = (node: AppBskyFeedDefs.ThreadViewPost): void => {
    for (const did of postAuthorDids(mapPostView(node.post))) dids.add(did)
  }

  addNode(thread)

  let cursor = thread.parent
  while (cursor) {
    if (!AppBskyFeedDefs.isThreadViewPost(cursor)) break
    addNode(cursor)
    cursor = cursor.parent
  }

  const addReplies = (replies: AppBskyFeedDefs.ThreadViewPost['replies']): void => {
    for (const reply of replies ?? []) {
      if (!AppBskyFeedDefs.isThreadViewPost(reply)) continue
      addNode(reply)
      addReplies(reply.replies)
    }
  }
  addReplies(thread.replies)

  return [...dids]
}

/**
 * A post that survives canonical moderation must not still point at a hidden
 * account through its reply context or quote. A record-with-media keeps its
 * media when only the quoted post is hidden.
 */
export function pruneHiddenPost(post: PostModel, hidden: ReadonlySet<string>): PostModel {
  const replyContext =
    post.replyContext !== null && hidden.has(post.replyContext.author.did)
      ? null
      : post.replyContext

  let embed = post.embed
  if (embed !== null) {
    if (embed.type === 'quote' && hidden.has(embed.post.author.did)) {
      embed = null
    } else if (embed.type === 'recordWithMedia' && hidden.has(embed.quote.author.did)) {
      embed = embed.media
    }
  }

  if (replyContext === post.replyContext && embed === post.embed) return post
  return { ...post, replyContext, embed }
}

export function flattenThread(
  thread: AppBskyFeedDefs.ThreadViewPost,
  hidden: ReadonlySet<string> = EMPTY_HIDDEN,
): ThreadModel {
  const ancestors: AppBskyFeedDefs.ThreadViewPost[] = []
  let cursor = thread.parent
  while (cursor) {
    if (!AppBskyFeedDefs.isThreadViewPost(cursor)) break
    ancestors.push(cursor)
    cursor = cursor.parent
  }

  const entries: ThreadEntry[] = []
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (!ancestor) continue
    const post = mapPostView(ancestor.post)
    if (hidesAuthor(post.author) || hidden.has(post.author.did)) continue
    entries.push({ post, depth: -(index + 1), role: 'ancestor' })
  }

  // the reader opened the focus post on purpose, so it stays even when its
  // author is hidden; only its nested content is pruned
  entries.push({ post: mapPostView(thread.post), depth: 0, role: 'focus' })
  collectReplies(thread.replies, 1, entries, hidden)

  // reply contexts come only from entries that survived moderation
  const byUri = new Map(entries.map((entry) => [entry.post.uri, entry.post]))
  const withContext = entries.map((entry) => {
    const parentUri = entry.post.replyParent?.uri
    const parent = parentUri === undefined ? undefined : byUri.get(parentUri)
    const post =
      parent === undefined
        ? entry.post
        : { ...entry.post, replyContext: replyContextFromPost(parent) }
    return { ...entry, post: pruneHiddenPost(post, hidden) }
  })

  return { focusUri: thread.post.uri, entries: withContext }
}
