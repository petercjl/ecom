// Copyright 2026 Ecom Authors. MPL-2.0.
import './strings.m.js'
import {sendWithPromise} from 'chrome://resources/js/cr.js'
import {loadTimeData} from 'chrome://resources/js/load_time_data.js'

const zh = loadTimeData.getString('locale').startsWith('zh')
let error = new URLSearchParams(location.search).get('error')
const loading = ['正在买家容器中查找商品。', 'Finding the product in the buyer container.']
const messages = new Map([
  ['PRODUCT_SEARCH_NO_MATCH', [
    '淘宝搜索未找到相同商品 ID。你可以在买家容器手动搜索。',
    'Taobao did not return the same product ID. You can search in the buyer container.',
  ]],
  ['PRODUCT_LOGIN_REQUIRED', [
    '登录淘宝后，重新打开这个商品。',
    'After signing in to Taobao, open the product again.',
  ]],
  ['PRODUCT_VERIFICATION_REQUIRED', [
    '请在买家容器完成淘宝安全验证后重新打开商品。',
    'Complete Taobao verification in the buyer container and try again.',
  ]],
])
const incomplete = [
  '请检查买家容器的登录状态，或稍后重新打开商品。',
  'Check the buyer container’s sign-in status or try again later.',
]
if (!error && !(await sendWithPromise('ecomProductNavigationPending'))) {
  error = 'PRODUCT_NAVIGATION_INCOMPLETE'
}
let heading = zh ? '商品详情页正在加载中' : 'Loading product details'
if (error === 'PRODUCT_LOGIN_REQUIRED') {
  heading = zh ? '请先登录买家容器' : 'Sign in to the buyer container first'
} else if (error) {
  heading = zh ? '未能打开商品详情' : 'Could not open product details'
}
document.documentElement.lang = zh ? 'zh-CN' : 'en'
document.title = heading
document.getElementById('heading').textContent = heading
document.getElementById('message').textContent =
  (error ? messages.get(error) ?? incomplete : loading)[zh ? 0 : 1]
document.getElementById('progress').hidden = Boolean(error)
