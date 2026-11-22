// SPDX-License-Identifier: GPL-3.0-only
/**
 * The one runtime record guard for verification tooling. A successful check
 * narrows the value to a string-keyed record whose fields are still unknown;
 * callers check the fields they use.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
