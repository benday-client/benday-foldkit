// SPDX-License-Identifier: GPL-3.0-only
import type { AppBskyNotificationListNotifications } from '@atproto/api'
import { Schema } from 'effect'
import { AuthorModel, isRecord, mapAuthor, PostModel } from './model.js'

export const NotificationReasonGroupSchema = Schema.Literals([
  'follow',
  'like',
  'repost',
  'reply',
  'mention',
  'quote',
  'other',
])
export type NotificationReasonGroup = typeof NotificationReasonGroupSchema.Type

export const NotificationModel = Schema.Struct({
  id: Schema.String,
  uri: Schema.String,
  reason: Schema.String,
  author: AuthorModel,
  /** the at-uri the notification points at, or null when it has no subject */
  subject: Schema.NullOr(Schema.String),
  /** text preview of the subject post when the payload carries one */
  subjectText: Schema.NullOr(Schema.String),
  /** the post the notification points at, hydrated a page at a time */
  subjectPost: Schema.NullOr(PostModel),
  isRead: Schema.Boolean,
  indexedAt: Schema.String,
})
export type NotificationModel = typeof NotificationModel.Type

export const NotificationPage = Schema.Struct({
  notifications: Schema.Array(NotificationModel),
  /** newest indexedAt on the wire page, even when every row was filtered */
  newestIndexedAt: Schema.NullOr(Schema.String),
})
export type NotificationPage = typeof NotificationPage.Type

function readSubjectText(record: Record<string, unknown>): string | null {
  // post records carry their text here; other record types simply have none
  const text = record['text']
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readSubjectRef(record: Record<string, unknown>): string | null {
  // like and repost records point at their target through subject.uri
  const subject = record['subject']
  if (!isRecord(subject)) return null
  const uri = subject['uri']
  return typeof uri === 'string' && uri.length > 0 ? uri : null
}

export function mapNotification(
  notification: AppBskyNotificationListNotifications.Notification,
): NotificationModel {
  const author = mapAuthor(notification.author)
  const reason = notification.reason
  return {
    id: `${reason}:${notification.uri}:${author.did}:${notification.indexedAt}`,
    uri: notification.uri,
    reason,
    author,
    subject: notification.reasonSubject ?? readSubjectRef(notification.record),
    subjectText: readSubjectText(notification.record),
    subjectPost: null,
    isRead: notification.isRead,
    indexedAt: notification.indexedAt,
  }
}

export function notificationReasonGroup(reason: string): NotificationReasonGroup {
  switch (reason) {
    case 'follow':
      return 'follow'
    case 'like':
    case 'like-via-repost':
      return 'like'
    case 'repost':
    case 'repost-via-repost':
      return 'repost'
    case 'reply':
      return 'reply'
    case 'mention':
      return 'mention'
    case 'quote':
      return 'quote'
    default:
      return 'other'
  }
}

export function notificationReasonLabel(reason: string): string {
  switch (reason) {
    case 'follow':
      return 'followed you'
    case 'like':
      return 'liked your post'
    case 'like-via-repost':
      return 'liked your repost'
    case 'repost':
      return 'reposted your post'
    case 'repost-via-repost':
      return 'reposted your repost'
    case 'reply':
      return 'replied to your post'
    case 'mention':
      return 'mentioned you'
    case 'quote':
      return 'quoted your post'
    case 'starterpack-joined':
      return 'joined your starter pack'
    case 'subscribed-post':
      return 'subscribed to your post'
    case 'verified':
      return 'verified your account'
    case 'unverified':
      return 'unverified your account'
    case 'contact-match':
      return 'connected through contacts'
    default:
      return 'new activity'
  }
}
