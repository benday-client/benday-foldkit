// SPDX-License-Identifier: GPL-3.0-only
/**
 * Development privacy probe.
 *
 * Starts the real dev server on a free port, reads the served HTML, every app
 * module and every pre-bundled Foldkit entry, then loads the page in Chromium
 * and records websocket construction, websocket connections and requests.
 * Fails on `import.meta.hot`/`hot.data` in those bodies, any websocket, a
 * `/devtools`, `/mcp` or `/__dev` request, or a relay line in the server
 * output. Vite's client is replaced by a local stub; styles must still apply.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'http://127.0.0.1:5173'
const FORBIDDEN_BODY = ['import.meta.hot', 'hot.data']
const FORBIDDEN_PATHS = ['/devtools', '/mcp', '/__dev']

function fail(message: string): never {
  throw new Error(message)
}

function assertCleanBody(label: string, body: string): void {
  for (const token of FORBIDDEN_BODY) {
    if (body.includes(token)) fail(`${label} still exposes ${token}`)
  }
}

function walk(directory: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(directory)) {
    const full = join(directory, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

async function assertPortFree(): Promise<void> {
  try {
    await fetch(`${origin}/`, { signal: AbortSignal.timeout(1000) })
    fail('port 5173 already answers; a foreign server would make this probe meaningless')
  } catch (error) {
    if (error instanceof Error && error.message.includes('foreign server')) throw error
  }
}

function stop(child: ChildProcess): void {
  const pid = child.pid
  if (pid === undefined) return
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }, 3000).unref()
}

await assertPortFree()

const server = spawn('pnpm', ['--filter', '@benday-client/benday', 'run', 'dev'], {
  cwd: root,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout?.on('data', (chunk: Buffer) => {
  serverLog += chunk.toString()
})
server.stderr?.on('data', (chunk: Buffer) => {
  serverLog += chunk.toString()
})

try {
  const deadline = Date.now() + 60_000
  let ready = false
  while (Date.now() < deadline && !ready) {
    if (server.exitCode !== null) fail(`dev server exited early:\n${serverLog}`)
    try {
      const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(1000) })
      ready = response.ok
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }
  }
  if (!ready) fail(`dev server did not start:\n${serverLog}`)

  const html = await (await fetch(`${origin}/`)).text()
  assertCleanBody('dev html', html)

  // every authored app module, not just the entry
  const appRoot = join(root, 'apps', 'benday')
  for (const path of walk(join(appRoot, 'src'))) {
    if (!path.endsWith('.ts') && !path.endsWith('.js')) continue
    const url = `${origin}/${relative(appRoot, path).split('\\').join('/')}`
    const response = await fetch(url)
    if (!response.ok) fail(`${url} did not serve (${String(response.status)})`)
    assertCleanBody(url, await response.text())
  }

  // every explicit optimizer entry, and a missing one is a config drift
  const optimized = ['foldkit', 'foldkit_html', 'foldkit_message', 'foldkit_navigation', 'foldkit_url']
  for (const name of optimized) {
    const url = `${origin}/node_modules/.vite/deps/${name}.js`
    const response = await fetch(url)
    if (!response.ok) fail(`${url} is missing; optimizeDeps.include drifted`)
    const body = await response.text()
    assertCleanBody(url, body)
  }

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ colorScheme: 'dark' })
    const sockets: string[] = []
    const forbidden: string[] = []
    page.on('websocket', (socket) => sockets.push(socket.url()))
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      for (const token of FORBIDDEN_PATHS) {
        if (path === token || path.startsWith(`${token}/`)) forbidden.push(request.url())
      }
    })
    await page.goto(`${origin}/`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    if (sockets.length > 0) fail(`dev page opened a websocket: ${sockets.join(', ')}`)
    if (forbidden.length > 0) fail(`dev page requested a recording endpoint: ${forbidden.join(', ')}`)
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    if (background !== 'rgb(9, 9, 9)') {
      fail(`dev styles did not apply through the client stub (body background ${background})`)
    }
  } finally {
    await browser.close()
  }

  if (/ws:\/\/|wss:\/\//.test(serverLog)) fail('dev server opened a websocket')
  if (serverLog.includes('DevTools')) fail('dev server started a DevTools relay')

  console.log(
    'dev privacy ok: no hot branch in served modules or optimized deps, no websocket, no recording endpoint',
  )
} finally {
  stop(server)
}
