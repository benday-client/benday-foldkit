// SPDX-License-Identifier: GPL-3.0-only
/**
 * Turn the first-paint module into a classic inline script. The module's
 * declarations are reused verbatim and only the `export` keywords are dropped,
 * so the pre-paint decoder cannot drift from the one the app imports.
 */
const EXPORT_PREFIX = /^export\s+/gm

export function renderFirstPaintScript(source: string): string {
  const declarations = source.replace(EXPORT_PREFIX, '')
  return `${declarations}\napplyFirstPaint();\n`
}
