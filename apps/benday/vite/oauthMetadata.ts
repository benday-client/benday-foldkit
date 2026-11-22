// SPDX-License-Identifier: GPL-3.0-only
/**
 * The static-hosting OAuth metadata document. The rewrite keeps Benday's
 * single-origin client identity: the client id is the bare HTTPS origin, and
 * one callback serves password and portal sign-in.
 */
export const OAUTH_SCOPE = 'atproto transition:generic'
export const OAUTH_REDIRECT_PATH = '/feed'

export interface OAuthClientMetadata {
  readonly client_id: string
  readonly client_name: string
  readonly client_uri: string
  readonly redirect_uris: readonly string[]
  readonly grant_types: readonly string[]
  readonly response_types: readonly string[]
  readonly scope: string
  readonly token_endpoint_auth_method: 'none'
  readonly application_type: 'web'
  readonly dpop_bound_access_tokens: true
}

export function createOAuthClientMetadata(publicOrigin: string): OAuthClientMetadata {
  const url = new URL(publicOrigin)
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(
      'BENDAY_PUBLIC_ORIGIN must be an https origin with no port, path or credentials',
    )
  }

  const origin = url.origin
  return {
    client_id: `${origin}/oauth-client-metadata.json`,
    client_name: 'benday',
    client_uri: origin,
    redirect_uris: [`${origin}${OAUTH_REDIRECT_PATH}`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: OAUTH_SCOPE,
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  }
}
