import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {fail} from './common.mjs';
import {createDesktop, ecomDesktop, selectDesktopInstance} from './desktop-runtime.mjs';

const managerLabels = ['账号管理', 'Account manager'];
const openLabels = ['打开', 'Open'];
const loginLabels = ['登录', 'Login', 'Log in', 'Sign in'];
const isDocument = node => ['webarea', 'document'].includes(node.role);
const isVisible = node => !node.states?.some(state => ['offscreen', 'hidden', 'invisible'].includes(state));
const usableButton = node => node.role === 'button' && isVisible(node) && !node.states?.includes('disabled');
const canClick = node => node.ref_id && usableButton(node);
const named = (node, labels) => [node.name, node.value].some(value => typeof value === 'string' && labels.includes(value));
const isManager = title => /^(?:Ecom(?: Dev)?\s*[·-]\s*)?(?:账号管理|Account manager)(?:\s*[·-]\s*Ecom(?: Dev)?)?$/i.test(title?.trim() ?? '');
const crashText = /^(?:喔唷[，,！？! ]*崩溃啦[！？!。 ]*|崩溃啦[！？!。 ]*|Aw, Snap!)(?:\s*[-·]\s*Ecom(?: Dev)?)?$/i;
const verificationText = /^(?:安全验证|身份验证|请完成安全验证|请完成验证|滑动验证|请拖动滑块(?:完成验证)?|Security verification|Verify your identity)$/i;
const backendTitle = /^(?:天猫商家中心|天猫(?:国际)?商家工作台|淘宝卖家中心|千牛卖家中心|千牛工作台|Taobao Seller Center|Tmall Merchant Center)(?:\s*[-·|—].*)?$/i;
const addressLabels = ['地址和搜索栏', '地址与搜索栏', '地址栏', 'Address and search bar', 'Address and search', 'Address bar'];

function* descend(node, stop = () => false) {
  yield node;
  if (!stop(node)) for (const child of node.children ?? []) yield* descend(child, stop);
}

function browserToolbars(tree) {
  return [...descend(tree, isDocument)].filter(node => node.role === 'toolbar');
}

function addressIn(toolbars) {
  const addresses = toolbars.flatMap(toolbar => [...descend(toolbar)].filter(node =>
    ['textfield', 'textbox', 'edit', 'combobox'].includes(node.role) && addressLabels.includes(node.name)));
  const value = addresses.length === 1 ? addresses[0].value : null;
  if (typeof value !== 'string' || addresses[0].states?.includes('focused')) return null;
  try {
    const url = new URL(/^[\w+.-]+:\/\//.test(value) ? value : 'https://' + value);
    return url.username || url.password ? null : url;
  } catch { return null; }
}

function uniqueButton(buttons, code, message) {
  const refs = new Map(buttons.filter(button => button.ref_id).map(button => [button.ref_id, button]));
  if (refs.size > 1) throw fail(code, message);
  return refs.values().next().value;
}

function managerRow(tree, container) {
  const tables = [...descend(tree)].filter(node => node.role === 'table' && isVisible(node));
  const rows = [...new Set(tables.flatMap(table => [...descend(table)].filter(node => node.role === 'row' && isVisible(node))))];
  const matches = rows.filter(row => {
    const nameCell = row.children?.find(node => ['cell', 'rowheader'].includes(node.role));
    return nameCell && [...descend(nameCell)].some(node => named(node, [container]));
  });
  if (matches.length > 1) throw fail('CONTAINER_AMBIGUOUS', 'More than one account row has the requested exact name.');
  const row = matches[0];
  if (!row) return null;
  const buttons = [...descend(row)].filter(node => node.role === 'button' && named(node, openLabels));
  if (buttons.length > 1) throw fail('CONTAINER_OPEN_AMBIGUOUS', 'The selected account row has more than one Open button.');
  const button = buttons[0];
  return {button: button && usableButton(button) ? button : null};
}

function containedPoint(button, window) {
  const box = button.bounds;
  const frame = window.bounds;
  if (!box || !frame || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key]) && Number.isFinite(frame[key])) ||
      box.width < 2 || box.height < 2 || box.x < frame.x || box.y < frame.y ||
      box.x + box.width > frame.x + frame.width || box.y + box.height > frame.y + frame.height) return null;
  return [Math.floor(box.x + box.width / 2), Math.floor(box.y + box.height / 2)];
}

function loginState(tree, title, container) {
  const toolbars = browserToolbars(tree);
  const inContainer = toolbars.some(toolbar => [...descend(toolbar)].some(node =>
    node.role === 'button' && isVisible(node) && named(node, [container])));
  if (!inContainer) return null;
  const visible = [...descend(tree)].filter(isVisible);
  const documents = visible.filter(isDocument);
  const pageNodes = documents.flatMap(document => [...descend(document)].filter(isVisible));
  if (crashText.test(title) || [...visible.filter(node => node.role === 'heading'), ...documents]
    .some(node => crashText.test(node.name ?? ''))) return {status: 'tab-crashed'};
  if (!documents.length) return null;
  const address = addressIn(toolbars);
  const insecure = toolbars.some(toolbar => [...descend(toolbar)].some(node =>
    /^(?:不安全|Not secure)(?:$|[\s：:])/.test(node.name ?? '')));
  const loginRegions = pageNodes.filter(node =>
    (isDocument(node) || node.role === 'form') && (named(node, loginLabels) ||
      node.role === 'form' && [...descend(node)].some(field => ['password', 'protected', 'secure'].some(state => field.states?.includes(state)))));
  const pressable = loginRegions.flatMap(region => [...descend(region)].filter(node =>
    canClick(node) && named(node, loginLabels)));
  const verification = verificationText.test(title) || pageNodes.some(node =>
    ['heading', 'alert', 'dialog', 'document', 'webarea'].includes(node.role) && verificationText.test(node.name ?? ''));
  if (verification) return {status: 'verification-required'};
  if (loginRegions.length || address?.hostname === 'loginmyseller.taobao.com') {
    const button = uniqueButton(pressable, 'LOGIN_BUTTON_AMBIGUOUS', 'The login region has more than one enabled Login button.');
    return {status: 'login-pending', button: address?.protocol === 'https:' && !insecure ? button : null};
  }
  if (address?.hostname === 'myseller.taobao.com' && address.protocol === 'https:' && !insecure &&
      backendTitle.test(documents[0].name ?? '')) {
    return {status: 'backend-page', host: address.hostname};
  }
  return {status: 'unconfirmed'};
}

async function waitFor(check, timeout) {
  const deadline = Date.now() + timeout;
  do {
    const value = check();
    if (value) return value;
    if (Date.now() >= deadline) break;
    await delay(350);
  } while (true);
  return null;
}

export async function openDesktopShop(options, dependencies = {}) {
  const operationId = randomUUID();
  const desktop = dependencies.desktop ?? ecomDesktop(createDesktop(operationId), {instance: selectDesktopInstance(options)});
  const instance = desktop.instance;
  const channel = instance?.channel ?? 'stable';
  const wait = dependencies.wait ?? waitFor;
  const container = options.container;
  let window;
  let phase = 'discover';
  let loginClick = 'not-attempted';
  let launched = false;
  const receipt = (status, evidence = {}) => ({
    ok: true, schemaVersion: 1, operationId, transport: 'desktop', channel,
    windowId: window.id, pid: window.pid, ...(instance ? {instance} : {}),
    container: {name: container}, launched, status, loginClick, ...evidence,
  });
  const readWindow = () => desktop.listWindows().find(candidate => candidate.id === window.id &&
    candidate.pid === window.pid && candidate.process_instance === window.process_instance && !candidate.minimized);
  const snapshot = (current, depth, bounds) => {
    const page = desktop.snapshot(current, depth, bounds);
    if (page.complete && page.tree && page.window?.id === window.id) return page;
    return null;
  };
  const readPage = ({confirmCrash = true} = {}) => {
    const current = readWindow();
    if (!current || isManager(current.title)) return null;
    const page = snapshot(current);
    if (!page || isManager(page.window.title)) return null;
    const state = loginState(page.tree, page.window.title, container);
    if (confirmCrash && state?.status === 'tab-crashed') throw fail('TAB_CRASHED', 'The selected container tab shows Ecom’s crash page.', {executed: true});
    return state;
  };
  try {
    if (!instance && !options['window-id'] && desktop.listWindows().length === 0) {
      desktop.launch();
      launched = true;
    }
    window = await wait(() => {
      const candidates = desktop.listWindows().filter(candidate => candidate.accessible && !candidate.minimized);
      if (options['window-id']) return candidates.find(candidate => candidate.id === options['window-id']);
      if (candidates.length <= 1) return candidates[0];
      const focused = candidates.filter(candidate => candidate.is_focused);
      if (focused.length === 1) return focused[0];
      throw fail('DESKTOP_WINDOW_AMBIGUOUS', 'Select an accessible Ecom window with --window-id.',
        {diagnostics: {windowIds: candidates.map(candidate => candidate.id)}});
    }, 12000);
    if (!window) throw fail('DESKTOP_WINDOW_UNAVAILABLE', 'No accessible window in the selected Ecom instance. Check the window and the interactive desktop session.');
    if (!window.is_focused && desktop.focus) desktop.focus(window);

    phase = 'account-manager';
    let manager = isManager(window.title) ? window : null;
    if (!manager) {
      const button = await wait(() => {
        const current = readWindow();
        if (!current) return null;
        const page = snapshot(current, 12);
        if (!page) return null;
        const buttons = browserToolbars(page.tree).flatMap(toolbar => [...descend(toolbar)].filter(node =>
          canClick(node) && named(node, managerLabels)));
        return uniqueButton(buttons, 'ACCOUNT_MANAGER_AMBIGUOUS', 'Multiple Account manager toolbar buttons matched.');
      }, 8000);
      if (!button) throw fail('ACCOUNT_MANAGER_UNAVAILABLE', 'The Account manager toolbar button was unavailable.');
      let clickError;
      try { desktop.click(button.ref_id); }
      catch (error) { if (error.executed === false) throw error; clickError = error; }
      manager = await wait(() => {
        const current = readWindow();
        return isManager(current?.title) ? current : null;
      }, 10000);
      if (!manager) throw clickError ?? fail('ACCOUNT_MANAGER_UNCONFIRMED', 'Account manager did not become active in the selected window.', {executed: 'unknown'});
    }

    phase = 'account-row';
    let row;
    const accountRow = (current, bounds = false) => {
      if (!isManager(current?.title)) return null;
      const page = snapshot(current, undefined, bounds);
      const address = page && addressIn(browserToolbars(page.tree));
      if (!page || address?.protocol !== 'ecom:' || address.hostname !== 'shops') return null;
      return managerRow(page.tree, container);
    };
    const open = await wait(() => {
      row = accountRow(readWindow());
      return row?.button && (row.button.ref_id || desktop.clickPoint) ? row.button : null;
    }, desktop.focus ? 25000 : 7000);
    if (!open) throw row
      ? fail('CONTAINER_OPEN_UNAVAILABLE', 'The exact account row has no available Open button.')
      : fail('CONTAINER_NOT_FOUND', 'The requested exact name was not found in the current account table. Check the selected platform, filters and account name.');

    phase = 'open-container';
    let openError;
    try {
      let usePoint = !open.ref_id;
      if (open.ref_id) {
        try { desktop.click(open.ref_id); }
        catch (error) {
          if (!desktop.clickPoint || error.executed !== false || error.desktopCode !== 'AMBIGUOUS_TARGET') throw error;
          usePoint = true;
        }
      }
      // UI Automation may refuse repeated Open buttons with identical identities.
      // Refresh the uniquely matched row in the foreground before using its bounds.
      if (usePoint) {
        const current = readWindow();
        const fresh = current?.is_focused && accountRow(current, true);
        const point = fresh?.button && containedPoint(fresh.button, current);
        if (!point || !readWindow()?.is_focused) throw fail('CONTAINER_OPEN_UNAVAILABLE', 'The exact Open button has no safe visible bounds.');
        desktop.clickPoint(...point);
      }
    } catch (error) { if (error.executed !== 'unknown') throw error; openError = error; }
    let state;
    const ready = await wait(() => {
      state = readPage();
      return state?.button || ['backend-page', 'verification-required'].includes(state?.status) ? state : null;
    }, desktop.focus ? 25000 : 12000);
    if (!ready?.button) {
      const observed = ready ?? state;
      if (!observed) throw openError ?? fail('CONTAINER_OPEN_UNCONFIRMED', 'The active tab could not be confirmed in the requested container.', {executed: 'unknown'});
      return receipt(observed.status, observed.host ? {host: observed.host} : {});
    }

    phase = 'submit-login';
    let clickError;
    loginClick = 'unknown';
    try {
      const result = desktop.click(ready.button.ref_id, true);
      if (result?.disposition?.delivery === 'not_delivered') throw fail('LOGIN_CLICK_FAILED', 'The headed click was not delivered.', {executed: false});
      loginClick = result?.disposition?.delivery?.startsWith('delivered') ? 'delivered' : 'unknown';
    } catch (error) {
      clickError = error;
      if (error.executed === false) loginClick = 'not-delivered';
    }
    phase = 'verify';
    const result = await wait(() => {
      state = readPage({confirmCrash: false});
      return ['backend-page', 'verification-required', 'tab-crashed'].includes(state?.status) ? state : null;
    }, clickError?.executed === false ? 0 : 12000);
    if (result?.status === 'tab-crashed') throw fail('TAB_CRASHED', 'The selected container tab shows Ecom’s crash page.', {executed: true});
    if (clickError && !result) throw fail('LOGIN_CLICK_FAILED', 'The headed click failed or its delivery could not be confirmed. Inspect the current tab before retrying.',
      {executed: clickError.executed, diagnostics: clickError.diagnostics});
    const observed = result ?? state;
    return receipt(observed?.status ?? 'unconfirmed', observed?.host ? {host: observed.host} : {});
  } catch (error) {
    error.operationId ??= operationId;
    error.diagnostics = {...error.diagnostics, phase, loginClick, channel, pid: window?.pid ?? instance?.pid,
      instanceId: instance?.id, windowId: window?.id, launched};
    throw error;
  }
}
