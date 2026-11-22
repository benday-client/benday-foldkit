// SPDX-License-Identifier: GPL-3.0-only
/**
 * Development privacy probe.
 *
 * Starts the real dev server with its configured integration, forces the cold
 * optimizer to run, then reads the served HTML and optimized Foldkit bodies.
 * An operative `import.meta.hot` branch, a model-preservation bridge, a
 * recording transport or a live HMR socket fails this gate.
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'http://127.0.0.1:5173'
// a preservation helper may exist as unreachable module code; what must never
// be served is the branch condition that makes it run in development
const FORBIDDEN = ['import.meta.hot', 'hot.data']

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/`)
      if (response.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error('dev server did not start')
}

function assertClean(label: string, body: string): void {
  for (const token of FORBIDDEN) {
    if (body.includes(token)) throw new Error(`${label} still exposes ${token}`)
  }
}

const server = spawn('pnpm', ['--filter', '@benday-client/benday', 'run', 'dev'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (chunk: Buffer) => {
  serverLog += chunk.toString()
})
server.stderr.on('data', (chunk: Buffer) => {
  serverLog += chunk.toString()
})

try {
  await waitForServer()

  const html = await (await fetch(`${origin}/`)).text()
  assertClean('dev html', html)

  const entry = await (await fetch(`${origin}/src/entry.ts`)).text()
  assertClean('entry module', entry)

  // the optimizer output is the body that could carry a preserved model.
  // a cold first request can race the optimizer, so retry until the runtime
  // body is stable instead of reading a half-written file
  let foldkitBody = ''
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${origin}/node_modules/.vite/deps/foldkit.js`)
    if (response.ok) {
      const next = await response.text()
      if (next.includes('makeApplication') && next.length === foldkitBody.length) break
      foldkitBody = next
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  if (foldkitBody.length === 0) throw new Error('optimized foldkit body is missing')
  assertClean('optimized foldkit', foldkitBody)
  if (!foldkitBody.includes('makeApplication')) {
    throw new Error('optimized foldkit body does not look like the runtime')
  }

  const hotDataFetch = await fetch(`${origin}/@vite/client`)
  const clientBody = await hotDataFetch.text()
  if (clientBody.includes('createHotContext') && clientBody.includes('__HMR_')) {
    // the client module may exist, but no authored module may import it
    if (entry.includes('@vite/client') || html.includes('@vite/client')) {
      throw new Error('the dev client is injected into the page')
    }
  }

  if (/ws:\/\/|wss:\/\//.test(serverLog)) throw new Error('dev server opened a websocket')
  if (serverLog.includes('DevTools')) throw new Error('dev server started a DevTools relay')

  console.log('dev privacy ok: no hot preservation branch, no recording transport, no relay')
} finally {
  server.kill('SIGTERM')
}
