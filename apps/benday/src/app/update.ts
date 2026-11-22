// SPDX-License-Identifier: GPL-3.0-only
import { Effect, Schema } from 'effect'
import { Command, Navigation, Update } from 'foldkit'
import type { RoutingConfig } from 'foldkit/runtime'
import { toString as urlToString } from 'foldkit/url'
import type { Url } from 'foldkit/url'
import { Message } from './message.js'
import type { Model } from './model.js'

/**
 * A push is a fact: the browser listener reports the request, the update
 * records the navigation command, and the runtime runs it. The result Message
 * closes the loop so Story tests can resolve the command without a browser.
 */
const PushUrl = Command.define('PushUrl', {
  args: { href: Schema.String },
  messages: [Message.CompletedNavigation],
  execute: ({ href }) => Navigation.pushUrl(href).pipe(Effect.as(Message.CompletedNavigation())),
})

const OpenUrl = Command.define('OpenUrl', {
  args: { href: Schema.String },
  messages: [Message.CompletedNavigation],
  execute: ({ href }) => Navigation.openUrl(href).pipe(Effect.as(Message.CompletedNavigation())),
})

/**
 * An in-page anchor target is a focus decision, not a navigation. The app
 * owns it so the skip link moves focus without adding a history entry.
 */
const FocusElement = Command.define('FocusElement', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ id }) =>
    Effect.sync(() => {
      document.getElementById(id)?.focus()
    }).pipe(Effect.as(Message.CompletedFocus())),
})

const withUrl = (model: Model, pathname: string, search: string): Model => ({
  ...model,
  shell: { pathname, search },
})

/**
 * The browser listener's two facts. They are constructed in the application
 * module that owns them, never in the entry point that only starts the
 * runtime.
 */
export const routing: RoutingConfig<Message> = {
  onUrlRequest: (request) => Message.RequestedUrl({ request }),
  onUrlChange: (url) => Message.ChangedUrl({ url }),
}

export const init = (url: Url): Update.Return<Model, Message> => ({
  model: {
    shell: {
      pathname: url.pathname,
      search: url.search._tag === 'Some' ? url.search.value : '',
    },
    auth: { status: 'anonymous' },
    overlay: { open: null },
  },
})

/** A fragment id is percent-decoded so `#post%201` reaches `id="post 1"`. */
function focusTarget(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ChangedUrl: ({ url }) => ({
      model: withUrl(
        model,
        url.pathname,
        url.search._tag === 'Some' ? url.search.value : '',
      ),
    }),
    RequestedUrl: ({ request }) => {
      if (request._tag === 'External') {
        return { model, commands: [OpenUrl({ href: request.href })] }
      }
      const { url } = request
      const pathname = model.shell.pathname
      const search = model.shell.search
      const nextSearch = url.search._tag === 'Some' ? url.search.value : ''
      const samePage = url.pathname === pathname && nextSearch === search

      // an in-page fragment only moves focus; the URL and history are untouched
      if (url.hash._tag === 'Some' && url.pathname === pathname) {
        return { model, commands: [FocusElement({ id: focusTarget(url.hash.value) })] }
      }
      // same page, no fragment: nothing to navigate, and no history entry
      if (url.hash._tag === 'None' && samePage) return { model }
      return { model, commands: [PushUrl({ href: urlToString(url) })] }
    },
    CompletedNavigation: () => ({ model }),
    CompletedFocus: () => ({ model }),
  })
