import assert from 'node:assert/strict';
import test from 'node:test';
import {openDesktopShop} from '../lib/desktop-shop.mjs';
import {desktopFiles, ecomDesktop, selectDesktopInstance} from '../lib/desktop-runtime.mjs';
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

function scenario({initial = manager('Ecom · 账号管理'), landing = login, after = backend, clickError, wrongContainer, initiallyClosed = false, duplicateOpenRef = false} = {}) {
  let page = initial;
  let stage = initiallyClosed ? 'closed' : 'initial';
  const clicks = [];
  const desktop = {
    listWindows: () => stage === 'closed' ? [] : [{...window, title: page[0], bounds: {x: -200, y: 0, width: 400, height: 300}}],
    launch: () => {stage = 'initial';},
    snapshot() {
      const [title, url, ...content] = page;
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
      if (ref === '@form:login') {
        if (clickError) throw clickError;
        page = after;
        return {disposition: {delivery: 'delivered'}};
      }
    },
  };
  if (duplicateOpenRef) {
    desktop.focus = () => {};
    desktop.clickPoint = (x, y) => {clicks.push([x, y]);stage = 'opened';page = landing;};
  }
  const run = () => openDesktopShop({container: name}, {desktop, wait: async check => check() ?? null});
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
  assert.throws(() => selectDesktopInstance(selectors, 'win32'), {code: 'PLATFORM_UNSUPPORTED'});
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

test('recognizes the Tmall Global merchant workbench after a single login click', async () => {
  const flow = scenario({after: ['天猫国际商家工作台', 'myseller.taobao.com/home.htm']});
  const result = await flow.run();
  assert.equal(result.status, 'backend-page');
  assert.equal(result.loginClick, 'delivered');
  assert.equal(flow.clicks.filter(([, headed]) => headed).length, 1);
});

test('an undelivered Windows UIA Open click can use the matching row’s live bounds', async () => {
  const initial = manager('Ecom · 账号管理');
  initial[2].children[0].children[1].children[0].bounds = {x: -160, y: 100, width: 40, height: 20};
  const flow = scenario({initial, duplicateOpenRef: true, landing: backend});
  assert.equal((await flow.run()).status, 'backend-page');
  assert.deepEqual(flow.clicks, [['@table:open', false], [-140, 110]]);

  initial[2].children[0].children[1].children[0].bounds.x = -260;
  const outside = scenario({initial, duplicateOpenRef: true, landing: backend});
  await assert.rejects(outside.run(), {code: 'CONTAINER_OPEN_UNAVAILABLE'});
  assert.deepEqual(outside.clicks, [['@table:open', false]]);
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
