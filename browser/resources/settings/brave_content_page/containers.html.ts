// Copyright (c) 2025 The Brave Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at https://mozilla.org/MPL/2.0/.

import {
  html,
  nothing,
  repeat,
} from 'chrome://resources/lit/v3_0/lit.rollup.js'
import { SettingsBraveContentContainersElement } from './containers.js'
import { ContainersStrings } from '../brave_generated_resources_webui_strings.js'
import { Icon } from '../containers.mojom-webui.js'
import { skColorToHexColor } from 'chrome://resources/js/color_utils.js'
import backgroundColors from './background_colors.js'

// Bootstrap the custom element that are used in this component.
import './containers_icon.js'
import './containers_background_chip.js'

export function getHtml(this: SettingsBraveContentContainersElement) {
  return html`<!--_html_template_start_-->
    <settings-section
      id="containers"
      page-title="$i18n{SETTINGS_CONTAINERS_SECTION_LABEL}"
    >
      <div class="cr-row first two-line">
        <div class="flex">
          <localized-link
            id="learn-more"
            .localizedString="${this.i18nAdvanced(
              ContainersStrings.SETTINGS_CONTAINERS_SECTION_DESCRIPTION,
            )}"
            .linkUrl="${this.i18n('containersLearnMoreURL')}"
          >
          </localized-link>
        </div>
      </div>

      <settings-toggle-button
        pref-key="brave.containers.enabled"
        icon="container-on"
        label="$i18n{SETTINGS_CONTAINERS_ENABLED_LABEL}"
      ></settings-toggle-button>

      ${this.containersEnabledPref_?.value
        ? html`
            <div class="shop-panel">
              <h2>${this.shopText_('TITLE')}</h2>
              <p class="shop-intro">${this.shopText_('INTRO')}</p>
              <div class="shop-create">
                <label
                  >${this.shopText_('PLATFORM')}
                  <select
                    .value="${this.shopPlatform_}"
                    @change="${this.onShopPlatformChange_}"
                    ?disabled="${this.shopBusy_}"
                  >
                    <option value="">${this.shopText_('SELECT')}</option>
                    <option value="taobao">${this.shopText_('TAOBAO')}</option>
                  </select>
                </label>
                <cr-input
                  label="${this.shopText_('NAME')}"
                  .value="${this.shopName_}"
                  @input="${this.onShopNameInput_}"
                  ?disabled="${this.shopBusy_}"
                  maxlength="60"
                ></cr-input>
                <cr-button
                  class="action-button"
                  @click="${this.onCreateShop_}"
                  ?disabled="${this.shopBusy_
                  || !this.shopName_.trim()
                  || !this.shopPlatform_}"
                  >${this.shopText_('CREATE')}</cr-button
                >
              </div>
              <div
                class="shop-message"
                role="status"
                aria-live="polite"
              >
                ${this.shopBusy_ ? this.shopText_('BUSY') : this.shopError_}
              </div>
              ${repeat(
                this.shopRows_,
                (row) => row.id,
                (row) =>
                  html` <div class="shop-card">
                    <div class="shop-card-header">
                      <strong>${row.name}</strong>
                      <span
                        class="shop-state ${row.state === 'ready'
                          ? 'ready'
                          : ''}"
                        >${this.shopState_(row)}</span
                      >
                    </div>
                    ${row.platform
                      ? html`<div class="shop-platform">
                          ${this.shopText_('TAOBAO')}
                        </div>`
                      : nothing}
                    ${row.identity || row.candidate
                      ? html` <div class="shop-identity">
                          ${this.shopText_('IDENTITY')}：${(row.identity
                            || row.candidate)!.platformName}
                          <div>
                            Shop ID: ${(row.identity || row.candidate)!.shopId}
                            · Account ID:
                            ${(row.identity || row.candidate)!.accountId}
                          </div>
                          <div>
                            ${this.shopText_(
                              'LAST_CHECKED',
                            )}：${this.shopChecked_(
                              (row.identity || row.candidate)!,
                            )}
                          </div>
                        </div>`
                      : nothing}
                    <div class="shop-actions">
                      ${!row.platform
                        ? html`
                            <cr-button
                              data-id="${row.id}"
                              data-action="configure"
                              @click="${this.onShopAction_}"
                              ?disabled="${this.shopBusy_}"
                              >${this.shopText_('CONFIGURE')}</cr-button
                            >
                          `
                        : html`
                            <cr-button
                              data-id="${row.id}"
                              data-action="open"
                              data-service="sycm"
                              @click="${this.onShopAction_}"
                              ?disabled="${this.shopBusy_}"
                              >${this.shopText_('LOGIN')}</cr-button
                            >
                            <cr-button
                              data-id="${row.id}"
                              data-action="open"
                              data-service="qianniu"
                              @click="${this.onShopAction_}"
                              ?disabled="${this.shopBusy_}"
                              >${this.shopText_('QIANNIU')}</cr-button
                            >
                            <cr-button
                              data-id="${row.id}"
                              data-action="open"
                              data-service="alimama"
                              @click="${this.onShopAction_}"
                              ?disabled="${this.shopBusy_}"
                              >${this.shopText_('ALIMAMA')}</cr-button
                            >
                            <cr-button
                              data-id="${row.id}"
                              data-action="verify"
                              @click="${this.onShopAction_}"
                              ?disabled="${this.shopBusy_}"
                              >${this.shopText_('VERIFY')}</cr-button
                            >
                            ${row.candidate
                            && row.state === 'awaiting-confirmation'
                              ? html` <cr-button
                                  class="action-button"
                                  data-id="${row.id}"
                                  data-action="confirm"
                                  @click="${this.onShopAction_}"
                                  ?disabled="${this.shopBusy_}"
                                  >${this.shopText_('CONFIRM')}</cr-button
                                >`
                              : nothing}
                          `}
                    </div>
                  </div>`,
              )}
              <p class="shop-intro">${this.shopText_('SERVICE_NOTE')}</p>
              <cr-button
                @click="${this.refreshShops_}"
                ?disabled="${this.shopBusy_}"
                >${this.shopText_('REFRESH')}</cr-button
              >
              <h3>${this.shopText_('GENERAL')}</h3>
            </div>
            <settings-toggle-button
              pref-key="brave.tabs.always_use_mini_accent_icon"
              icon="container-on"
              label="$i18n{SETTINGS_CONTAINERS_ALWAYS_USE_MINI_ICON_LABEL}"
            ></settings-toggle-button>
            ${this.containersList_?.length
              ? html`
                  <div class="cr-row continuation">
                    <div
                      class="list"
                      @dragenter="${this.onListDragenter_}"
                      @dragover="${this.onListDragover_}"
                      @drop="${this.onListDrop_}"
                    >
                      ${repeat(
                        this.dragReorderedItems_(this.containersList_),
                        (item) => item.id,
                        (item) => html`
                          <div
                            class="container ${this.dragRowClass_(item.id)}"
                            data-drag-id="${item.id}"
                          >
                            <div class="icon-and-label">
                              ${this.dragHandleTemplate_(item.id)}
                              <settings-brave-content-containers-icon
                                icon="${item.icon}"
                                background-color="${skColorToHexColor(
                                  item.backgroundColor,
                                )}"
                                disabled
                              ></settings-brave-content-containers-icon>
                              <div class="label">${item.name}</div>
                            </div>
                            <div>
                              <cr-icon-button
                                @click="${this.onEditContainerClick_}"
                                data-id="${item.id}"
                                class="size-20"
                                iron-icon="edit-pencil"
                              >
                              </cr-icon-button>
                              <cr-icon-button
                                @click="${this.onDeleteContainerClick_}"
                                data-id="${item.id}"
                                class="size-20"
                                iron-icon="trash"
                              >
                              </cr-icon-button>
                            </div>
                          </div>
                        `,
                      )}
                    </div>
                  </div>
                `
              : nothing}
            <div class="cr-row continuation containers-add-row">
              <cr-button
                @click="${this.onAddContainerClick_}"
                size="small"
              >
                $i18n{SETTINGS_CONTAINERS_ADD_CONTAINER_LABEL}
              </cr-button>
            </div>
          `
        : nothing}
      ${this.editingContainer_
        ? html`
            <cr-dialog
              id="editContainerDialog"
              show-close-button
              show-on-attach
              @close="${this.onDialogClose_}"
            >
              <div slot="title">${this.getEditDialogTitle_()}</div>
              <div slot="body">
                <div class="flex editing-container">
                  <section class="name-section">
                    <div class="edit-subsection-label">
                      $i18n{SETTINGS_CONTAINERS_CONTAINER_NAME_LABEL}
                    </div>
                    <cr-input
                      .value="${this.editingContainer_.name}"
                      @input="${this.onContainerNameInput_}"
                      autofocus
                      required
                      auto-validate
                      pattern="^.*\\S.*$"
                      placeholder="$i18n{SETTINGS_CONTAINERS_CONTAINER_NAME_PLACEHOLDER}"
                      maxlength="20"
                    >
                      <span slot="inline-suffix" class="name-char-counter">
                        ${(this.editingContainer_.name ?? '').length} / 20
                      </span>
                    </cr-input>
                  </section>
                  <section class="background-colors-section">
                    <div class="edit-subsection-label">
                        $i18n{SETTINGS_CONTAINERS_CONTAINER_COLOR_LABEL}
                    </div>
                    <div class="background-colors-list">
                      ${backgroundColors.map(
                        (color) => html`
                          <settings-brave-content-containers-background-chip
                            ?selected="${color.value
                            === this.editingContainer_!.backgroundColor.value}"
                            background-color="${skColorToHexColor(color)}"
                            @background-selected="${this
                              .onContainersBackgroundSelected_}"
                          ></settings-brave-content-containers-background-chip>
                        `,
                      )}
                    </div>
                  </section>
                  <section class="icons-section">
                    <div class="edit-subsection-label">
                        $i18n{SETTINGS_CONTAINERS_CONTAINER_ICON_LABEL}
                    </div>
                    <div class="icons-list">
                      ${[...Array(Icon.MAX_VALUE - Icon.MIN_VALUE + 1).keys()]
                        .map((i) => Icon.MIN_VALUE + i)
                        .map(
                          (icon) => html`
                            <settings-brave-content-containers-icon
                              background-color="${skColorToHexColor(
                                this.editingContainer_!.backgroundColor,
                              )}"
                              icon=${icon}
                              ?selected="${icon
                              === this.editingContainer_!.icon}"
                              @icon-selected="${this.onContainersIconSelected_}"
                            ></settings-brave-content-containers-icon>
                          `,
                        )}
                    </section>
                  </div>
                </div>
                ${
                  this.editDialogError_
                    ? html`
                        <div class="error-message">
                          ${this.editDialogError_}
                        </div>
                      `
                    : nothing
                }
              </div>
              <div slot="button-container">
                <cr-button
                  class="cancel-button"
                  @click="${this.onCancelDialogClick_}"
                >
                  $i18n{cancel}
                </cr-button>
                <cr-button
                  class="action-button"
                  @click="${this.onSaveContainerFromDialogClick_}"
                  ?disabled="${
                    !this.editingContainer_?.name
                    || this.isEditDialogNameInvalid_
                  }"
                >
                  $i18n{save}
                </cr-button>
              </div>
            </cr-dialog>
          `
        : nothing}
      ${this.deletingContainer_
        ? html`
            <cr-dialog
              id="deleteContainerDialog"
              show-close-button
              show-on-attach
              @close="${this.onDialogClose_}"
            >
              <div slot="title">
                $i18n{SETTINGS_CONTAINERS_DELETE_CONTAINER_LABEL}
              </div>
              <div slot="body">
                <div class="label">
                  ${this.i18n(
                    ContainersStrings.SETTINGS_CONTAINERS_DELETE_CONTAINER_DESCRIPTION,
                    this.deletingContainer_.name,
                  )}
                </div>
                ${this.deleteDialogError_
                  ? html`
                      <div class="error-message">
                        ${this.deleteDialogError_}
                      </div>
                    `
                  : nothing}
              </div>
              <div slot="button-container">
                <cr-button
                  class="cancel-button"
                  @click="${this.onCancelDialogClick_}"
                >
                  $i18n{cancel}
                </cr-button>
                <cr-button
                  class="tonal-button"
                  @click="${this.onDeleteContainerFromDialogClick_}"
                >
                  $i18n{delete}
                </cr-button>
              </div>
            </cr-dialog>
          `
        : nothing}
    </settings-section>
    <!--_html_template_end_-->`
}
