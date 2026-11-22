// SPDX-License-Identifier: GPL-3.0-only
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { foldkitViewIdentity } from '@foldkit/vite-plugin'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { renderFirstPaintScript } from './vite/firstPaintScript.js'
import { createOAuthClientMetadata } from './vite/oauthMetadata.js'

function git(args: readonly string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

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
      sourceSha: git(['rev-parse', 'HEAD']),
      dirty: git(['status', '--porcelain']).length > 0,
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'BENDAY_')
  const publicOrigin = env['BENDAY_PUBLIC_ORIGIN'] ?? 'https://benday.qex.at'

  return {
    plugins: [foldkitViewIdentity(), inlineFirstPaint(), oauthMetadata(publicOrigin), buildIdentity(publicOrigin)],
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
