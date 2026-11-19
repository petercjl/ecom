import test from 'node:test';
import assert from 'node:assert/strict';
import { devBuildJobs } from '../build-dev.mjs';

test('explicit nightly concurrency reaches native build without consuming launch options', () => {
  assert.deepEqual(devBuildJobs(['--source-ref', 'main', '--jobs=8', '--cdp-port=9225']), {
    args: ['--source-ref', 'main', '--cdp-port=9225'], jobs: 8, ninjaArgs: ['--ninja', 'j:8'],
  });
  assert.deepEqual(devBuildJobs([]), { args: [], jobs: undefined, ninjaArgs: [] });
});

test('invalid or duplicate concurrency fails before build starts', () => {
  for (const args of [['--jobs'], ['--jobs=0'], ['--jobs=-1'], ['--jobs=8.5'], ['--jobs=257'], ['--jobs=8', '--jobs=4']]) {
    assert.throws(() => devBuildJobs(args), /--jobs/);
  }
});
