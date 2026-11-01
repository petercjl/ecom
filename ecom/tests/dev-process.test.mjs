import test from 'node:test';
import assert from 'node:assert/strict';
import { findDevProcess } from '../build-dev.mjs';

const expected = { executable: '/build/Ecom Dev.app/Contents/MacOS/Ecom Dev', profile: '/build/dev-profile', uid: 501 };
const command = `${expected.executable} --user-data-dir=${expected.profile} --restore-last-session`;

test('Dev discovery selects the exact executable, owner and profile without a debug endpoint', () => {
  const listing = [
    `11 501 /build/Ecom Dev.app/Contents/Frameworks/Ecom Dev Helper.app/Contents/MacOS/Ecom Dev Helper --user-data-dir=${expected.profile}`,
    `12 502 ${command}`,
    `13 501 ${command.replace('/build/dev-profile', '/build/dev-profile-other')}`,
    `14 501 /Applications/Google Chrome --user-data-dir=${expected.profile}`,
    ` 15 501 ${command}`,
  ].join('\n');
  assert.deepEqual(findDevProcess(listing, expected), { pid: 15, command });
});

test('Dev discovery preserves unrelated processes and rejects ambiguous instances', () => {
  assert.equal(findDevProcess(`7 501 /Applications/Other Browser --user-data-dir=/other`, expected), null);
  assert.throws(() => findDevProcess(`8 501 ${command}\n9 501 ${command}`, expected), /多个/);
});
