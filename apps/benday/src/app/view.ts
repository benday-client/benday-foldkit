// SPDX-License-Identifier: GPL-3.0-only
import type { HtmlBuilder } from 'foldkit/html'
import type { Document } from 'foldkit/html'
import type { Message } from './message.js'
import type { Model } from './model.js'

/**
 * The signed-out landing: label, headline, invitation copy, and a login action
 * disabled until the session service exists.
 */
function landing(h: HtmlBuilder<Message>) {
  return h.section(
    [h.Class('b-landing'), h.AriaLabelledBy('b-landing-headline')],
    [
      h.p([h.Class('mono-label')], ['closed beta']),
      h.h1([h.Class('b-landing__headline'), h.Id('b-landing-headline')], [
        'a card reader for your own bluesky',
      ]),
      h.p([h.Class('b-landing__body')], [
        'access to benday is by invitation while we polish it. use your own bluesky account to log in. nothing is written without your say so.',
      ]),
      h.div([h.Class('b-landing__action')], [
        // the session service is not part of the foundation slice; the action
        // is visibly unavailable rather than silently doing nothing
        h.button(
          [h.Class('b-button b-button--solid'), h.Type('button'), h.Disabled(true)],
          ['log in with bluesky'],
        ),
      ]),
    ],
  )
}

export function view(_model: Model, h: HtmlBuilder<Message>): Document {
  return {
    title: 'benday // bluesky client',
    lang: 'en',
    body: h.div(
      [],
      [
        h.a([h.Class('b-skip'), h.Href('#main')], ['skip to content']),
        h.main([h.Id('main'), h.Tabindex(-1)], [landing(h)]),
      ],
    ),
  }
}
