// Copyright 2026 Ecom Authors. MPL-2.0.
export const pendingStates = new Set([
  'awaiting-login',
  'verification-required',
  'awaiting-confirmation',
  'identity-mismatch',
])

export function filterShops(
  rows,
  { scope = 'all', state = 'all', query = '' } = {},
) {
  const term = query.trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if (scope === 'taobao' && row.platform !== 'taobao') return false
    if (scope === 'general' && row.platform) return false
    if (state === 'ready' && row.state !== 'ready') return false
    if (state === 'pending' && !pendingStates.has(row.state)) return false
    const identity = row.identity || row.candidate || {}
    return [
      row.name,
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

export function shopRequest(action, row, service) {
  if (!row?.id) throw new Error('CONTAINER_REQUIRED')
  const request = { method: 'shops.' + action, containerId: row.id }
  if (action === 'configure') request.platform = 'taobao'
  else if (action === 'open') {
    if (!['sycm', 'qianniu', 'alimama'].includes(service))
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
  } else if (action !== 'verify') throw new Error('UNSUPPORTED_COMMAND')
  return request
}
