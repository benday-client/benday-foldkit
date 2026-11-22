// SPDX-License-Identifier: GPL-3.0-only
import { expect, test } from '@playwright/test'

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 390, height: 844 }

const LANDING_COPY = 'a card reader for your own bluesky'
const BODY_COPY =
  'access to benday is by invitation while we polish it. use your own bluesky account to log in. nothing is written without your say so.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

test.describe('anonymous landing', () => {
  for (const viewport of [DESKTOP, MOBILE]) {
    test(`paints the front door at ${String(viewport.width)}px`, async ({ page }) => {
      const failures: string[] = []
      page.on('pageerror', (error) => failures.push(error.message))
      await page.setViewportSize(viewport)
      await page.goto('/')

      await expect(page.getByRole('heading', { level: 1, name: LANDING_COPY })).toBeVisible()
      await expect(page.getByText(BODY_COPY, { exact: true })).toBeVisible()
      await expect(page.getByText('closed beta', { exact: true })).toBeVisible()

      const action = page.getByRole('button', { name: 'log in with bluesky' })
      await expect(action).toBeVisible()
      await expect(action).toBeDisabled()

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(page).toHaveTitle('benday // bluesky client')
      expect(failures).toEqual([])
    })
  }

  test('skips into the route with the skip link', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'skip to content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
    await expect(page).toHaveURL(/\/$/)
  })

  test('keeps fragment focus and history on a query route', async ({ page }) => {
    await page.goto('/feed?x=1')
    const before = await page.evaluate(() => history.length)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
    await expect(page).toHaveURL('/feed?x=1')
    expect(await page.evaluate(() => history.length)).toBe(before)
  })

  test('decides the stored scheme before the app bundle runs', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem(
        'benday:settings',
        JSON.stringify({
          state: { appearance: 'light', keyboardShortcuts: true, imageEffects: true },
          version: 3,
        }),
      )
    })
    await page.route('**/assets/index-*.js', (route) => route.abort())
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f4f2ef')
  })

  test('keeps the served artifact identifiable', async ({ request }) => {
    const response = await request.get('/build-identity.json')
    expect(response.ok()).toBe(true)
    const body: unknown = await response.json()
    expect(isRecord(body)).toBe(true)
    const sourceSha = isRecord(body) ? body['sourceSha'] : undefined
    const files = isRecord(body) ? body['files'] : undefined
    expect(typeof sourceSha).toBe('string')
    expect(Array.isArray(files)).toBe(true)
    const names = Array.isArray(files) ? files.filter((file) => typeof file === 'string') : []
    expect(names.some((file) => file.endsWith('.js'))).toBe(true)
  })

  test('serves the oauth metadata as json and the shell for a deep link', async ({ request }) => {
    const metadata = await request.get('/oauth-client-metadata.json')
    expect(metadata.headers()['content-type']).toContain('application/json')
    const body: unknown = await metadata.json()
    expect(isRecord(body)).toBe(true)
    expect(isRecord(body) ? body['scope'] : null).toBe('atproto transition:generic')
    expect(isRecord(body) ? body['redirect_uris'] : null).toEqual(['https://benday.qex.at/feed'])

    const deep = await request.get('/feed?x=1')
    expect(deep.ok()).toBe(true)
    expect(await deep.text()).toContain('<div id="root"></div>')
  })
})
