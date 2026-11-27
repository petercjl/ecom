import assert from 'node:assert/strict';
import test from 'node:test';
import {windowsInstanceCandidates} from '../lib/browser/windows-session.mjs';

const env = {LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local'};
const installed = env.LOCALAPPDATA + '\\Ecom\\Application\\Ecom.exe';
const dev = 'E:\\build\\Ecom Dev\\Ecom.exe';
const profile = 'E:\\build\\profiles\\Ecom-Dev';
const row = (ProcessId, ExecutablePath, options = '') => ({
  ProcessId, ExecutablePath, CommandLine: '"' + ExecutablePath + '" ' + options,
});

test('Windows native discovery defaults to the installed browser', () => {
  const rows = [
    row(1, installed),
    row(2, installed, '--type=renderer'),
    row(3, installed, '--remote-debugging-port=9222'),
    row(4, dev, '--ecom-dev "--user-data-dir=' + profile + '"'),
    row(5, 'E:\\Downloads\\Ecom.exe'),
  ];
  assert.deepEqual(windowsInstanceCandidates(rows, {}, env), [{
    pid: 1, executable: installed, profile: env.LOCALAPPDATA + '\\Ecom\\User Data',
    channel: 'stable',
  }]);
});

test('Windows discovery pins a Dev profile passed as one quoted argument', () => {
  const customProfile = profile + ' 新';
  const rows = [
    row(1, installed),
    row(2, dev, '--ecom-dev "--user-data-dir=' + customProfile + '"'),
    row(3, dev, '--ecom-dev --user-data-dir=' + profile),
  ];
  assert.deepEqual(windowsInstanceCandidates(rows, {profile: customProfile.toLowerCase()}, env), [{
    pid: 2, executable: dev, profile: customProfile, channel: 'dev',
  }]);
});
