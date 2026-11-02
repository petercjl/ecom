// Copyright 2026 Ecom Authors. MPL-2.0.
import './strings.m.js'
import { sendWithPromise } from 'chrome://resources/js/cr.js'
import { loadTimeData } from 'chrome://resources/js/load_time_data.js'
import { filterShops, shopRequest } from './model.mjs'

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
const services = new Map()

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
}
function button(label, action, row, className) {
  const result = node('button', text(label), className)
  result.disabled = busy
  result.addEventListener('click', () => runAction(action, row))
  return result
}
function render() {
  const shown = filterShops(rows, { scope, state, query: $('search').value })
  $('all-count').textContent = rows.length
  $('taobao-count').textContent = rows.filter(
    (row) => row.platform === 'taobao',
  ).length
  $('general-count').textContent = rows.filter((row) => !row.platform).length
  $('result-count').textContent = copy.count(shown.length)
  $('empty').hidden = shown.length > 0
  const fragment = document.createDocumentFragment()
  for (const row of shown) {
    const tr = node('tr')
    const first = node('td'),
      shop = node('div', undefined, 'shop-cell')
    shop.append(node('span', row.name.slice(0, 1), 'shop-avatar'))
    const title = node('div')
    title.append(node('div', row.name, 'shop-name'))
    shop.append(title)
    first.append(shop)
    tr.append(first)
    tr.append(node('td', row.platform ? text('taobao') : text('general')))
    const identity = row.identity || row.candidate
    const account = node('td')
    account.append(node('div', identity?.platformName || text('noIdentity')))
    if (identity) {
      account.append(
        node('div', `${text('shopId')}: ${identity.shopId}`, 'secondary'),
      )
      account.append(
        node('div', `${text('accountId')}: ${identity.accountId}`, 'secondary'),
      )
    }
    tr.append(account)
    const status = node('td')
    status.append(node('span', text(row.state), 'badge ' + row.state))
    tr.append(status)
    const checked = identity
      ? new Date(Number(identity.verifiedAt) * 1000).toLocaleString()
      : text('never')
    tr.append(node('td', checked))
    const actions = node('td'),
      group = node('div', undefined, 'row-actions')
    if (row.platform) {
      const select = node('select')
      select.ariaLabel = `${row.name} · ${text('service')}`
      for (const value of ['sycm', 'qianniu', 'alimama']) {
        const option = node('option', text(value))
        option.value = value
        select.append(option)
      }
      select.value = services.get(row.id) || 'sycm'
      select.disabled = busy
      select.addEventListener('change', () =>
        services.set(row.id, select.value),
      )
      group.append(
        select,
        button('open', 'open', row, 'open'),
        button('verify', 'verify', row),
      )
      if (row.state === 'awaiting-confirmation' && row.candidate)
        group.append(button('finish', 'candidate', row))
    } else group.append(button('configure', 'configure', row))
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
  if (action === 'candidate') {
    showCandidate(row)
    return
  }
  setBusy(true)
  try {
    await command(shopRequest(action, row, services.get(row.id) || 'sycm'))
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
    })
    created = result.shops.find((row) => row.name === name)
    if (!created) throw new Error('CONTAINER_NOT_FOUND')
    render()
    $('shop-name').value = ''
    $('create-dialog').close()
    await command(shopRequest('open', created, 'sycm'))
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
  )
    return
  try {
    await refresh()
  } catch (error) {
    showError(error)
  }
})
try {
  await refresh()
} catch (error) {
  showError(error)
}
