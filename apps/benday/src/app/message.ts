// SPDX-License-Identifier: GPL-3.0-only
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

/**
 * Messages are facts. A URL fact carries the parsed URL, never a DOM node or a
 * routing handle, so the whole update path stays serializable.
 */
export const Message = defineMessageUnion({
  ChangedUrl: { url: Url },
  RequestedUrl: { request: UrlRequest },
  CompletedNavigation: {},
  CompletedFocus: {},
})

export type Message = typeof Message.Type

/** The path a shell render depends on, parsed from an incoming URL. */
export const Pathname = Schema.String
