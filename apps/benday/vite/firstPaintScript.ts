// SPDX-License-Identifier: GPL-3.0-only
/**
 * Renders the first-paint module as a classic inline script by dropping the
 * `export` keywords and appending the call.
 */
const EXPORT_PREFIX = /^export\s+/gm

export function renderFirstPaintScript(source: string): string {
  const declarations = source.replace(EXPORT_PREFIX, '')
  return `${declarations}\napplyFirstPaint();\n`
}
