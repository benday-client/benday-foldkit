// SPDX-License-Identifier: GPL-3.0-only
/**
 * The first-paint theme decision. The build inlines this file's declarations
 * into index.html; the test executes the same source.
 */

const SETTINGS_KEY = 'benday:settings'
const THEME_COLORS = { dark: '#090909', light: '#f4f2ef' }

/**
 * @param {unknown} value
 * @returns {value is 'light' | 'dark' | 'system'}
 */
export function isAppearanceMode(value) {
  return value === 'light' || value === 'dark' || value === 'system'
}

/**
 * An explicit mode is fixed; system follows the browser preference.
 * @param {'light' | 'dark' | 'system'} appearance
 * @param {boolean} systemLight
 * @returns {'light' | 'dark'}
 */
export function themeForAppearance(appearance, systemLight) {
  if (appearance === 'light') return 'light'
  if (appearance === 'dark') return 'dark'
  return systemLight ? 'light' : 'dark'
}

/** @returns {boolean} */
export function systemPrefersLight() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  )
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Only a well-formed envelope contributes a preference. Anything else means
 * "no stored preference", and the system fallback still decides the scheme.
 * @param {string | null} raw
 * @returns {{ appearance: 'light' | 'dark' | 'system' } | null}
 */
export function readStoredEnvelope(raw) {
  if (raw === null) return null
  /** @type {unknown} */
  let stored
  try {
    stored = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(stored) || !isRecord(stored['state'])) return null
  const appearance = stored['state']['appearance']
  return { appearance: isAppearanceMode(appearance) ? appearance : 'system' }
}

/**
 * @param {Pick<Storage, 'getItem'> | null} storage
 * @returns {{ appearance: 'light' | 'dark' | 'system' }}
 */
export function readSettings(storage) {
  let raw = null
  try {
    raw = storage === null ? null : storage.getItem(SETTINGS_KEY)
  } catch {
    raw = null
  }
  return readStoredEnvelope(raw) ?? { appearance: 'system' }
}

/** Apply the stored appearance to the document before the app starts. */
export function applyFirstPaint() {
  // accessing the global itself throws in browsers that deny site storage
  /** @type {Pick<Storage, 'getItem'> | null} */
  let storage = null
  try {
    storage = localStorage
  } catch {
    storage = null
  }
  const settings = readSettings(storage)
  const theme = themeForAppearance(settings.appearance, systemPrefersLight())
  document.documentElement.dataset['theme'] = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta !== null) meta.setAttribute('content', THEME_COLORS[theme] ?? '#090909')
}
