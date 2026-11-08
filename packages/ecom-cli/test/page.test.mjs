import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parse} from '../lib/cli.mjs';
import {mediaPageUrl, pageCommand} from '../lib/page.mjs';

test('media downloads preserve the Douyin work ID and arbitrary other page URLs', () => {
  const workId = '7674116903064964415';
  assert.equal(mediaPageUrl('https://www.douyin.com/video/' + workId),
    'https://open.douyin.com/player/video?vid=' + workId);
  for (const url of ['https://example.test/video/' + workId,
    'https://www.douyin.com/video/' + workId + '?modal_id=other',
    'https://www.douyin.com.example.test/video/' + workId])
    assert.equal(mediaPageUrl(url), url);
});

test('page commands reject unsafe targets and downloads refuse existing outputs before discovery', async () => {
  for (const url of ['http://example.test/', 'https://u:p@example.test/',
    'https://example.test:8443/', 'file:///tmp/video'])
    assert.throws(() => parse(['page', 'read', '--url', url, '--container', 'test']),
      error => error.code === 'INVALID_ARGUMENT');
  assert.throws(() => parse(['media','download','--url','https://example.test/',
    '--container','test']), error => error.code === 'INVALID_ARGUMENT');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-media-test-'));
  const output = path.join(dir, 'existing.mp4');
  try {
    fs.writeFileSync(output, 'untouched', {flag:'wx', mode:0o600});
    await assert.rejects(pageCommand('media download', {
      url:'https://example.test/', container:'test', output,
    }), error => error.code === 'OUTPUT_EXISTS');
    assert.equal(fs.readFileSync(output, 'utf8'), 'untouched');
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
});
