// Copyright 2026 Ecom Authors. MPL-2.0.
import './strings.m.js'
import { sendWithPromise } from 'chrome://resources/js/cr.js'
import { loadTimeData } from 'chrome://resources/js/load_time_data.js'
import {
  filterShops,
  shopRequest,
  iconNames,
  appearanceRequest,
  deletionRequest,
  displayPlatform,
  homePresets,
  normalizeHomeUrl,
  homeLabel,
} from './model.js'

const zh = {
  workspace: '我的工作空间',
  title: '店铺管理',
  intro: '管理平台账号与登录状态，在同一个浏览器中切换店铺。',
  all: '全部账号',
  taobao: '淘宝 / 天猫',
  general: '普通容器',
  local: '会话保存在本机 Ecom',
  add: '添加店铺',
  search: '搜索店铺名称、账号或店铺 ID',
  refresh: '刷新',
  allStates: '全部',
  ready: '身份已核验',
  pending: '待处理',
  shop: '店铺名称',
  platform: '所属平台',
  account: '平台账号',
  status: '登录 / 核验状态',
  checked: '上次核验',
  actions: '操作',
  empty: '暂无匹配的店铺',
  emptyHint: '添加店铺，或调整搜索和筛选条件。',
  tabHint: '同店共用会话 · 不同店铺独立标签标识',
  serviceNote:
    '每个店铺使用独立会话，在同一 Ecom 窗口中打开。此处核验生意参谋身份；千牛、万相台的登录与授权在各自页面确认。',
  appearance: '容器外观设置',
  newAccount: '新建平台账号',
  createHint:
    '创建专属容器后，在平台网页完成登录，再回到这里核验并确认店铺身份。',
  shopName: '店铺名称',
  namePlaceholder: '例如：我的旗舰店',
  stepCreate: '创建容器',
  stepLogin: '平台登录',
  stepVerify: '核验并完成',
  cancel: '取消',
  createLogin: '创建并登录',
  verification: '平台身份核验',
  confirmTitle: '确认登录的店铺',
  confirmHint:
    '请核对平台识别的名称和账号。确认后，该容器将绑定以下身份；名称有差异时，请先确认属于目标店铺。',
  later: '稍后确认',
  confirm: '确认店铺并完成',
  displayName: '容器名称',
  platformName: '平台识别名称',
  shopId: '店铺 ID',
  accountId: '账号 ID',
  open: '打开',
  verify: '核验',
  finish: '确认身份',
  configure: '设为淘宝店铺',
  sycm: '生意参谋',
  qianniu: '千牛',
  alimama: '万相台',
  service: '服务入口',
  noIdentity: '尚未核验',
  never: '—',
  busy: '处理中…',
  count: (n) => `共 ${n} 个账号`,
  'unconfigured': '普通容器',
  'awaiting-login': '待登录',
  'verification-required': '需登录或验证',
  'awaiting-confirmation': '已识别，待确认',
  'identity-mismatch': '账号与绑定店铺不符',
  error: '操作未完成，请稍后重试。',
  IDENTITY_UNAVAILABLE:
    '暂未能读取平台身份。请在此店铺的生意参谋页面检查登录及验证状态，再重新核验。',
  SHOP_IDENTITY_MISMATCH:
    '当前账号与此容器绑定的店铺不符，已停止取数。请在此容器内恢复正确账号。',
  CONTAINER_NAME_EXISTS: '已有同名容器，请在列表中配置该容器。',
  STALE_IDENTITY_CANDIDATE: '核验结果已失效，请重新核验后确认。',
  CONTAINERS_UNAVAILABLE: '请先在容器外观设置中启用容器。',
  BUSY: '该容器正在核验，请等待完成。',
}
const en = {
  workspace: 'MY WORKSPACE',
  title: 'Shop manager',
  intro: 'Manage accounts and sign-in status in one browser.',
  all: 'All accounts',
  taobao: 'Taobao / Tmall',
  general: 'General containers',
  local: 'Sessions stored in this Ecom',
  add: 'Add shop',
  search: 'Search shop, account or shop ID',
  refresh: 'Refresh',
  allStates: 'All',
  ready: 'Identity verified',
  pending: 'Needs attention',
  shop: 'Shop name',
  platform: 'Platform',
  account: 'Platform account',
  status: 'Sign-in / verification',
  checked: 'Last verified',
  actions: 'Actions',
  empty: 'No matching shops',
  emptyHint: 'Add a shop or adjust your search and filters.',
  tabHint: 'Shared shop session · Distinct container tabs',
  serviceNote:
    'Each shop has an isolated session and opens in this Ecom window. Identity checks use SYCM; check Qianniu and Alimama sign-in and permissions in their pages.',
  appearance: 'Container appearance',
  newAccount: 'NEW PLATFORM ACCOUNT',
  createHint:
    'Create a container, sign in on the platform, then return to verify and confirm its identity.',
  shopName: 'Shop name',
  namePlaceholder: 'For example: My flagship store',
  stepCreate: 'Create container',
  stepLogin: 'Sign in',
  stepVerify: 'Verify and finish',
  cancel: 'Cancel',
  createLogin: 'Create and sign in',
  verification: 'PLATFORM IDENTITY',
  confirmTitle: 'Confirm this shop',
  confirmHint:
    'Check the platform name and account. Confirmation binds this identity to the container. Resolve any name differences before continuing.',
  later: 'Confirm later',
  confirm: 'Confirm shop and finish',
  displayName: 'Container name',
  platformName: 'Platform name',
  shopId: 'Shop ID',
  accountId: 'Account ID',
  open: 'Open',
  verify: 'Verify',
  finish: 'Confirm',
  configure: 'Set up Taobao',
  sycm: 'SYCM',
  qianniu: 'Qianniu',
  alimama: 'Alimama',
  service: 'Service',
  noIdentity: 'Not verified',
  never: '—',
  busy: 'Working…',
  count: (n) => `${n} accounts`,
  'unconfigured': 'General container',
  'awaiting-login': 'Awaiting sign-in',
  'verification-required': 'Sign-in or verification required',
  'awaiting-confirmation': 'Identity found; confirm',
  'identity-mismatch': 'Account differs from bound shop',
  error: 'Unable to complete. Please try again.',
  IDENTITY_UNAVAILABLE:
    'Platform identity is unavailable. Check sign-in and verification on this shop’s SYCM page, then verify again.',
  SHOP_IDENTITY_MISMATCH:
    'The account differs from the bound shop. Data requests stopped. Restore the correct account in this container.',
  CONTAINER_NAME_EXISTS:
    'A container with this name exists. Configure it in the list.',
  STALE_IDENTITY_CANDIDATE:
    'This identity result expired. Verify again before confirming.',
  CONTAINERS_UNAVAILABLE: 'Enable containers in the appearance settings first.',
  BUSY: 'This container is being verified. Please wait.',
}
Object.assign(zh, {
  title: '账号管理',
  add: '添加账号',
  shop: '账号名称',
  shopName: '账号名称',
  editTitle: '管理账号容器',
  newAccount: '新建账号',
  search: '搜索账号名称、平台账号或店铺 ID',
  homePreset: '常用首页',
  homeUrl: '登录首页 URL',
  homeHint: '选择常用入口或填写自己的页面网址，打开时使用这个账号的容器。',
  customUrl: '自定义 URL',
  INVALID_HOME_URL: '请填写不含账号密码的有效 HTTPS 页面网址。',
  buyerPurposeNote: '买家账号使用淘宝首页；买家登录状态以淘宝网页为准。',
  accountType: '账号用途',
  merchant: '商家账号',
  buyer: '买家账号',
  buyerAccount: '淘宝买家账号',
  buyerLoginUnknown: '买家登录状态待核验',
  taobaoHome: '淘宝首页',
  ACCOUNT_TYPE_CHANGE_REQUIRES_NEW_CONTAINER:
    '已配置账号用途保持不变，其他用途请添加新容器。',
  loggedIn: '已登录',
  serviceNote:
    '每个店铺在独立会话中打开标签。登录状态按服务自动检查；店铺身份单独确认，未接入核验的平台请在网页确认登录。',
  platformPending: '此平台暂提供容器与登录入口，自动登录核验待接入。',
  customPlatformName: '其他平台名称',
  entryUrl: '登录网址（HTTPS）',
  unassigned: '平台待设置',
  home: '商家后台',
  configure: '设置平台',
  'unconfigured': '平台待设置',
  'verification-unavailable': '自动登录核验待接入',
  PLATFORM_VERIFICATION_UNAVAILABLE:
    '该平台的自动核验尚未接入，请在平台网页确认登录。',
  INVALID_PLATFORM_INPUT: '请填写自定义平台名称和有效的 HTTPS 登录网址。',
  PLATFORM_CHANGE_REQUIRES_NEW_CONTAINER:
    '已配置平台保持原有会话归属；其他平台请添加新容器。',
  'signed-in': '已登录 · 登录已核验',
  noIdentity: '店铺身份待确认',
  boundIdentityHint: '已绑定身份，本次尚未重新核对',
  loginService: '登录检查：生意参谋',
  LOGIN_CHECK_UNAVAILABLE: '暂时无法确认登录状态，请在原容器检查该服务。',
  checked: '最近检查',
  icon: '容器图标',
  themeColor: '主题色',
  edit: '管理',
  editTitle: '管理店铺容器',
  editHint: '修改名称与外观会保留原有容器 ID、登录会话和账号绑定。',
  save: '保存',
  delete: '删除',
  deleteTitle: '删除账号容器',
  deleteHint:
    '删除后，此容器及其登录会话将无法继续使用；网站数据由原生容器清理机制处理。其他容器保持不变。此操作不可撤销。',
  deleteConfirm: '确认删除容器',
  openTabs: '尚未关闭的标签页',
  validity: '登录有效期',
  platformExpiry: '平台未提供准确期限',
  cookieReference: 'Cookie 到期参考',
  sessionExpiry: '含会话 Cookie；有效期由平台决定',
  autoHint:
    '后台自动检查；返回此页时刷新。Cookie 到期日仅供参考，平台可提前撤销登录。',
  checking: '正在自动检查…',
  ready: '已登录 · 已核验',
  'awaiting-confirmation': '已登录，待确认店铺',
  'verification-required': '登录状态待确认',
  'login-required': '生意参谋需登录',
  CONTAINER_IN_USE: '请先关闭该容器的所有标签页，再重新发起删除。',
  DELETE_CONFIRMATION_REQUIRED: '删除预览已失效，请重新确认。',
  INVALID_CONTAINER_APPEARANCE: '请填写有效名称，选择图标及主题色。',
  LOGIN_REDIRECT: '该服务需要重新登录，请在原容器内完成。',
})
Object.assign(en, {
  title: 'Account manager',
  add: 'Add account',
  shop: 'Account name',
  shopName: 'Account name',
  editTitle: 'Manage account container',
  newAccount: 'NEW ACCOUNT',
  search: 'Search account or shop ID',
  homePreset: 'Common homepages',
  homeUrl: 'Login homepage URL',
  homeHint:
    'Choose an entry or enter your own URL. It opens in this account’s container.',
  customUrl: 'Custom URL',
  INVALID_HOME_URL:
    'Enter a valid HTTPS page URL without embedded credentials.',
  buyerPurposeNote:
    'Buyer accounts open Taobao. Check buyer sign-in on the Taobao page.',
  accountType: 'Account purpose',
  merchant: 'Merchant',
  buyer: 'Buyer',
  buyerAccount: 'Taobao buyer account',
  buyerLoginUnknown: 'Buyer login not verified',
  taobaoHome: 'Taobao home',
  ACCOUNT_TYPE_CHANGE_REQUIRES_NEW_CONTAINER:
    'Keep the configured account purpose. Use a new container for another purpose.',
  loggedIn: 'Signed in',
  serviceNote:
    'Shops open in isolated container tabs. Login is checked per service; shop identity is confirmed separately. Use the website where automatic checks are not available.',
  platformPending:
    'Container and sign-in entry available. Automatic login checks are not implemented.',
  customPlatformName: 'Other platform name',
  entryUrl: 'Sign-in URL (HTTPS)',
  unassigned: 'Platform not set',
  home: 'Merchant portal',
  configure: 'Set platform',
  'unconfigured': 'Platform not set',
  'verification-unavailable': 'Automatic checks not available',
  PLATFORM_VERIFICATION_UNAVAILABLE:
    'Automatic checks are not available for this platform. Check sign-in on its website.',
  INVALID_PLATFORM_INPUT:
    'Enter a custom platform name and a valid HTTPS sign-in URL.',
  PLATFORM_CHANGE_REQUIRES_NEW_CONTAINER:
    'Keep the configured platform’s session. Add a new container for another platform.',
  'signed-in': 'Signed in · login verified',
  noIdentity: 'Shop identity not confirmed',
  boundIdentityHint: 'Bound identity; not rechecked this time',
  loginService: 'Login check: SYCM',
  LOGIN_CHECK_UNAVAILABLE:
    'Unable to confirm service login. Check this container’s service session.',
  checked: 'Last checked',
  icon: 'Container icon',
  themeColor: 'Theme color',
  edit: 'Manage',
  editTitle: 'Manage container',
  editHint:
    'Changing the name or appearance preserves the container ID, session and account binding.',
  save: 'Save',
  delete: 'Delete',
  deleteTitle: 'Delete account container',
  deleteHint:
    'The container and its login session will no longer be usable. Native container cleanup handles its site data. Other containers are unaffected. This cannot be undone.',
  deleteConfirm: 'Confirm deletion',
  openTabs: 'Open tabs',
  validity: 'Session validity',
  platformExpiry: 'Platform expiry not provided',
  cookieReference: 'Cookie expiry reference',
  sessionExpiry: 'Includes session cookies; validity is platform-controlled',
  autoHint:
    'Checked in the background and when returning here. Cookie expiry is a reference; the platform may revoke login earlier.',
  checking: 'Checking automatically…',
  ready: 'Signed in · verified',
  'awaiting-confirmation': 'Signed in; confirm shop',
  'verification-required': 'Sign-in status unknown',
  'login-required': 'SYCM sign-in required',
  CONTAINER_IN_USE: 'Close this container’s tabs, then start deletion again.',
  DELETE_CONFIRMATION_REQUIRED:
    'The deletion preview expired. Review it again.',
  INVALID_CONTAINER_APPEARANCE: 'Enter a valid name, icon and theme color.',
  LOGIN_REDIRECT: 'Sign in to this service again in its original container.',
})
const copy = loadTimeData.getString('locale').startsWith('zh') ? zh : en
const $ = (id) => document.getElementById(id)
const text = (key) => copy[key] || key
document.documentElement.lang = copy === zh ? 'zh-CN' : 'en'
document.title = `Ecom · ${text('title')}`
document
  .querySelectorAll('[data-text]')
  .forEach((node) => (node.textContent = text(node.dataset.text)))
document
  .querySelectorAll('[data-placeholder]')
  .forEach((node) => (node.placeholder = text(node.dataset.placeholder)))
$('search').ariaLabel = text('search')
let rows = [],
  scope = 'all',
  state = 'all',
  busy = false,
  confirmationId
const homeDirty = { create: false, edit: false }
let lastRenderedSignature = ''
let editId, deletionPlan
let platforms = []
function syncPlatformFields(edit = false) {
  const prefix = edit ? 'edit-' : ''
  const selector = edit ? $('edit-platform') : $('platform')
  const custom = selector.value === 'custom'
  if (!edit)
    $('platform-support-note').textContent =
      selector.value === 'taobao' ? '' : text('platformPending')
  $(prefix + 'custom-platform-fields').hidden = !custom
  for (const id of ['custom-platform-name']) {
    $(prefix + id).required = custom
    $(prefix + id).disabled = busy || !custom
  }
  if (!homeDirty[edit ? 'edit' : 'create']) {
    const base =
      platforms.find((item) => item.id === selector.value)?.entryUrl || ''
    const url = base
    setHomeField(prefix, url)
  }
  if (edit)
    selector.disabled =
      busy || Boolean(rows.find((row) => row.id === editId)?.platform)
}
function setHomeField(prefix, url) {
  $(prefix + 'home-url').value = url || ''
  const match = homePresets.find((item) => item.url === url)
  $(prefix + 'home-preset').value = match?.id || 'custom'
}
for (const prefix of ['', 'edit-']) {
  const select = $(prefix + 'home-preset')
  for (const preset of homePresets) {
    const option = node('option', preset.names[copy === zh ? 0 : 1])
    option.value = preset.id
    select.append(option)
  }
  const custom = node('option', text('customUrl'))
  custom.value = 'custom'
  select.append(custom)
  select.addEventListener('change', () => {
    homeDirty[prefix ? 'edit' : 'create'] = true
    const preset = homePresets.find((item) => item.id === select.value)
    if (preset) setHomeField(prefix, preset.url)
    else $(prefix + 'home-url').focus()
  })
  $(prefix + 'home-url').addEventListener('input', () => {
    homeDirty[prefix ? 'edit' : 'create'] = true
    let match
    try {
      match = homePresets.find(
        (item) =>
          normalizeHomeUrl(item.url)
          === normalizeHomeUrl($(prefix + 'home-url').value),
      )
    } catch {}
    select.value = match?.id || 'custom'
  })
}
async function loadPlatforms() {
  const result = await command({ method: 'shops.platforms' })
  platforms = result.platforms
  $('platform').replaceChildren()
  $('edit-platform').replaceChildren()
  const unset = node('option', text('unassigned'))
  unset.value = ''
  $('edit-platform').append(unset)
  const marks = {
    taobao: '淘',
    douyin: '抖',
    pinduoduo: '拼',
    jd: '京',
    xiaohongshu: '红',
    custom: '自',
  }
  for (const platform of platforms) {
    const label = displayPlatform({ platform: platform.id }, copy === zh)
    for (const selector of [$('platform'), $('edit-platform')]) {
      const option = node('option', label)
      option.value = platform.id
      selector.append(option)
    }
    const button = node('button', undefined, 'nav-item')
    button.dataset.scope = platform.id
    button.append(
      node('span', marks[platform.id] || '◇', 'platform-icon'),
      node('span', label),
    )
    const count = node('b', '0')
    count.id = 'platform-count-' + platform.id
    button.append(count)
    $('scopes').append(button)
  }
  syncPlatformFields()
  syncPlatformFields(true)
}
$('platform').addEventListener('change', () => syncPlatformFields())
$('edit-platform').addEventListener('change', () => syncPlatformFields(true))
function previewAppearance(prefix) {
  $(prefix + '-preview').style.backgroundColor = $(prefix + '-color').value
  $(prefix + '-preview-icon').src =
    'icons/' + $(prefix + '-icon').value + '.svg'
}
for (const prefix of ['create', 'edit']) {
  iconNames.forEach((names, index) => {
    const option = document.createElement('option')
    option.value = index
    option.textContent = names[copy === zh ? 0 : 1]
    $(prefix + '-icon').append(option)
  })
  $(prefix + '-icon').value = '2'
  $(prefix + '-icon').addEventListener('change', () =>
    previewAppearance(prefix),
  )
  $(prefix + '-color').addEventListener('input', () =>
    previewAppearance(prefix),
  )
}
previewAppearance('create')

function node(tag, value, className) {
  const result = document.createElement(tag)
  if (value !== undefined) result.textContent = value
  if (className) result.className = className
  return result
}
async function command(request) {
  const result = JSON.parse(
    await sendWithPromise('ecomShopCommand', JSON.stringify(request)),
  )
  if (!result.ok) throw new Error(result.error?.code || 'SHOP_ERROR')
  if (result.shops) rows = result.shops
  return result
}
function showError(error, target = 'message') {
  const code = error instanceof Error ? error.message : 'SHOP_ERROR'
  $(target).textContent = (copy[code] || text('error')) + ` (${code})`
}
function setBusy(value) {
  busy = value
  document
    .querySelectorAll('button,input,select')
    .forEach((control) => (control.disabled = value))
  $('message').classList.toggle('busy', value)
  $('message').textContent = value ? text('busy') : ''
  $('delete-confirm').disabled =
    value || !deletionPlan || deletionPlan.openTabs > 0
  syncPlatformFields()
  syncPlatformFields(true)
}
function button(label, action, row, className) {
  const result = node('button', text(label), className)
  result.disabled = busy
  result.addEventListener('click', () => runAction(action, row))
  return result
}
function render() {
  const signature = JSON.stringify([
    rows,
    scope,
    state,
    $('search').value,
    busy,
  ])
  if (signature === lastRenderedSignature) return
  lastRenderedSignature = signature
  const shown = filterShops(rows, { scope, state, query: $('search').value })
  $('all-count').textContent = rows.length
  for (const platform of platforms)
    $('platform-count-' + platform.id).textContent = rows.filter(
      (row) => row.platform === platform.id,
    ).length
  $('result-count').textContent = copy.count(shown.length)
  $('empty').hidden = shown.length > 0
  const fragment = document.createDocumentFragment()
  for (const row of shown) {
    const tr = node('tr')
    const first = node('td'),
      shop = node('div', undefined, 'shop-cell')
    const avatar = node('span', undefined, 'shop-avatar')
    const image = node('img')
    image.src =
      'icons/'
      + (Number.isInteger(row.icon) && row.icon >= 0 && row.icon <= 10
        ? row.icon
        : 2)
      + '.svg'
    image.alt = ''
    avatar.append(image)
    if (/^#[0-9a-fA-F]{6}$/.test(row.color || ''))
      avatar.style.backgroundColor = row.color
    shop.append(avatar)
    const title = node('div')
    title.append(node('div', row.name, 'shop-name'))
    shop.append(title)
    first.append(shop)
    tr.append(first)
    tr.append(node('td', displayPlatform(row, copy === zh)))
    const identity = row.identity || row.candidate
    const account = node('td')
    account.append(
      node(
        'div',
        identity?.platformName || text('noIdentity'),
      ),
    )
    if (identity) {
      account.append(
        node('div', `${text('shopId')}: ${identity.shopId}`, 'secondary'),
      )
      account.append(
        node('div', `${text('accountId')}: ${identity.accountId}`, 'secondary'),
      )
    }
    if (identity && row.state !== 'ready')
      account.append(node('div', text('boundIdentityHint'), 'secondary'))
    if (row.authentication)
      account.append(node('div', text('loginService'), 'secondary'))
    tr.append(account)
    const status = node('td')
    status.append(
      node(
        'span',
        text(row.state),
        'badge ' + row.state,
      ),
    )
    if (row.checking) status.append(node('div', text('checking'), 'secondary'))
    tr.append(status)
    const checkedAt = row.checkedAt || identity?.verifiedAt
    const checked = checkedAt
      ? new Date(Number(checkedAt) * 1000).toLocaleString()
      : text('never')
    tr.append(node('td', checked))
    const validity = node(
      'td',
      !row.platform
        ? text('never')
        : row.expiry?.kind === 'session'
          ? text('sessionExpiry')
          : text('platformExpiry'),
      'validity-cell',
    )
    if (row.expiry?.cookieExpiresAt)
      validity.append(
        node(
          'div',
          text('cookieReference')
            + ': '
            + new Date(
              Number(row.expiry.cookieExpiresAt) * 1000,
            ).toLocaleString(),
          'secondary',
        ),
      )
    tr.append(validity)
    const actions = node('td'),
      group = node('div', undefined, 'row-actions')
    if (row.platform) {
      const homepage = node(
        'span',
        homeLabel(row.homeUrl, copy === zh),
        'home-entry',
      )
      homepage.title = row.homeUrl || ''
      group.append(
        homepage,
        button('open', 'open', row, 'open'),
        ...((row.verificationSupported ?? false)
          ? [button('verify', 'verify', row)]
          : []),
      )
      if (row.state === 'awaiting-confirmation' && row.candidate)
        group.append(button('finish', 'candidate', row))
    } else group.append(button('configure', 'edit', row))
    if (row.platform) group.append(button('edit', 'edit', row))
    group.append(button('delete', 'delete', row, 'delete-action'))
    actions.append(group)
    tr.append(actions)
    fragment.append(tr)
  }
  $('rows').replaceChildren(fragment)
}
async function refresh() {
  await command({ method: 'shops.list' })
  render()
}
function showCandidate(row) {
  if (!row?.candidate) return
  confirmationId = row.id
  $('identity-details').replaceChildren()
  for (const [key, value] of [
    ['displayName', row.name],
    ['platformName', row.candidate.platformName],
    ['shopId', row.candidate.shopId],
    ['accountId', row.candidate.accountId],
  ]) {
    $('identity-details').append(node('dt', text(key)), node('dd', value))
  }
  $('identity-error').textContent = ''
  if (!$('identity-dialog').open) $('identity-dialog').showModal()
}
async function runAction(action, row) {
  if (busy) return
  if (action === 'edit') {
    editId = row.id
    $('edit-name').value = row.name
    $('edit-platform').value = row.platform || ''
    $('edit-custom-platform-name').value = row.customPlatformName || ''
    homeDirty.edit = Boolean(row.homeUrl)
    setHomeField('edit-', row.homeUrl || '')
    syncPlatformFields(true)
    $('edit-icon').value = String(row.icon ?? 2)
    $('edit-color').value = row.color || '#007f83'
    previewAppearance('edit')
    $('edit-error').textContent = ''
    $('edit-dialog').showModal()
    return
  }
  if (action === 'delete') {
    setBusy(true)
    try {
      const result = await command(shopRequest('delete-preview', row))
      deletionPlan = result.deletion
      $('delete-details').replaceChildren()
      for (const [key, value] of [
        ['displayName', deletionPlan.name],
        ['openTabs', String(deletionPlan.openTabs)],
      ])
        $('delete-details').append(node('dt', text(key)), node('dd', value))
      $('delete-error').textContent =
        deletionPlan.openTabs > 0 ? text('CONTAINER_IN_USE') : ''
      setBusy(false)
      $('delete-dialog').showModal()
    } catch (error) {
      setBusy(false)
      showError(error)
    }
    return
  }
  if (action === 'candidate') {
    showCandidate(row)
    return
  }
  setBusy(true)
  try {
    await command(shopRequest(action, row, 'home'))
    await refresh()
    setBusy(false)
    if (action === 'verify')
      showCandidate(rows.find((value) => value.id === row.id))
    if (action === 'confirm') $('identity-dialog').close()
  } catch (error) {
    try {
      await refresh()
    } catch {
      /* Keep the last known list. */
    }
    setBusy(false)
    showError(error, action === 'confirm' ? 'identity-error' : 'message')
  }
  render()
}
$('scopes').addEventListener('click', (event) => {
  const target = event.target.closest('[data-scope]')
  if (!target || busy) return
  scope = target.dataset.scope
  $('scopes')
    .querySelectorAll('button')
    .forEach((item) => {
      item.classList.toggle('selected', item === target)
      if (item === target) item.setAttribute('aria-current', 'page')
      else item.removeAttribute('aria-current')
    })
  render()
})
$('states').addEventListener('click', (event) => {
  const target = event.target.closest('[data-state]')
  if (!target || busy) return
  state = target.dataset.state
  $('states')
    .querySelectorAll('button')
    .forEach((item) => {
      item.classList.toggle('active', item === target)
      item.setAttribute('aria-pressed', String(item === target))
    })
  render()
})
$('search').addEventListener('input', render)
$('refresh').addEventListener('click', async () => {
  if (busy) return
  setBusy(true)
  try {
    await command({ method: 'shops.refresh', force: true })
    await refresh()
    setBusy(false)
  } catch (error) {
    setBusy(false)
    showError(error)
  }
  render()
})
$('add').addEventListener('click', () => {
  if (busy) return
  $('create-error').textContent = ''
  $('create-dialog').showModal()
  $('shop-name').focus()
})
document.querySelectorAll('[data-close]').forEach((control) =>
  control.addEventListener('click', () => {
    if (!busy) $(control.dataset.close).close()
  }),
)
document.querySelectorAll('dialog').forEach((dialog) =>
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault()
  }),
)
$('create-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (busy) return
  const name = $('shop-name').value.trim()
  if (!name) return
  setBusy(true)
  $('create-error').textContent = ''
  let created
  try {
    const result = await command({
      method: 'shops.create',
      platform: $('platform').value,
      name,
      icon: Number($('create-icon').value),
      color: $('create-color').value,
      customPlatformName: $('custom-platform-name').value,
      homeUrl: normalizeHomeUrl($('home-url').value),
      entryUrl: normalizeHomeUrl($('home-url').value),
    })
    created = result.shops.find((row) => row.id === result.createdContainerId)
    if (!created) throw new Error('CONTAINER_NOT_FOUND')
    render()
    $('shop-name').value = ''
    $('create-dialog').close()
    await command(shopRequest('open', created, 'home'))
    setBusy(false)
  } catch (error) {
    setBusy(false)
    showError(error, created ? 'message' : 'create-error')
  }
  render()
})
$('confirm').addEventListener('click', () => {
  const row = rows.find((item) => item.id === confirmationId)
  if (row) runAction('confirm', row)
})
document.addEventListener('visibilitychange', async () => {
  if (
    document.hidden
    || busy
    || $('create-dialog').open
    || $('identity-dialog').open
    || $('edit-dialog').open
    || $('delete-dialog').open
  )
    return
  try {
    await command({ method: 'shops.refresh' })
    await refresh()
  } catch (error) {
    showError(error)
  }
})
try {
  await loadPlatforms()
  await command({ method: 'shops.refresh' })
  await refresh()
} catch (error) {
  showError(error)
}

$('edit-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (busy) return
  setBusy(true)
  $('edit-error').textContent = ''
  try {
    const request = appearanceRequest(
      editId,
      $('edit-name').value,
      Number($('edit-icon').value),
      $('edit-color').value,
    )
    if ($('edit-platform').value) request.platform = $('edit-platform').value
    request.homeUrl = normalizeHomeUrl($('edit-home-url').value)
    if (request.platform === 'custom') {
      request.customPlatformName = $('edit-custom-platform-name').value
      request.entryUrl = request.homeUrl
    }
    await command(request)
    setBusy(false)
    $('edit-dialog').close()
    render()
  } catch (error) {
    setBusy(false)
    showError(error, 'edit-error')
  }
})
$('delete-confirm').addEventListener('click', async () => {
  if (busy) return
  try {
    const request = deletionRequest(deletionPlan)
    setBusy(true)
    await command(request)
    deletionPlan = undefined
    setBusy(false)
    $('delete-dialog').close()
    render()
  } catch (error) {
    setBusy(false)
    showError(error, 'delete-error')
  }
})
$('plugin-guide-open').addEventListener('click', () => $('plugin-guide').showModal())
setInterval(async () => {
  if (
    document.hidden
    || busy
    || document.querySelector('dialog[open]')
    || document.activeElement?.closest('tbody')
  )
    return
  try {
    await refresh()
  } catch {
    /* Keep the last known state during transient failures. */
  }
}, 5000)
