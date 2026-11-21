/* Copyright (c) 2020 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. https://mozilla.org/MPL/2.0/. */

import { sendWithPromise } from '//resources/js/cr.js'
import { injectStyle } from '//resources/brave/lit_overriding.js'
import { css } from '//resources/lit/v3_0/lit.rollup.js'
import type { PropertyValues } from '//resources/lit/v3_0/lit.rollup.js'
import { loadTimeData } from '../i18n_setup.js'
import { SettingsAboutPageElement } from '../about_page/about_page.js'

// The native npm updater owns update checks, consent and restart. The inherited
// Chromium updater has no release identity for Ecom.
injectStyle(SettingsAboutPageElement, css`
  .icon-container, #updateStatusMessage, #buttonContainer, .separator,
  #promoteUpdater, #updateStatusMessage ~ .secondary { display: none !important; }
  #ecom-about-version { font-size: 1.1em; margin-bottom: 8px; }
  #ecom-about-source { overflow-wrap: anywhere; margin: 8px 0; }
  #ecom-about-update { margin-top: 12px; }
`)

type ReleaseInfo = {
  version?: string
  packageName?: string
  channel?: string
  phase: string
  canUpdate: boolean
}
const timers = new WeakMap<SettingsAboutPageElement, number>()

function attachAboutInfo(page: SettingsAboutPageElement) {
  const root = page.shadowRoot
  const host = root?.querySelector('#updateStatusMessage')?.parentElement
  if (!host || root?.querySelector('#ecom-about-info')) return
  const info = document.createElement('div')
  info.id = 'ecom-about-info'
  const version = document.createElement('div')
  version.id = 'ecom-about-version'
  const chromium = document.createElement('div')
  chromium.className = 'secondary'
  const numbers = loadTimeData.getString('aboutBrowserVersion')
    .match(/\d+\.\d+(?:\.\d+)*/g)
  chromium.textContent = `Chromium: ${numbers?.[1] ?? numbers?.[0] ?? ''}`
  const status = document.createElement('div')
  status.id = 'ecom-about-status'
  status.setAttribute('role', 'status')
  const source = document.createElement('div')
  source.id = 'ecom-about-source'
  source.className = 'secondary'
  const button = document.createElement('cr-button')
  button.id = 'ecom-about-update'
  button.textContent = loadTimeData.getString('ecomAboutCheck')
  button.addEventListener('click', () => chrome.send('ecomAboutUpdate'))
  info.append(version, chromium, source, status, button)
  host.appendChild(info)
  let pending = false
  const refresh = async () => {
    if (pending || !page.isConnected || document.hidden) return
    pending = true
    try {
      const value = await sendWithPromise<ReleaseInfo>('ecomAboutInfo')
      if (!page.isConnected) return
      const packaged = !!value.version
      version.textContent = packaged ? `Ecom ${value.version}` : 'Ecom Dev'
      source.textContent = packaged
        ? `${loadTimeData.getString('ecomAboutSource')}: ${value.packageName ?? ''} · ${value.channel ?? ''}`
        : ''
      const messages: Record<string, string> = {
        managed: loadTimeData.getString('ecomAboutManaged'),
        available: loadTimeData.getString('ecomAboutAvailable'),
        downloading: loadTimeData.getString('ecomAboutDownloading'),
        ready: loadTimeData.getString('ecomAboutReady'),
      }
      status.textContent = packaged
        ? messages[value.phase] ?? messages.managed
        : loadTimeData.getString('ecomAboutDev')
      button.hidden = !value.canUpdate
      button.toggleAttribute('disabled', value.phase === 'downloading')
      button.textContent = loadTimeData.getString(
        value.phase === 'ready' ? 'ecomAboutRestart' : 'ecomAboutCheck')
    } catch {
      status.textContent = loadTimeData.getString('ecomAboutUnavailable')
      button.hidden = true
    } finally { pending = false }
  }
  void refresh()
  // Presentation-only IPC; no registry request or disk access after the first
  // metadata read. Stop when the About element leaves the document.
  timers.set(page, window.setInterval(() => { void refresh() }, 2000))
}

const proto = SettingsAboutPageElement.prototype as unknown as {
  firstUpdated?: (changed: PropertyValues) => void
  connectedCallback: () => void
  disconnectedCallback: () => void
}
const firstUpdated = proto.firstUpdated
proto.firstUpdated = function(this: SettingsAboutPageElement, changed: PropertyValues) {
  firstUpdated?.call(this, changed)
  attachAboutInfo(this)
}
const connected = proto.connectedCallback
proto.connectedCallback = function(this: SettingsAboutPageElement) {
  connected.call(this)
  // Settings can reuse the same element after navigating away and back.
  if (this.shadowRoot?.querySelector('#ecom-about-info')) {
    this.shadowRoot.querySelector('#ecom-about-info')?.remove()
    attachAboutInfo(this)
  }
}
const disconnected = proto.disconnectedCallback
proto.disconnectedCallback = function(this: SettingsAboutPageElement) {
  window.clearInterval(timers.get(this))
  timers.delete(this)
  disconnected.call(this)
}
