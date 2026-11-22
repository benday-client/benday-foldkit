// SPDX-License-Identifier: GPL-3.0-only
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

/**
 * URL messages carry the parsed URL; no DOM node or routing handle crosses the
 * update boundary.
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
