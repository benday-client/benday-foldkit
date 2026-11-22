// SPDX-License-Identifier: GPL-3.0-only
import { Runtime } from 'foldkit'
import { Model } from './app/model.js'
import { init, routing, update } from './app/update.js'
import { view } from './app/view.js'
import './styles/appStyles.js'

const container = document.getElementById('root')

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container,
  routing,
  // Development and production both refuse the DevTools relay: no model
  // snapshot, Message history or credential field leaves the page.
  devTools: false,
})

Runtime.run(application)
