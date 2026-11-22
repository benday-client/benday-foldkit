// SPDX-License-Identifier: GPL-3.0-only
/**
 * Neutral rich-text values. Facets are byte-addressed so they survive a trip
 * through the wire record without depending on the SDK's shape.
 */
export type FacetFeature =
  | { readonly kind: 'mention'; readonly did: string; readonly handle: string }
  | { readonly kind: 'link'; readonly uri: string }
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'bold' }
  | { readonly kind: 'italic' }
  | { readonly kind: 'strikethrough' }
  | { readonly kind: 'code' }
  | { readonly kind: 'unknown'; readonly typeName: string }

export interface FacetSpan {
  readonly start: number
  readonly end: number
  readonly feature: FacetFeature
}
