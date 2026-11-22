// SPDX-License-Identifier: GPL-3.0-only
import type {
  AppBskyActorDefs,
  AppBskyEmbedRecord,
  AppBskyFeedDefs,
  AppBskyNotificationListNotifications,
  AppBskyRichtextFacet,
  ComAtprotoLabelDefs,
} from '@atproto/api'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  PostModel,
  ProfileModel,
  flattenThread,
  mapFacets,
  mapFeedViewPost,
  mapNotification,
  mapPostView,
  mapProfile,
  notificationReasonGroup,
  notificationReasonLabel,
  postAuthorDids,
  threadAuthorDids,
} from './index.js'

const INDEXED_AT = '2026-01-01T00:00:00.000Z'
const QUOTED_AT = '2026-01-02T00:00:00.000Z'
const HIDDEN_DID = 'did:plc:hidden'
const encoder = new TextEncoder()

function byteRange(text: string, needle: string): { byteStart: number; byteEnd: number } {
  const index = text.indexOf(needle)
  if (index < 0) throw new Error(`missing substring: ${needle}`)
  const byteStart = encoder.encode(text.slice(0, index)).length
  return { byteStart, byteEnd: byteStart + encoder.encode(needle).length }
}

function facetAt(
  text: string,
  needle: string,
  features: AppBskyRichtextFacet.Main['features'],
): AppBskyRichtextFacet.Main {
  return { index: byteRange(text, needle), features }
}

function mentionFacet(text: string, needle: string, did: string): AppBskyRichtextFacet.Main {
  return facetAt(text, needle, [{ $type: 'app.bsky.richtext.facet#mention', did }])
}

function label(val: string, neg = false): ComAtprotoLabelDefs.Label {
  return {
    $type: 'com.atproto.label.defs#label',
    src: 'did:plc:labels.example',
    uri: 'at://did:plc:ada/app.bsky.feed.post/1',
    val,
    neg,
    cts: INDEXED_AT,
  }
}

function profileBasic(
  overrides: Partial<AppBskyActorDefs.ProfileViewBasic> = {},
): AppBskyActorDefs.ProfileViewBasic {
  const base: AppBskyActorDefs.ProfileViewBasic = {
    $type: 'app.bsky.actor.defs#profileViewBasic',
    did: 'did:plc:ada',
    handle: 'ada.world',
    displayName: 'ada',
    avatar: 'https://cdn.example/ada.png',
  }
  return { ...base, ...overrides }
}

function profileView(
  overrides: Partial<AppBskyActorDefs.ProfileView> = {},
): AppBskyActorDefs.ProfileView {
  const base: AppBskyActorDefs.ProfileView = {
    $type: 'app.bsky.actor.defs#profileView',
    did: 'did:plc:actor',
    handle: 'actor.test',
  }
  return { ...base, ...overrides }
}

function profileDetailed(
  overrides: Partial<AppBskyActorDefs.ProfileViewDetailed> = {},
): AppBskyActorDefs.ProfileViewDetailed {
  const base: AppBskyActorDefs.ProfileViewDetailed = {
    $type: 'app.bsky.actor.defs#profileViewDetailed',
    did: 'did:plc:x',
    handle: 'x.world',
  }
  return { ...base, ...overrides }
}

function postRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    $type: 'app.bsky.feed.post',
    text: '',
    createdAt: INDEXED_AT,
    ...overrides,
  }
}

function postView(overrides: Partial<AppBskyFeedDefs.PostView> = {}): AppBskyFeedDefs.PostView {
  const base: AppBskyFeedDefs.PostView = {
    $type: 'app.bsky.feed.defs#postView',
    uri: 'at://did:plc:ada/app.bsky.feed.post/1',
    cid: 'cid-1',
    author: profileBasic(),
    record: postRecord(),
    indexedAt: INDEXED_AT,
  }
  return { ...base, ...overrides }
}

function feedViewPost(
  overrides: Partial<AppBskyFeedDefs.FeedViewPost> = {},
): AppBskyFeedDefs.FeedViewPost {
  const base: AppBskyFeedDefs.FeedViewPost = {
    $type: 'app.bsky.feed.defs#feedViewPost',
    post: postView(),
  }
  return { ...base, ...overrides }
}

function threadNode(
  uri: string,
  overrides: Partial<AppBskyFeedDefs.ThreadViewPost> = {},
): AppBskyFeedDefs.ThreadViewPost {
  const base: AppBskyFeedDefs.ThreadViewPost = {
    $type: 'app.bsky.feed.defs#threadViewPost',
    post: postView({ uri }),
  }
  return { ...base, ...overrides }
}

function quotedRecord(
  overrides: Partial<AppBskyEmbedRecord.ViewRecord> = {},
): AppBskyEmbedRecord.ViewRecord {
  const base: AppBskyEmbedRecord.ViewRecord = {
    $type: 'app.bsky.embed.record#viewRecord',
    uri: 'at://did:plc:bob/app.bsky.feed.post/9',
    cid: 'cid-quoted',
    author: profileBasic({ did: 'did:plc:bob', handle: 'bob.world', displayName: 'bob' }),
    value: postRecord({ text: 'quoted text' }),
    indexedAt: QUOTED_AT,
  }
  return { ...base, ...overrides }
}

function wireNotification(
  overrides: Partial<AppBskyNotificationListNotifications.Notification> = {},
): AppBskyNotificationListNotifications.Notification {
  const base: AppBskyNotificationListNotifications.Notification = {
    $type: 'app.bsky.notification.listNotifications#notification',
    uri: 'at://did:plc:actor/app.bsky.feed.post/1',
    cid: 'cid-notify',
    author: profileView(),
    reason: 'like',
    record: {
      $type: 'app.bsky.feed.like',
      subject: { uri: 'at://did:plc:me/app.bsky.feed.post/mine', cid: 'cid-mine' },
      createdAt: INDEXED_AT,
    },
    isRead: false,
    indexedAt: INDEXED_AT,
  }
  return { ...base, ...overrides }
}

describe('mapFacets', () => {
  it('returns no spans for missing or non-array facets', () => {
    expect(mapFacets(undefined, 'plain')).toEqual([])
    expect(mapFacets([], 'plain')).toEqual([])
    expect(mapFacets({ index: { byteStart: 0, byteEnd: 1 } }, 'plain')).toEqual([])
    expect(mapFacets([null, 3, 'x'], 'plain')).toEqual([])
  })

  it('keeps utf-8 byte offsets across diacritics and astral emoji', () => {
    const text = 'zażółć 😀 @ada.world'
    const range = byteRange(text, '@ada.world')
    const spans = mapFacets([mentionFacet(text, '@ada.world', 'did:plc:ada')], text)

    expect(spans).toEqual([
      {
        start: range.byteStart,
        end: range.byteEnd,
        feature: { kind: 'mention', did: 'did:plc:ada', handle: 'ada.world' },
      },
    ])
    // the mention starts after both the two-byte polish letters and the emoji
    expect(range.byteStart).toBeGreaterThan(text.indexOf('@ada.world'))
  })

  it('decodes links, tags and every style feature', () => {
    const text = 'bold italic gone code #tensorpunk https://example.com'
    const facets = [
      facetAt(text, 'bold', [{ $type: 'app.bsky.richtext.facet#bold' }]),
      facetAt(text, 'italic', [{ $type: 'app.bsky.richtext.facet#italic' }]),
      facetAt(text, 'gone', [{ $type: 'app.bsky.richtext.facet#strikethrough' }]),
      facetAt(text, 'code', [{ $type: 'app.bsky.richtext.facet#code' }]),
      facetAt(text, '#tensorpunk', [
        { $type: 'app.bsky.richtext.facet#tag', tag: 'tensorpunk' },
      ]),
      facetAt(text, 'https://example.com', [
        { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' },
      ]),
    ]

    expect(mapFacets(facets, text)).toEqual([
      { start: 0, end: 4, feature: { kind: 'bold' } },
      { start: 5, end: 11, feature: { kind: 'italic' } },
      { start: 12, end: 16, feature: { kind: 'strikethrough' } },
      { start: 17, end: 21, feature: { kind: 'code' } },
      { start: 22, end: 33, feature: { kind: 'tag', tag: 'tensorpunk' } },
      { start: 34, end: 53, feature: { kind: 'link', uri: 'https://example.com' } },
    ])
  })

  it('falls back to the did for a mention with no handle text', () => {
    const text = 'hi @ there'
    const range = byteRange(text, '@')

    expect(mapFacets([mentionFacet(text, '@', 'did:plc:solo')], text)).toEqual([
      {
        start: range.byteStart,
        end: range.byteEnd,
        feature: { kind: 'mention', did: 'did:plc:solo', handle: 'did:plc:solo' },
      },
    ])
  })

  it('keeps a valid feature beside malformed payloads in the same facet', () => {
    const facets = [
      {
        index: { byteStart: 0, byteEnd: 4 },
        features: [
          { $type: 'app.bsky.richtext.facet#mention' },
          { $type: 'app.bsky.richtext.facet#link' },
          { $type: 'app.bsky.richtext.facet#tag' },
          null,
          { $type: 'app.bsky.richtext.facet#bold' },
        ],
      },
    ]

    expect(mapFacets(facets, 'bold')).toEqual([{ start: 0, end: 4, feature: { kind: 'bold' } }])
  })

  it('names unknown feature types and skips invalid byte ranges', () => {
    const text = 'custom'
    const custom = facetAt(text, 'custom', [{ $type: 'com.example.custom#feature' }])
    const backwards = {
      index: { byteStart: 3, byteEnd: 2 },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'backwards' }],
    }
    const pastEnd = {
      index: { byteStart: 0, byteEnd: 99 },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'long' }],
    }

    expect(mapFacets([custom, backwards, pastEnd], text)).toEqual([
      { start: 0, end: 6, feature: { kind: 'unknown', typeName: 'com.example.custom#feature' } },
    ])
  })
})

describe('mapPostView', () => {
  it('fills every default for an empty post', () => {
    expect(mapPostView(postView())).toEqual({
      uri: 'at://did:plc:ada/app.bsky.feed.post/1',
      cid: 'cid-1',
      author: {
        did: 'did:plc:ada',
        handle: 'ada.world',
        displayName: 'ada',
        avatar: 'https://cdn.example/ada.png',
        muted: false,
        blocked: false,
      },
      text: '',
      facets: [],
      indexedAt: INDEXED_AT,
      replyCount: 0,
      repostCount: 0,
      likeCount: 0,
      quoteCount: 0,
      embed: null,
      reason: null,
      isReply: false,
      replyRoot: null,
      replyParent: null,
      replyContext: null,
      labels: [],
    })
  })

  it('reads text facets reply refs counts and live labels from the record', () => {
    const text = 'hello @ada.world'
    const view = postView({
      record: postRecord({
        text,
        facets: [mentionFacet(text, '@ada.world', 'did:plc:ada')],
        reply: {
          root: { uri: 'at://root', cid: 'root-cid' },
          parent: { uri: 'at://parent', cid: 'parent-cid' },
        },
      }),
      replyCount: 4,
      repostCount: 3,
      likeCount: 12,
      quoteCount: 1,
      labels: [label('nsfw'), label('nsfw'), label('nsfw', true), label('graphic-media')],
    })

    const model = mapPostView(view)
    expect(model.text).toBe(text)
    expect(model.facets).toEqual([
      {
        start: byteRange(text, '@ada.world').byteStart,
        end: byteRange(text, '@ada.world').byteEnd,
        feature: { kind: 'mention', did: 'did:plc:ada', handle: 'ada.world' },
      },
    ])
    expect(model.isReply).toBe(true)
    expect(model.replyRoot).toEqual({ uri: 'at://root', cid: 'root-cid' })
    expect(model.replyParent).toEqual({ uri: 'at://parent', cid: 'parent-cid' })
    expect(model.labels).toEqual(['nsfw', 'graphic-media'])
  })

  it('projects a malformed or non-post record instead of asserting it', () => {
    const malformed = mapPostView(
      postView({
        record: {
          $type: 'app.bsky.feed.post',
          text: 42,
          facets: [{ index: { byteStart: 0, byteEnd: 1 } }],
          reply: { root: { uri: 'at://root-without-cid' } },
        },
      }),
    )
    expect(malformed.text).toBe('')
    expect(malformed.facets).toEqual([])
    expect(malformed.isReply).toBe(false)
    expect(malformed.replyRoot).toBeNull()

    const notAPost = mapPostView(postView({ record: { text: 'not a post' } }))
    expect(notAPost.text).toBe('')
    expect(notAPost.isReply).toBe(false)
  })

  it('reads moderation state off the author viewer', () => {
    const muted = mapPostView(postView({ author: profileBasic({ viewer: { muted: true } }) }))
    expect(muted.author.muted).toBe(true)

    const blocking = mapPostView(
      postView({ author: profileBasic({ viewer: { blocking: 'at://block/1' } }) }),
    )
    expect(blocking.author.blocked).toBe(true)

    const blockedBy = mapPostView(
      postView({ author: profileBasic({ viewer: { blockedBy: true } }) }),
    )
    expect(blockedBy.author.blocked).toBe(true)
  })
})

describe('mapPostView embeds', () => {
  it('maps image views with aspect ratios and defaults', () => {
    const view = postView({
      embed: {
        $type: 'app.bsky.embed.images#view',
        images: [
          {
            $type: 'app.bsky.embed.images#viewImage',
            thumb: 'thumb-a',
            fullsize: 'full-a',
            alt: 'alt-a',
            aspectRatio: { width: 4, height: 3 },
          },
          {
            $type: 'app.bsky.embed.images#viewImage',
            thumb: 'thumb-b',
            fullsize: 'full-b',
            alt: '',
          },
        ],
      },
    })

    expect(mapPostView(view).embed).toEqual({
      type: 'images',
      images: [
        { thumb: 'thumb-a', fullsize: 'full-a', alt: 'alt-a', width: 4, height: 3 },
        { thumb: 'thumb-b', fullsize: 'full-b', alt: '', width: null, height: null },
      ],
    })
  })

  it('maps gallery items and skips unknown gallery items', () => {
    const view = postView({
      embed: {
        $type: 'app.bsky.embed.gallery#view',
        items: [
          {
            $type: 'app.bsky.embed.gallery#viewImage',
            thumbnail: 'g-thumb',
            fullsize: 'g-full',
            alt: 'g-alt',
            aspectRatio: { width: 1, height: 1 },
          },
          { $type: 'com.example.custom#galleryItem' },
        ],
      },
    })

    expect(mapPostView(view).embed).toEqual({
      type: 'images',
      images: [{ thumb: 'g-thumb', fullsize: 'g-full', alt: 'g-alt', width: 1, height: 1 }],
    })
  })

  it('maps external embeds with a domain and a null thumb fallback', () => {
    const withThumb = postView({
      embed: {
        $type: 'app.bsky.embed.external#view',
        external: {
          uri: 'https://example.com/path',
          title: 'title',
          description: 'desc',
          thumb: 'https://cdn.example/thumb.png',
        },
      },
    })
    const withoutThumb = postView({
      embed: {
        $type: 'app.bsky.embed.external#view',
        external: { uri: 'not a url', title: 't', description: 'd' },
      },
    })

    expect(mapPostView(withThumb).embed).toEqual({
      type: 'external',
      uri: 'https://example.com/path',
      title: 'title',
      description: 'desc',
      thumb: 'https://cdn.example/thumb.png',
      domain: 'example.com',
    })
    expect(mapPostView(withoutThumb).embed).toEqual({
      type: 'external',
      uri: 'not a url',
      title: 't',
      description: 'd',
      thumb: null,
      domain: '',
    })
  })

  it('maps video embeds and nulls an empty playlist', () => {
    const withPlaylist = postView({
      embed: {
        $type: 'app.bsky.embed.video#view',
        cid: 'vid-1',
        playlist: 'https://video.example/playlist.m3u8',
        thumbnail: 'https://cdn.example/video.png',
        alt: 'video alt',
      },
    })
    const empty = postView({
      embed: { $type: 'app.bsky.embed.video#view', cid: 'vid-2', playlist: '' },
    })

    expect(mapPostView(withPlaylist).embed).toEqual({
      type: 'video',
      thumbnail: 'https://cdn.example/video.png',
      alt: 'video alt',
      playlist: 'https://video.example/playlist.m3u8',
    })
    expect(mapPostView(empty).embed).toEqual({
      type: 'video',
      thumbnail: null,
      alt: '',
      playlist: null,
    })
  })

  it('maps a quoted post with its facets and first embed type', () => {
    const view = postView({
      embed: {
        $type: 'app.bsky.embed.record#view',
        record: quotedRecord({
          embeds: [{ $type: 'app.bsky.embed.images#view', images: [] }],
        }),
      },
    })

    expect(mapPostView(view).embed).toEqual({
      type: 'quote',
      post: {
        uri: 'at://did:plc:bob/app.bsky.feed.post/9',
        cid: 'cid-quoted',
        author: {
          did: 'did:plc:bob',
          handle: 'bob.world',
          displayName: 'bob',
          avatar: 'https://cdn.example/ada.png',
          muted: false,
          blocked: false,
        },
        text: 'quoted text',
        facets: [],
        indexedAt: QUOTED_AT,
        embedType: 'app.bsky.embed.images#view',
      },
    })
  })

  it('maps blocked quotes to an unavailable placeholder', () => {
    const view = postView({
      embed: {
        $type: 'app.bsky.embed.record#view',
        record: {
          $type: 'app.bsky.embed.record#viewBlocked',
          uri: 'at://did:plc:bob/app.bsky.feed.post/blocked',
          blocked: true,
          author: { did: 'did:plc:bob' },
        },
      },
    })

    expect(mapPostView(view).embed).toEqual({
      type: 'unavailable',
      reason: 'blocked',
      uri: 'at://did:plc:bob/app.bsky.feed.post/blocked',
      label: 'blocked post',
    })
  })

  it('drops a quote from a hidden account but keeps the media beside it', () => {
    const hiddenQuote = quotedRecord({
      author: profileBasic({
        did: 'did:plc:bob',
        handle: 'bob.world',
        viewer: { muted: true },
      }),
    })
    const quoteView = postView({
      embed: { $type: 'app.bsky.embed.record#view', record: hiddenQuote },
    })
    expect(mapPostView(quoteView).embed).toBeNull()

    const withMedia = postView({
      embed: {
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: { $type: 'app.bsky.embed.record#view', record: hiddenQuote },
        media: {
          $type: 'app.bsky.embed.images#view',
          images: [
            { $type: 'app.bsky.embed.images#viewImage', thumb: 't', fullsize: 'f', alt: '' },
          ],
        },
      },
    })
    expect(mapPostView(withMedia).embed).toEqual({
      type: 'images',
      images: [{ thumb: 't', fullsize: 'f', alt: '', width: null, height: null }],
    })
  })

  it('maps recordWithMedia quotes and media together', () => {
    const view = postView({
      embed: {
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: { $type: 'app.bsky.embed.record#view', record: quotedRecord() },
        media: { $type: 'app.bsky.embed.images#view', images: [] },
      },
    })

    expect(mapPostView(view).embed).toEqual({
      type: 'recordWithMedia',
      quote: {
        uri: 'at://did:plc:bob/app.bsky.feed.post/9',
        cid: 'cid-quoted',
        author: {
          did: 'did:plc:bob',
          handle: 'bob.world',
          displayName: 'bob',
          avatar: 'https://cdn.example/ada.png',
          muted: false,
          blocked: false,
        },
        text: 'quoted text',
        facets: [],
        indexedAt: QUOTED_AT,
        embedType: null,
      },
      media: { type: 'images', images: [] },
    })
  })

  it('keeps unknown embed type names', () => {
    const view = postView({ embed: { $type: 'com.example.custom#embed' } })

    expect(mapPostView(view).embed).toEqual({
      type: 'unknown',
      typeName: 'com.example.custom#embed',
    })
  })
})

describe('mapFeedViewPost', () => {
  it('maps repost and pin reasons', () => {
    const repost = feedViewPost({
      reason: {
        $type: 'app.bsky.feed.defs#reasonRepost',
        by: profileBasic({ handle: 'rep.world', displayName: 'rep' }),
        indexedAt: '2026-01-03T00:00:00.000Z',
      },
    })
    const pin = feedViewPost({ reason: { $type: 'app.bsky.feed.defs#reasonPin' } })

    expect(mapFeedViewPost(repost).reason).toEqual({
      type: 'repost',
      by: {
        did: 'did:plc:ada',
        handle: 'rep.world',
        displayName: 'rep',
        avatar: 'https://cdn.example/ada.png',
        muted: false,
        blocked: false,
      },
    })
    expect(mapFeedViewPost(pin).reason).toEqual({ type: 'pin' })
    expect(mapFeedViewPost(feedViewPost()).reason).toBeNull()
  })

  it('keeps feed context, request id and the parent preview', () => {
    const parent = postView({
      uri: 'at://did:plc:ada/app.bsky.feed.post/parent',
      cid: 'parent-cid',
      record: postRecord({ text: 'the post being answered' }),
    })
    const reply = feedViewPost({
      post: postView({
        record: postRecord({
          text: 'answer',
          reply: {
            root: { uri: parent.uri, cid: parent.cid },
            parent: { uri: parent.uri, cid: parent.cid },
          },
        }),
      }),
      reply: { root: parent, parent },
      feedContext: 'ctx-1',
      reqId: 'req-1',
    })

    const model = mapFeedViewPost(reply)
    expect(model.feedContext).toBe('ctx-1')
    expect(model.reqId).toBe('req-1')
    expect(model.replyContext).toMatchObject({
      uri: parent.uri,
      cid: 'parent-cid',
      text: 'the post being answered',
    })
  })
})

describe('mapProfile', () => {
  it('fills defaults for a sparse profile', () => {
    expect(mapProfile(profileDetailed())).toEqual({
      did: 'did:plc:x',
      handle: 'x.world',
      displayName: '',
      description: '',
      pronouns: '',
      avatar: null,
      banner: null,
      followersCount: 0,
      followsCount: 0,
      postsCount: 0,
      createdAt: null,
      labels: [],
      links: [],
      isBot: false,
      viewer: {
        following: null,
        followedBy: null,
        muted: false,
        mutedOnlyReposts: false,
        mutedOnlyQuoteposts: false,
        blocking: null,
        blockedBy: false,
        activitySubscription: null,
      },
    })
  })

  it('marks a bot only from a live label', () => {
    expect(mapProfile(profileDetailed({ labels: [label('bot')] })).isBot).toBe(true)
    const retracted = mapProfile(profileDetailed({ labels: [label('bot', true)] }))
    expect(retracted.isBot).toBe(false)
    expect(retracted.labels).toEqual([])
  })
})

describe('thread mapping', () => {
  it('orders ancestors root first then focus then replies and skips bad neighbours', () => {
    const root = threadNode('root')
    const parent = threadNode('parent', { parent: root })
    const childA1 = threadNode('a1')
    const childA = threadNode('a', { replies: [childA1] })
    const childB = threadNode('b')
    const blocked: AppBskyFeedDefs.BlockedPost = {
      $type: 'app.bsky.feed.defs#blockedPost',
      uri: 'at://blocked',
      blocked: true,
      author: { did: 'did:plc:z' },
    }
    const notFound: AppBskyFeedDefs.NotFoundPost = {
      $type: 'app.bsky.feed.defs#notFoundPost',
      uri: 'at://missing',
      notFound: true,
    }
    const focus = threadNode('focus', { parent, replies: [blocked, childA, notFound, childB] })

    const model = flattenThread(focus)

    expect(model.focusUri).toBe('focus')
    expect(model.entries.map((entry) => entry.post.uri)).toEqual([
      'root',
      'parent',
      'focus',
      'a',
      'a1',
      'b',
    ])
    expect(model.entries.map((entry) => entry.depth)).toEqual([-2, -1, 0, 1, 2, 1])
    expect(model.entries.map((entry) => entry.role)).toEqual([
      'ancestor',
      'ancestor',
      'focus',
      'reply',
      'reply',
      'reply',
    ])
  })

  it('caps the flattened thread at eighty entries', () => {
    const replies = Array.from({ length: 100 }, (_, index) => threadNode(`r${index}`))
    const model = flattenThread(threadNode('focus', { replies }))

    expect(model.entries).toHaveLength(80)
    expect(model.entries[79]?.post.uri).toBe('r78')
  })

  it('omits a hidden ancestor and leaves the focus reply context null', () => {
    const hiddenParent = threadNode('parent', {
      post: postView({
        uri: 'parent',
        author: profileBasic({ did: HIDDEN_DID, handle: 'hidden.test' }),
      }),
    })
    const focus = threadNode('focus', {
      parent: hiddenParent,
      post: postView({
        uri: 'focus',
        record: postRecord({
          reply: {
            root: { uri: 'parent', cid: 'cid-1' },
            parent: { uri: 'parent', cid: 'cid-1' },
          },
        }),
      }),
    })

    const model = flattenThread(focus, new Set([HIDDEN_DID]))

    expect(model.entries.map((entry) => entry.post.uri)).toEqual(['focus'])
    expect(model.entries[0]?.post.replyContext).toBeNull()
  })

  it('takes a hidden reply subtree with it and prunes its quote', () => {
    const hiddenAuthor = profileBasic({ did: HIDDEN_DID, handle: 'hidden.test' })
    const hiddenReply = threadNode('hidden-reply', {
      post: postView({ uri: 'hidden-reply', author: hiddenAuthor }),
      replies: [threadNode('visible-child')],
    })
    const focus = threadNode('focus', {
      post: postView({
        uri: 'focus',
        embed: {
          $type: 'app.bsky.embed.record#view',
          record: quotedRecord({
            uri: 'at://did:plc:hidden/app.bsky.feed.post/quoted',
            author: hiddenAuthor,
          }),
        },
      }),
      replies: [hiddenReply, threadNode('visible')],
    })

    const model = flattenThread(focus, new Set([HIDDEN_DID]))

    expect(model.entries.map((entry) => entry.post.uri)).toEqual(['focus', 'visible'])
    expect(model.entries[0]?.post.embed).toBeNull()
  })

  it('counts the eighty-entry cap after hidden replies are removed', () => {
    const hiddenReplies = Array.from({ length: 80 }, (_, index) =>
      threadNode(`h${index}`, {
        post: postView({
          uri: `h${index}`,
          author: profileBasic({ did: HIDDEN_DID, handle: 'hidden.test' }),
        }),
      }),
    )
    const visibleReplies = Array.from({ length: 20 }, (_, index) => threadNode(`v${index}`))

    const model = flattenThread(
      threadNode('focus', { replies: [...hiddenReplies, ...visibleReplies] }),
      new Set([HIDDEN_DID]),
    )

    expect(model.entries.map((entry) => entry.post.uri)).toEqual([
      'focus',
      ...visibleReplies.map((_, index) => `v${index}`),
    ])
  })

  it('collects authored dids from posts and the raw thread tree', () => {
    const quote = quotedRecord({
      author: profileBasic({ did: HIDDEN_DID, handle: 'hidden.test' }),
    })
    const post = mapPostView(
      postView({ embed: { $type: 'app.bsky.embed.record#view', record: quote } }),
    )

    expect(postAuthorDids(post)).toEqual(['did:plc:ada', HIDDEN_DID])

    const focus = threadNode('focus', {
      post: postView({
        embed: { $type: 'app.bsky.embed.record#view', record: quote },
      }),
      replies: [threadNode('reply')],
    })
    expect(threadAuthorDids(focus)).toEqual(['did:plc:ada', HIDDEN_DID])
  })
})

const REASON_CASES: ReadonlyArray<readonly [reason: string, group: string, label: string]> = [
  ['follow', 'follow', 'followed you'],
  ['like', 'like', 'liked your post'],
  ['like-via-repost', 'like', 'liked your repost'],
  ['repost', 'repost', 'reposted your post'],
  ['repost-via-repost', 'repost', 'reposted your repost'],
  ['reply', 'reply', 'replied to your post'],
  ['mention', 'mention', 'mentioned you'],
  ['quote', 'quote', 'quoted your post'],
  ['starterpack-joined', 'other', 'joined your starter pack'],
  ['subscribed-post', 'other', 'subscribed to your post'],
  ['verified', 'other', 'verified your account'],
  ['unverified', 'other', 'unverified your account'],
  ['contact-match', 'other', 'connected through contacts'],
  ['something-new', 'other', 'new activity'],
]

describe('notification mapping', () => {
  for (const [reason, group, expectedLabel] of REASON_CASES) {
    it(`groups and labels ${reason}`, () => {
      expect(notificationReasonGroup(reason)).toBe(group)
      expect(notificationReasonLabel(reason)).toBe(expectedLabel)
    })
  }

  it('prefers the reason subject and keeps the record subject as fallback', () => {
    const preferred = mapNotification(
      wireNotification({ reason: 'reply', reasonSubject: 'at://parent' }),
    )
    expect(preferred.subject).toBe('at://parent')

    const fallback = mapNotification(wireNotification())
    expect(fallback.subject).toBe('at://did:plc:me/app.bsky.feed.post/mine')
  })

  it('trims a subject snippet and treats blank text as absent', () => {
    const trimmed = mapNotification(wireNotification({ record: { text: '  hello  ' } }))
    const blank = mapNotification(wireNotification({ record: { text: '   ' } }))
    const none = mapNotification(wireNotification({ record: {} }))

    expect(trimmed.subjectText).toBe('hello')
    expect(blank.subjectText).toBeNull()
    expect(none.subjectText).toBeNull()
    expect(none.subjectPost).toBeNull()
  })

  it('builds a stable id from reason, uri, author and timestamp', () => {
    const notification = mapNotification(wireNotification({ reason: 'repost' }))

    expect(notification.id).toBe(
      `repost:at://did:plc:actor/app.bsky.feed.post/1:did:plc:actor:${INDEXED_AT}`,
    )
    expect(notification.isRead).toBe(false)
  })
})

describe('schemas accept mapped values', () => {
  it('decodes a mapped post and profile', () => {
    const post = mapFeedViewPost(
      feedViewPost({
        post: postView({
          embed: {
            $type: 'app.bsky.embed.recordWithMedia#view',
            record: { $type: 'app.bsky.embed.record#view', record: quotedRecord() },
            media: { $type: 'app.bsky.embed.images#view', images: [] },
          },
          labels: [label('nsfw')],
        }),
        feedContext: 'ctx',
        reqId: 'req',
      }),
    )
    const profile = mapProfile(profileDetailed({ labels: [label('bot')] }))

    expect(Schema.decodeUnknownSync(PostModel)(post)).toEqual(post)
    expect(Schema.decodeUnknownSync(ProfileModel)(profile)).toEqual(profile)
  })
})
