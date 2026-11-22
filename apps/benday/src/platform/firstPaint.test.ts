// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { renderFirstPaintScript } from '../../vite/firstPaintScript.js'

const source = readFileSync(new URL('./firstPaint.js', import.meta.url), 'utf8')

interface ProbeOptions {
  readonly stored: string | null
  readonly systemLight: boolean
  readonly storageThrows?: boolean
}

interface ProbeResult {
  readonly theme: string
  readonly chrome: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Run the inlined classic script with stand-ins for the three browser globals
 * it touches. The script decides the theme; the probe only reads the result.
 */
function runBootstrap(options: ProbeOptions): ProbeResult {
  const script = renderFirstPaintScript(source)
  const meta = {
    value: '#090909',
    setAttribute(_name: string, value: string) {
      meta.value = value
    },
  }
  const document = {
    documentElement: { dataset: {} as Record<string, string> },
    querySelector: (selector: string) => (selector === 'meta[name="theme-color"]' ? meta : null),
  }
  const window = {
    matchMedia: (query: string) => ({ matches: query.includes('light') && options.systemLight }),
  }
  const localStorage = {
    getItem: () => {
      if (options.storageThrows === true) throw new Error('denied')
      return options.stored
    },
  }

  const context: Record<string, unknown> = { localStorage, document, window }
  runInNewContext(
    `${script}\nresult = [document.documentElement.dataset.theme, document.querySelector('meta[name="theme-color"]').value];`,
    context,
  )

  const result = Array.isArray(context['result']) ? context['result'] : []
  return { theme: text(result[0]), chrome: text(result[1]) }
}

describe('first paint bootstrap', () => {
  it('inlines declarations without module syntax', () => {
    const script = renderFirstPaintScript(source)
    expect(script).not.toMatch(/^export\s/m)
    expect(script).toContain('applyFirstPaint();')
    expect(script).not.toContain('import ')
  })

  it('applies an explicit stored mode and updates browser chrome', () => {
    const stored = JSON.stringify({ state: { appearance: 'light' }, version: 3 })
    expect(runBootstrap({ stored, systemLight: false })).toEqual({
      theme: 'light',
      chrome: '#f4f2ef',
    })
  })

  it('follows the system when the envelope is absent or unusable', () => {
    expect(runBootstrap({ stored: null, systemLight: true }).theme).toBe('light')
    expect(runBootstrap({ stored: '{not json', systemLight: false }).theme).toBe('dark')
    expect(runBootstrap({ stored: JSON.stringify({ state: null }), systemLight: true }).theme).toBe(
      'light',
    )
    expect(
      runBootstrap({
        stored: JSON.stringify({ state: { appearance: 'purple' } }),
        systemLight: false,
      }).theme,
    ).toBe('dark')
  })

  it('keeps the system fallback when storage is denied', () => {
    expect(runBootstrap({ stored: null, systemLight: true, storageThrows: true }).theme).toBe(
      'light',
    )
  })
})
