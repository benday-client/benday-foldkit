// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { foldkitViewIdentity } from '@foldkit/vite-plugin'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { renderFirstPaintScript } from './vite/firstPaintScript.js'
import { createOAuthClientMetadata } from './vite/oauthMetadata.js'
import { readSourceIdentity } from './vite/sourceIdentity.js'

const appRoot = fileURLToPath(new URL('.', import.meta.url))

const FIRST_PAINT_MARKER = '<!--benday:first-paint-->'
const firstPaintSource = readFileSync(
  fileURLToPath(new URL('./src/platform/firstPaint.js', import.meta.url)),
  'utf8',
)

/**
 * Static hosting contract: real files win, the app shell serves every other
 * path, OAuth metadata is public JSON, dotfiles are refused and only /admin
 * asks for the hosting password.
 */
const oauthMetadata = (publicOrigin: string): Plugin => {
  const metadata = createOAuthClientMetadata(publicOrigin)
  return {
    name: 'benday-oauth-metadata',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'oauth-client-metadata.json',
        source: `${JSON.stringify(metadata, null, 2)}\n`,
      })
    },
  }
}

/**
 * The browser gate reads this file to prove it is testing the artifact it
 * just built instead of a stale dist directory. Hashed output names make the
 * identity specific to the emitted bytes.
 */
const buildIdentity = (publicOrigin: string): Plugin => ({
  name: 'benday-build-identity',
  generateBundle(_options, bundle) {
    const identity = {
      ...readSourceIdentity(appRoot),
      publicOrigin,
      files: Object.keys(bundle).toSorted(),
    }
    this.emitFile({
      type: 'asset',
      fileName: 'build-identity.json',
      source: `${JSON.stringify(identity, null, 2)}\n`,
    })
  },
})

/**
 * The first-paint decoder is inlined from its single module source, so the
 * scheme is decided before the module graph runs and there is no second
 * settings format to drift.
 */
const inlineFirstPaint = (): Plugin => ({
  name: 'benday-first-paint',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      return html.replace(FIRST_PAINT_MARKER, `<script>${renderFirstPaintScript(firstPaintSource)}</script>`)
    },
  },
})

/**
 * Vite injects its HMR client into the page and into every CSS module. The
 * client opens a websocket, so development replaces it with a local stub that
 * style injection needs and that has no transport. A full reload is the
 * development loop.
 */
const DEV_CLIENT_STUB = `
const noop = () => {}
export const createHotContext = () => ({
  data: {},
  accept: noop,
  acceptExports: noop,
  dispose: noop,
  prune: noop,
  decline: noop,
  invalidate: noop,
  on: noop,
  off: noop,
  send: noop,
})
export function updateStyle(id, content) {
  let element = document.querySelector('style[data-benday-dev-id="' + id + '"]')
  if (element === null) {
    element = document.createElement('style')
    element.setAttribute('data-benday-dev-id', id)
    document.head.appendChild(element)
  }
  element.textContent = content
}
export function removeStyle(id) {
  const element = document.querySelector('style[data-benday-dev-id="' + id + '"]')
  if (element !== null) element.remove()
}
export const injectQuery = (url) => url
`
const noDevClient = (): Plugin => ({
  name: 'benday-no-dev-client',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = request.url ?? ''
      if (url !== '/@vite/client' && !url.startsWith('/@vite/client?')) {
        next()
        return
      }
      response.statusCode = 200
      response.setHeader('content-type', 'text/javascript; charset=utf-8')
      response.end(DEV_CLIENT_STUB)
    })
  },
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return html.replace('<script type="module" src="/@vite/client"></script>', '')
    },
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'BENDAY_')
  const publicOrigin = env['BENDAY_PUBLIC_ORIGIN'] ?? 'https://benday.qex.at'

  return {
    plugins: [
      foldkitViewIdentity(),
      inlineFirstPaint(),
      noDevClient(),
      oauthMetadata(publicOrigin),
      buildIdentity(publicOrigin),
    ],
    // A production bundle must not carry a live hot-update branch.
    define: {
      'import.meta.hot': 'undefined',
    },
    resolve: {
      dedupe: ['foldkit', 'effect', '@effect/platform-browser'],
    },
    optimizeDeps: {
      entries: ['src/entry.ts'],
      include: [
        'foldkit',
        'foldkit/html',
        'foldkit/message',
        'foldkit/navigation',
        'foldkit/url',
      ],
      // Vite skips top-level `define` for client development, so the optimizer
      // removes hot branches before the dev import analysis can inject one.
      rolldownOptions: {
        transform: {
          define: { 'import.meta.hot': 'undefined' },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // Development is browser-local: no live reload, no socket, no console
      // forwarding and no DevTools relay carry model state off the page.
      hmr: false,
      ws: false,
      forwardConsole: false,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
  }
})
