// SPDX-License-Identifier: GPL-3.0-only
/**
 * Frozen old-app capture.
 *
 * Pins the oracle to the reviewed reference SHA, serves that checkout's
 * production build, and records painted landing evidence per engine and
 * profile. Replacement goldens are never generated here; the comparison reads
 * these files.
 */
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium, firefox, webkit, type BrowserType } from 'playwright-core'

const PINNED_SOURCE_SHA = '237e98b3f2e46e3843eece22ab2429ae0cb0708c'
const REFERENCE = process.env['BENDAY_REFERENCE_DIR']

if (REFERENCE === undefined || REFERENCE.length === 0) {
  throw new Error('BENDAY_REFERENCE_DIR must point at the pinned reference checkout')
}

const reference = resolve(REFERENCE)
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: reference, encoding: 'utf8' })
if (revision.status !== 0) throw new Error(`${reference} is not a git checkout`)
if (revision.stdout.trim() !== PINNED_SOURCE_SHA) {
  throw new Error(`reference is at ${revision.stdout.trim()}, expected ${PINNED_SOURCE_SHA}`)
}
const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: reference, encoding: 'utf8' })
if (dirty.status !== 0 || dirty.stdout.trim().length > 0) {
  throw new Error('reference checkout has local changes; capture needs the frozen tree')
}

const dist = join(reference, 'dist')
if (!existsSync(join(dist, 'index.html'))) {
  throw new Error(`${dist} has no built index.html; build the reference at the pinned SHA`)
}

const output = resolve('.verification', 'reference')
mkdirSync(output, { recursive: true })

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const requested = normalize(join(dist, decodeURIComponent(url.pathname)))
  const inside = requested.startsWith(dist + sep)
  const file =
    inside && existsSync(requested) && !requested.endsWith('/') ? requested : join(dist, 'index.html')
  try {
    const body = readFileSync(file)
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404)
    response.end('not found')
  }
})

await new Promise<void>((resolveListen) => {
  server.listen(4280, '127.0.0.1', resolveListen)
})

const PROFILES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
] as const

const ENGINES: ReadonlyArray<{ name: string; type: BrowserType }> = [
  { name: 'chromium', type: chromium },
  { name: 'firefox', type: firefox },
  { name: 'webkit', type: webkit },
]

interface Capture {
  readonly engine: string
  readonly profile: string
  readonly viewport: { readonly width: number; readonly height: number }
  readonly browserVersion: string
  readonly surface: string
  readonly heading: string
  readonly headingFontSize: string
  readonly headingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly bodyFont: string
  readonly screenshot: string
}

const captures: Capture[] = []

try {
  for (const engine of ENGINES) {
    const browser = await engine.type.launch()
    try {
      for (const profile of PROFILES) {
        const context = await browser.newContext({
          viewport: { width: profile.width, height: profile.height },
          deviceScaleFactor: 1,
          colorScheme: 'dark',
          reducedMotion: 'no-preference',
        })
        const page = await context.newPage()
        await page.goto('http://127.0.0.1:4280/', { waitUntil: 'load' })
        await page.evaluate(async () => {
          await document.fonts.ready
        })
        const heading = page.locator('h1').first()
        await heading.waitFor({ state: 'visible' })
        const details = await heading.evaluate((element) => {
          const style = getComputedStyle(element)
          const box = element.getBoundingClientRect()
          return {
            text: element.textContent?.trim() ?? '',
            fontSize: style.fontSize,
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
          }
        })
        const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
        const surface = await page.evaluate(() => {
          if (document.querySelector('.b-landing') !== null) return 'landing'
          if (document.querySelector('.b-signedout') !== null) return 'signedout'
          return 'other'
        })
        const file = `${engine.name}-${profile.name}.png`
        await page.screenshot({ path: join(output, file), fullPage: false })
        captures.push({
          engine: engine.name,
          profile: profile.name,
          viewport: { width: profile.width, height: profile.height },
          browserVersion: browser.version(),
          surface,
          heading: details.text,
          headingFontSize: details.fontSize,
          headingBox: details.box,
          bodyFont,
          screenshot: file,
        })
        await context.close()
      }
    } finally {
      await browser.close()
    }
  }

  const manifest = {
    sourceSha: PINNED_SOURCE_SHA,
    capturedAt: new Date().toISOString(),
    profiles: PROFILES,
    captures,
  }
  writeFileSync(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`capture ok: ${String(captures.length)} old-app captures under ${output}`)
} finally {
  server.close()
}
