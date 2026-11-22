// SPDX-License-Identifier: GPL-3.0-only
export type Theme = 'dark' | 'light'

// Browser chrome follows the page surface. The inline first-paint decoder
// carries the same two values.
const THEME_COLORS: Record<Theme, string> = {
  dark: '#090909',
  light: '#f4f2ef',
}

/** The browser chrome colour for a theme. */
export function themeColor(theme: Theme): string {
  return THEME_COLORS[theme]
}
