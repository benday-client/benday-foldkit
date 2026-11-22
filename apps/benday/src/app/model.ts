// SPDX-License-Identifier: GPL-3.0-only
import { Schema } from 'effect'

/** Which anonymous shell the current URL asks for. */
export const ShellModel = Schema.Struct({
  pathname: Schema.String,
})

export type ShellModel = typeof ShellModel.Type

/**
 * Authentication is a value the shell reads, not a handle it holds. Foundation
 * builds only ever report the anonymous state.
 */
export const AuthModel = Schema.Struct({
  status: Schema.Literal('anonymous'),
})

export type AuthModel = typeof AuthModel.Type

/** Overlay ownership is one slot; the source allows one dialog at a time. */
export const OverlayModel = Schema.Struct({
  open: Schema.NullOr(Schema.Literals(['login', 'help', 'settings', 'account'])),
})

export type OverlayModel = typeof OverlayModel.Type

export const Model = Schema.Struct({
  shell: ShellModel,
  auth: AuthModel,
  overlay: OverlayModel,
})

export type Model = typeof Model.Type
