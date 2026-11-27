import assert from 'node:assert/strict';
import test from 'node:test';
import {openDesktopShop} from '../lib/login/open-shop.mjs';
import {desktopFiles, ecomDesktop, selectDesktopInstance} from '../lib/login/desktop-runtime.mjs';
import {parse} from '../lib/cli.mjs';
import {fail} from '../lib/common.mjs';

const name = '示例店铺';
const window = {id: 'w-fixture', pid: 41, process_instance: 'process-one', accessible: true, is_focused: true};
const node = (role, name, children = [], fields = {}) => ({role, name, children, ...fields});
const button = (name, ref_id) => node('button', name, [], {ref_id});
const row = (name, ref = '@table:open') => node('row', '', [
  node('cell', name, [node('statictext', name)]), node('cell', '', [button('打开', ref)]),
]);
const manager = title => [title, 'ecom://shops', node('table', '', [row(name)])];
const backend = ['天猫商家中心', 'myseller.taobao.com/home.htm/?access_token=secret'];
const login = ['登录', 'loginmyseller.taobao.com/', node('form', '登录', [button('登录', '@form:login')])];
const challenge = ['身份验证', 'loginmyseller.taobao.com/', node('heading', '安全验证')];
const pddLogin = 'mms.pinduoduo.com/login/';
const pddBackend = ['拼多多 商家后台', 'mms.pinduoduo.com/home/'];
const pddQr = ['拼多多商家后台', pddLogin, node('group', '', [
  node('group', '', [node('statictext', '扫码登录')]),
  node('group', '', [node('statictext', '账号登录')], {ref_id: '@pdd:account', available_actions: ['Click']}),
])];
const pddForm = (account = 'fixture-account') => ['拼多多商家后台', pddLogin, node('group', '', [
  node('textfield', '', [], {value: account}),
  node('textfield', '请输入密码', [], {states: ['secure'], bounds: {x: 30, y: 40, width: 80, height: 20}}),
  button('登录', '@form:login'),
])];

function scenario({initial = manager('Ecom · 账号管理'), landing = login, after = backend, clickError, wrongContainer, initiallyClosed = false, duplicateOpenRef = false, accountForm, prefill, focused = true, focusError, nativeNavigation = false, windowsPointer = false, boundedPage} = {}) {
  let page = initial;
  let stage = initiallyClosed ? 'closed' : 'initial';
  const clicks = [];
  const desktop = {
    listWindows: () => stage === 'closed' ? [] : [{...window, is_focused: focused, title: page[0], bounds: {x: -200, y: 0, width: 400, height: 300}}],
    launch: () => {stage = 'initial';},
    snapshot(_window, _depth, bounds) {
      const [title, url, ...content] = bounds && boundedPage ? boundedPage : page;
      const toolbar = node('toolbar', '', [
        node('textfield', '地址和搜索栏', [], {value: url}),
        button('账号管理', '@toolbar:manager'),
        ...(stage !== 'initial' ? [button(wrongContainer ?? name, '@toolbar:container')] : []),
      ]);
      return {complete: true, window: {...window, title}, tree: node('window', title, [toolbar, node('webarea', title, content)])};
    },
    click(ref, headed = false) {
      clicks.push([ref, headed]);
      if (ref === '@toolbar:manager') page = manager('Ecom · 账号管理');
      if (ref === '@table:open') {
        if (duplicateOpenRef) throw fail('FIXTURE', 'Unaddressable repeated UIA button', {executed: false, desktopCode: 'AMBIGUOUS_TARGET'});
        stage = 'opened';page = landing;
      }
      if (ref === '@pdd:account') page = accountForm;
      if (ref === '@form:login') {
        if (clickError) throw clickError;
        page = after;
        return {disposition: {delivery: 'delivered'}};
      }
    },
  };
  if (prefill) desktop.securePrefill = (_window, point) => {
    assert.deepEqual(point, [70, 50]);
    return prefill;
  };
  if (duplicateOpenRef || focusError || windowsPointer) {
    desktop.focus = () => {
      if (focusError) throw focusError;
      focused = true;
    };
  }
  if (duplicateOpenRef || windowsPointer) {
    desktop.clickPoint = (x, y) => {
      clicks.push([x, y]);
      if (stage === 'opened') {
        if (clickError) throw clickError;
        page = after;
        return {disposition: {delivery: 'delivered_unverified'}};
      }
      stage = 'opened';
      page = landing;
    };
  }
  const navigate = nativeNavigation ? async target => {
    assert.equal(target, name);
    stage = 'opened';
    page = landing;
  } : undefined;
  const run = () => openDesktopShop({container: name}, {desktop, navigate, wait: async check => check() ?? null});
  return {run, clicks};
}

test('discovers the desktop command and the pinned platform executable layouts', () => {
  assert.deepEqual(parse(['shops', 'open-login', '--container', name, '--window-id', window.id]).options,
    {container: name, 'window-id': window.id});
  assert.throws(() => parse(['shops', 'open-login', '--container', '  ']), {code: 'INVALID_ARGUMENT'});
  assert.equal(parse(['shops', 'open-login', '--container', name, '--profile', 'dev']).options.profile, 'dev');
  assert.equal(parse(['shops', 'open-login', '--container', name, '--instance', 'dev-id']).options.instance, 'dev-id');
  assert.equal(desktopFiles('win32', 'x64').bin, 'bin/agent-desktop-win32-x64.exe');
  assert.equal(desktopFiles('win32', 'arm64').bin, 'bin/agent-desktop-win32-arm64.exe');
  assert.equal(desktopFiles('darwin', 'arm64').helper, 'bin/agent-desktop-macos-helper-darwin-arm64');
  assert.equal(desktopFiles('linux', 'x64'), null);
});

test('desktop selectors reuse explicit discovery and pin the app and window PID', async () => {
  const selectors = {profile: '/example/dev-profile', instance: 'dev-id'};
  const instance = selectDesktopInstance(selectors, 'darwin', (options, flags) => {
    assert.deepEqual(options, selectors);
    assert.deepEqual(flags, {allowFixedDevCdp: true});
    return {channel: 'dev', endpoint: {pid: 42, instanceId: 'dev-id'}};
  });
  assert.equal(selectDesktopInstance({}, 'win32'), null);
  assert.throws(() => selectDesktopInstance(selectors, 'linux'), {code: 'PLATFORM_UNSUPPORTED'});
  const windows = [{...window, id: 'different-pid'}, {...window, id: 'selected-dev', pid: 42}];
  const calls = [];
  const desktop = ecomDesktop((...args) => {
    calls.push(args);
    assert.equal(args[0], 'list-windows');
    return windows;
  }, {instance, platform: 'darwin'});
  assert.deepEqual(desktop.listWindows(), [windows[1]]);
  assert.deepEqual(calls[0], ['list-windows', '--app', 'app.ecom.browser.dev']);
  assert.deepEqual(ecomDesktop((...args) => args, {platform: 'darwin'}).listWindows(),
    ['list-windows', '--app', 'app.ecom.browser']);
  await assert.rejects(openDesktopShop({container: name, 'window-id': 'different-pid'}, {
    desktop, wait: async check => check() ?? null,
  }), {code: 'DESKTOP_WINDOW_UNAVAILABLE'});
  windows.pop();
  await assert.rejects(openDesktopShop({container: name}, {
    desktop, wait: async check => check() ?? null,
  }), {code: 'DESKTOP_WINDOW_UNAVAILABLE'});
});

test('Windows desktop login targets the verified executable and PID for formal and Dev instances', async () => {
  const other = {...window, id: 'other-window', pid: 41};
  const pinned = {...window, id: 'pinned-window', pid: 42};
  const options = {instance: 'windows-instance'};
  for (const [channel, application] of [
    ['stable', 'Ecom.exe'], ['dev', 'Ecom Dev.exe'], ['dev', 'Ecom.exe'],
  ]) {
    const instance = selectDesktopInstance(options, 'win32', (selected, flags) => {
      assert.equal(selected, options);
      assert.deepEqual(flags, {allowFixedDevCdp: false});
      return {channel, endpoint: {instanceId: options.instance, pid: 42,
        executable: 'C:\\Ecom\\' + application}};
    });
    const calls = [];
    const desktop = ecomDesktop((...args) => {
      calls.push(args);
      if (args[0] === 'list-windows') return [other, pinned];
    }, {instance, platform: 'win32'});
    assert.deepEqual(desktop.instance, {id: options.instance, pid: 42, channel});
    assert.deepEqual(desktop.listWindows(), [pinned]);
    desktop.focus(pinned);
    desktop.snapshot(pinned);
    assert.deepEqual(calls.map(([method, flag, app]) => [method, flag, app]), [
      ['list-windows', '--app', application],
      ['focus-window', '--app', application],
      ['snapshot', '--app', application],
    ]);
    await assert.rejects(openDesktopShop({...options, container: name, 'window-id': other.id}, {
      desktop, wait: async check => check() ?? null,
    }), {code: 'DESKTOP_WINDOW_UNAVAILABLE'});
  }
});

test('launches when needed, opens the matched row and performs exactly one headed login click', async () => {
  const flow = scenario({initiallyClosed: true, initial: ['Some page', 'example.com/']});
  const result = await flow.run();
  assert.equal(result.launched, true);
  assert.equal(result.status, 'backend-page');
  assert.equal(result.host, 'myseller.taobao.com');
  assert.equal(result.loginClick, 'delivered');
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.deepEqual(flow.clicks, [['@toolbar:manager', false], ['@table:open', false], ['@form:login', true]]);
});

test('an existing merchant session requires no login click', async () => {
  const flow = scenario({landing: backend});
  const result = await flow.run();
  assert.equal(result.status, 'backend-page');
  assert.equal(result.loginClick, 'not-attempted');
  assert.deepEqual(flow.clicks, [['@table:open', false]]);
});

test('native account opening checks the target before clicking the desktop login form', async () => {
  const flow = scenario({nativeNavigation: true});
  const result = await flow.run();
  assert.equal(result.navigation, 'native');
  assert.equal(result.status, 'backend-page');
  assert.deepEqual(flow.clicks, [['@form:login', true]]);

  const wrong = scenario({nativeNavigation: true, wrongContainer: name + ' 2'});
  await assert.rejects(wrong.run(), {code: 'CONTAINER_OPEN_UNCONFIRMED'});
  assert.deepEqual(wrong.clicks, []);
});

test('recognizes the Tmall Global merchant workbench after a single login click', async () => {
  const flow = scenario({after: ['天猫国际商家工作台', 'myseller.taobao.com/home.htm']});
  const result = await flow.run();
  assert.equal(result.status, 'backend-page');
  assert.equal(result.loginClick, 'delivered');
  assert.equal(flow.clicks.filter(([, headed]) => headed).length, 1);
});

test('switches the Pinduoduo QR page to account mode and submits only the prefilled form', async () => {
  const flow = scenario({landing: pddQr, accountForm: pddForm(), prefill: 'filled', after: pddBackend});
  const result = await flow.run();
  assert.equal(result.status, 'backend-page');
  assert.equal(result.host, 'mms.pinduoduo.com');
  assert.equal(result.loginClick, 'delivered');
  assert.ok(!JSON.stringify(result).includes('fixture-account'));
  assert.deepEqual(flow.clicks, [['@table:open', false], ['@pdd:account', true], ['@form:login', true]]);
});

test('Pinduoduo stops on missing or unverifiable prefill and does not reopen account mode', async () => {
  for (const [accountForm, prefill, code] of [
    [pddForm(''), 'filled', 'LOGIN_CREDENTIALS_MISSING'],
    [pddForm(), 'empty', 'LOGIN_CREDENTIALS_MISSING'],
    [pddForm(), undefined, 'LOGIN_PREFILL_UNVERIFIABLE'],
  ]) {
    const flow = scenario({landing: accountForm, prefill});
    await assert.rejects(flow.run(), error => error.code === code && error.diagnostics.loginClick === 'not-attempted');
    assert.deepEqual(flow.clicks, [['@table:open', false]]);
  }
});

test('Pinduoduo reports a verification challenge or an existing merchant session without clicking Login', async () => {
  for (const [landing,status] of [
    [pddBackend,'backend-page'],
    [['拼多多商家后台', pddLogin, node('heading', '短信验证')], 'verification-required'],
    [['拼多多商家后台', 'mms.pinduoduo.com.example.com/login/', ...pddQr.slice(2)], 'unconfirmed'],
  ]) {
    const flow = scenario({landing});
    const result = await flow.run();
    assert.equal(result.status, status);
    assert.deepEqual(flow.clicks, [['@table:open', false]]);
  }
});

test('an undelivered Windows UIA Open click can use the matching row’s live bounds', async () => {
  const initial = manager('Ecom · 账号管理');
  initial[2].children[0].children[1].children[0].bounds = {x: -160, y: 100, width: 40, height: 20};
  const flow = scenario({initial, duplicateOpenRef: true, landing: backend, focused: false});
  assert.equal((await flow.run()).status, 'backend-page');
  assert.deepEqual(flow.clicks, [['@table:open', false], [-140, 110]]);

  initial[2].children[0].children[1].children[0].bounds.x = -260;
  const outside = scenario({initial, duplicateOpenRef: true, landing: backend});
  await assert.rejects(outside.run(), {code: 'CONTAINER_OPEN_UNAVAILABLE'});
  assert.deepEqual(outside.clicks, [['@table:open', false]]);
});

test('Windows only clicks fresh foreground bounds for the form-scoped Login button', async () => {
  const focusError = fail('DESKTOP_OPERATION_FAILED', 'Windows denied foreground focus', {executed: false});
  const boundedPage = [login[0], login[1], node('form', '登录', [
    node('button', '登录', [], {ref_id: '@fresh:login', bounds: {x: -80, y: 90, width: 40, height: 20}}),
  ])];
  const options = {focused: false, windowsPointer: true, nativeNavigation: true, boundedPage};
  const flow = scenario(options);
  const result = await flow.run();
  assert.equal(result.status, 'backend-page');
  assert.equal(result.loginClick, 'delivered');
  assert.deepEqual(flow.clicks, [[-60, 100]]);

  const blocked = scenario({...options, focusError});
  const noBounds = scenario({...options, boundedPage: login});
  for (const attempt of [blocked, noBounds]) {
    await assert.rejects(attempt.run(), {code: 'LOGIN_CLICK_FAILED', executed: false});
    assert.deepEqual(attempt.clicks, []);
  }

  const challenged = scenario({...options, boundedPage: challenge});
  assert.equal((await challenged.run()).status, 'verification-required');
  assert.deepEqual(challenged.clicks, []);

  const unknown = scenario({...options, clickError: fail('FIXTURE', 'Pointer outcome unknown', {executed: 'unknown'})});
  await assert.rejects(unknown.run(), error => error.code === 'LOGIN_CLICK_FAILED' &&
    error.executed === 'unknown' && error.diagnostics.loginClick === 'unknown');
  assert.deepEqual(unknown.clicks, [[-60, 100]]);
});

test('account name is exact and duplicate matches stop before opening', async () => {
  const initial = ['Ecom · 账号管理', 'ecom://shops', node('table', '', [row(name), row(name, '@table:other')])];
  const duplicated = scenario({initial});
  await assert.rejects(duplicated.run(), {code: 'CONTAINER_AMBIGUOUS'});
  assert.deepEqual(duplicated.clicks, []);
  initial[2] = node('table', '', [row(name + ' 2')]);
  const missing = scenario({initial});
  await assert.rejects(missing.run(), {code: 'CONTAINER_NOT_FOUND'});
  assert.deepEqual(missing.clicks, []);
});

test('requires the target container and a form-scoped button', async () => {
  const wrong = scenario({wrongContainer: name + ' 2'});
  await assert.rejects(wrong.run(), {code: 'CONTAINER_OPEN_UNCONFIRMED'});
  assert.deepEqual(wrong.clicks, [['@table:open', false]]);
  const noForm = scenario({landing: ['首页', 'example.com/', button('登录', '@unrelated')]});
  assert.equal((await noForm.run()).status, 'unconfirmed');
  assert.deepEqual(noForm.clicks, [['@table:open', false]]);
});

test('distinguishes verification, a remaining login form and an unconfirmed destination', async () => {
  for (const [after, expected] of [
    [challenge, 'verification-required'],
    [login, 'login-pending'],
    [['天猫商家中心', 'myseller.taobao.com.example.com/'], 'unconfirmed'],
  ]) {
    const flow = scenario({after});
    assert.equal((await flow.run()).status, expected);
    assert.equal(flow.clicks.filter(([, headed]) => headed).length, 1);
  }
  const pending = scenario({landing: challenge});
  assert.equal((await pending.run()).status, 'verification-required');
  assert.equal(pending.clicks.filter(([, headed]) => headed).length, 0);
});

test('reports failed delivery and a crashed tab separately without retrying login', async () => {
  const missed = scenario({clickError: fail('FIXTURE', 'Click could not reach the control', {executed: false})});
  await assert.rejects(missed.run(), error => error.code === 'LOGIN_CLICK_FAILED' &&
    error.executed === false && error.diagnostics.loginClick === 'not-delivered');
  const crashed = scenario({after: ['Aw, Snap!', 'loginmyseller.taobao.com/']});
  await assert.rejects(crashed.run(), error => error.code === 'TAB_CRASHED' && error.diagnostics.loginClick === 'delivered');
  for (const flow of [missed, crashed]) assert.equal(flow.clicks.filter(([, headed]) => headed).length, 1);
});
