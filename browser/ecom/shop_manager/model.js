// Copyright 2026 Ecom Authors. MPL-2.0.
export const pendingStates = new Set([
  'awaiting-login',
  'verification-required',
  'awaiting-confirmation',
  'identity-mismatch',
  'login-required',
  'verification-unavailable',
])

export function filterShops(
  rows,
  { scope = 'all', state = 'all', query = '' } = {},
) {
  const term = query.trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if (scope !== 'all' && row.platform !== scope) return false
    if (state === 'ready' && !['ready', 'signed-in'].includes(row.state))
      return false
    if (state === 'pending' && !pendingStates.has(row.state)) return false
    const identity = row.identity || row.candidate || {}
    return [
      row.name,
      row.customPlatformName,
      identity.platformName,
      identity.shopId,
      identity.accountId,
    ].some((value) =>
      String(value || '')
        .toLocaleLowerCase()
        .includes(term),
    )
  })
}

export function shopServices(row) {
  if (row.platform === 'taobao') return ['sycm', 'qianniu', 'alimama', 'taobao']
  return ['home']
}

export const homePresets = [
  {
    id: 'sycm',
    names: ['生意参谋', 'SYCM'],
    url: 'https://sycm.taobao.com/portal/home.htm',
  },
  {
    id: 'qianniu',
    names: ['千牛', 'Qianniu'],
    url: 'https://myseller.taobao.com/',
  },
  {
    id: 'alimama',
    names: ['万相台', 'Alimama'],
    url: 'https://one.alimama.com/',
  },
  {
    id: 'taobao',
    names: ['淘宝首页', 'Taobao'],
    url: 'https://www.taobao.com/',
  },
  {
    id: 'douyin',
    names: ['抖音', 'Douyin'],
    url: 'https://fxg.jinritemai.com/',
  },
  {
    id: 'pinduoduo',
    names: ['拼多多', 'Pinduoduo'],
    url: 'https://mms.pinduoduo.com/',
  },
  { id: 'jd', names: ['京东', 'JD'], url: 'https://shop.jd.com/jdm/home' },
  {
    id: 'xiaohongshu',
    names: ['小红书', 'Xiaohongshu'],
    url: 'https://ark.xiaohongshu.com/',
  },
]
export function normalizeHomeUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('INVALID_HOME_URL')
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('INVALID_HOME_URL')
  return url.href
}
export function homeLabel(value, chinese = true) {
  try {
    const url = normalizeHomeUrl(value)
    return (
      homePresets.find((item) => normalizeHomeUrl(item.url) === url)?.names[
        chinese ? 0 : 1
      ] || new URL(url).host
    )
  } catch {
    return chinese ? '未设置首页' : 'Homepage not set'
  }
}
export function shopRequest(action, row, service) {
  if (!row?.id) throw new Error('CONTAINER_REQUIRED')
  const request = { method: 'shops.' + action, containerId: row.id }
  if (action === 'configure') request.platform = 'taobao'
  else if (action === 'open') {
    if (!shopServices(row).includes(service) && service !== 'home')
      throw new Error('SERVICE_UNSUPPORTED')
    request.service = service
  } else if (action === 'confirm') {
    if (
      row.state !== 'awaiting-confirmation'
      || !row.candidate?.shopId
      || !row.candidate?.candidateId
    )
      throw new Error('STALE_IDENTITY_CANDIDATE')
    request.shopId = row.candidate.shopId
    request.candidateId = row.candidate.candidateId
  } else if (!['verify', 'delete-preview'].includes(action))
    throw new Error('UNSUPPORTED_COMMAND')
  return request
}

export const iconNames = [
  ['个人', 'Personal'],
  ['工作', 'Work'],
  ['购物车', 'Shopping'],
  ['社交', 'Social'],
  ['活动', 'Events'],
  ['金融', 'Banking'],
  ['星标', 'Star'],
  ['旅行', 'Travel'],
  ['学校', 'School'],
  ['隐私', 'Private'],
  ['消息', 'Messaging'],
]
export function appearanceRequest(id, name, icon, color) {
  if (
    !id
    || !name.trim()
    || !Number.isInteger(icon)
    || icon < 0
    || icon > 10
    || !/^#[0-9a-fA-F]{6}$/.test(color)
  )
    throw new Error('INVALID_CONTAINER_APPEARANCE')
  return {
    method: 'shops.update',
    containerId: id,
    name: name.trim(),
    icon,
    color,
  }
}
export function deletionRequest(plan) {
  if (!plan?.containerId || !plan.confirmationId)
    throw new Error('DELETE_CONFIRMATION_REQUIRED')
  if (plan.openTabs > 0) throw new Error('CONTAINER_IN_USE')
  return {
    method: 'shops.delete',
    containerId: plan.containerId,
    confirmationId: plan.confirmationId,
  }
}

export const platformNames = {
  taobao: ['淘宝 / 天猫', 'Taobao / Tmall'],
  douyin: ['抖音', 'Douyin'],
  pinduoduo: ['拼多多', 'Pinduoduo'],
  jd: ['京东', 'JD'],
  xiaohongshu: ['小红书', 'Xiaohongshu'],
  custom: ['自定义', 'Custom'],
}
export function displayPlatform(row, chinese = true) {
  if (row.platform === 'custom' && row.customPlatformName)
    return row.customPlatformName
  return (
    platformNames[row.platform]?.[chinese ? 0 : 1]
    || (chinese ? '平台待设置' : 'Platform not set')
  )
}
