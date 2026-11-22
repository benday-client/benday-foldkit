// SPDX-License-Identifier: GPL-3.0-only
/**
 * The one import order for the application cascade. Faces load before tokens,
 * structural rules before surfaces, and the static texture last so it only
 * changes texture.
 */
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/instrument-sans/400.css'
import '@fontsource/instrument-sans/400-italic.css'
import '@fontsource/instrument-sans/600.css'
import './fonts.css'
import './tokens.css'
import './base.css'
import './layout.css'
import './landing.css'
import './texture.css'
