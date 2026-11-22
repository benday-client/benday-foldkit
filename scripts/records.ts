// SPDX-License-Identifier: GPL-3.0-only
/**
 * Narrows an unknown value to a string-keyed record whose fields callers still
 * check.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
