import {fail} from '../common.mjs';
import {loginLabels, secureField, isVisible, usableButton, canClick, named, descend, uniqueButton, containedPoint} from './accessibility.mjs';

export const pinduoduoHost = 'mms.pinduoduo.com';
const field = node => ['textfield', 'textbox', 'edit', 'securetextfield'].includes(node.role);

export function pinduoduoLoginState(document, address) {
  if (/^\/home\/?$/.test(address.pathname) && /^拼多多\s*商家后台$/.test(document.name ?? '')) {
    return {status: 'backend-page', host: address.hostname};
  }
  if (!/^\/login\/?$/.test(address.pathname)) return {status: 'unconfirmed'};
  const nodes = [...descend(document)].filter(isVisible);
  const submit = uniqueButton(nodes.filter(node => canClick(node) && named(node, loginLabels)),
    'LOGIN_BUTTON_AMBIGUOUS', 'The Pinduoduo page has multiple available Login buttons.');
  if (submit) {
    // The live page groups the fields and button without exposing a form role.
    for (const region of nodes.toReversed()) {
      if (!['form', 'group'].includes(region.role)) continue;
      const members = [...descend(region)].filter(isVisible);
      if (!members.includes(submit)) continue;
      const accounts = members.filter(node => field(node) && !secureField(node));
      const passwords = members.filter(node => field(node) && secureField(node));
      if (accounts.length === 1 && passwords.length === 1) {
        return {status: 'login-pending', prepare: prepareAccountLogin, button: submit, secureField: passwords[0],
          accountFilled: typeof accounts[0].value === 'string' && accounts[0].value.trim().length > 0};
      }
    }
    return {status: 'login-pending'};
  }
  const modeLabels = ['账号登录', '帐号登录', 'Account login'];
  const qrLabels = ['扫码登录', 'QR code login'];
  const controls = nodes.flatMap(node => {
    const children = node.children?.filter(isVisible) ?? [];
    const matches = (child, labels) => named(child, labels) || child.children?.some(label => named(label, labels));
    if (!children.some(child => matches(child, qrLabels))) return [];
    return children.filter(child => matches(child, modeLabels) && child.ref_id &&
      !child.states?.includes('disabled') && (usableButton(child) || child.available_actions?.includes('Click')));
  });
  const mode = uniqueButton(controls, 'LOGIN_MODE_AMBIGUOUS', 'Multiple Pinduoduo Account login controls matched.');
  return mode ? {status: 'login-pending', prepare: prepareAccountLogin, mode} : {status: 'login-pending'};
}


async function prepareAccountLogin(landing, {desktop, readPage, wait, setPhase}) {
  if (landing.mode) {
    setPhase('select-login-mode');
    const mode = desktop.click(landing.mode.ref_id, true);
    if (mode?.disposition?.delivery === 'not_delivered') {
      throw fail('LOGIN_MODE_SWITCH_FAILED', 'The Pinduoduo Account login click was not delivered.', {executed: false});
    }
  }
  setPhase('check-prefill');
  let state;
  let missing = false;
  const ready = await wait(() => {
    state = readPage({bounds: true});
    if (state?.status === 'verification-required' || (state?.status === 'backend-page' && state.host === pinduoduoHost)) return state;
    if (!state?.secureField) return null;
    const password = desktop.securePrefill?.(state.window, containedPoint(state.secureField, state.window));
    missing = !state.accountFilled || password === 'empty';
    return state.accountFilled && password === 'filled' ? state : null;
  }, 7000);
  if (ready) return ready;
  if (!state?.secureField) {
    throw fail('LOGIN_MODE_UNCONFIRMED', 'The Pinduoduo account login form could not be confirmed.');
  }
  if (missing) throw fail('LOGIN_CREDENTIALS_MISSING',
    'Pinduoduo account or password is not filled. Save both credentials in this container before signing in.', {executed: false});
  throw fail('LOGIN_PREFILL_UNVERIFIABLE',
    'The Pinduoduo password field could not be verified. Check the form in the selected container.', {executed: false});
}
