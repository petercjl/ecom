import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {callMailbox, discover, readMailbox, resolveContainer} from './browser.mjs';
import {exists, fail, privatePath} from './common.mjs';

export function validatePageOptions(command, options) {
  let url;
  try { url = new URL(options.url); } catch {}
  if (!options.container || !url || url.protocol !== 'https:' ||
      url.username || url.password || url.port || options.url.length > 8192)
    throw fail('INVALID_ARGUMENT', 'Specify a container and a credential-free HTTPS page URL');
  if (command === 'media download' && !options.output)
    throw fail('INVALID_ARGUMENT', 'Specify a new local file with --output');
}

export async function pageCommand(command, options) {
  validatePageOptions(command, options);
  const output = command === 'media download' ? path.resolve(options.output) : null;
  if (output && exists(output)) throw fail('OUTPUT_EXISTS', 'Choose a new output file');
  if (output && !fs.statSync(path.dirname(output), {throwIfNoEntry:false})?.isDirectory())
    throw fail('INVALID_ARGUMENT', 'Output parent directory must exist');
  const connection = discover(options);
  if (connection.endpoint.backgroundPageProtocol !== 1)
    throw fail('BROWSER_UPGRADE_REQUIRED', 'Use an Ecom build with background page protocol 1');
  const {containers} = await readMailbox(connection);
  const {id} = resolveContainer(containers, options.container);
  const result = await callMailbox(connection, {
    method: output ? 'media.download' : 'page.read',
    containerId: id,
    url: new URL(options.url).href,
  }, output ? 92000 : 29000);
  if (result.containerId !== id)
    throw fail('PROTOCOL_MISMATCH', 'Response did not match the selected container');
  if (!output) return result;
  const {artifact, ...receipt} = result;
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  if (typeof artifact !== 'string' || !path.isAbsolute(artifact) ||
      !fs.realpathSync(artifact).startsWith(temporaryRoot + path.sep))
    throw fail('PROTOCOL_MISMATCH', 'Invalid media artifact path');
  privatePath(artifact);
  try {
    if (!Number.isSafeInteger(result.bytes) || result.bytes <= 0 ||
        fs.statSync(artifact).size !== result.bytes)
      throw fail('PROTOCOL_MISMATCH', 'Invalid media artifact size');
    fs.copyFileSync(artifact, output, fs.constants.COPYFILE_EXCL);
  } finally {
    fs.unlinkSync(artifact);
  }
  return {...receipt, output};
}
