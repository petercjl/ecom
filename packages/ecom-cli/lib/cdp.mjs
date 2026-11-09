import fs from 'node:fs/promises';
import path from 'node:path';
import {fail} from './common.mjs';

export async function cdpCommand(command, options) {
  if (!options.profile || !path.isAbsolute(options.profile)) {
    throw fail('INVALID_ARGUMENT', 'Specify the absolute Ecom Dev --profile path');
  }
  let endpoint;
  try {
    const file = path.join(options.profile, 'DevToolsActivePort');
    const info = await fs.lstat(file);
    if (!info.isFile() || info.size > 256) throw new Error();
    endpoint = (await fs.readFile(file, 'utf8')).trim().split(/\r?\n/);
  } catch {
    throw fail('CDP_NOT_ENABLED', 'No CDP endpoint in this profile. Start Ecom Dev in CDP mode.');
  }
  const [rawPort, browserPath] = endpoint;
  const port = Number(rawPort);
  if (!/^\d{1,5}$/.test(rawPort) || port < 1 || port > 65535 ||
      !/^\/devtools\/browser\/[\da-f-]+$/i.test(browserPath ?? '')) {
    throw fail('CDP_ENDPOINT_INVALID', 'Invalid Ecom CDP endpoint record');
  }
  const host = '127.0.0.1:' + port;
  const httpUrl = 'http://' + host;
  const webSocketDebuggerUrl = 'ws://' + host + browserPath;
  async function read(route) {
    try {
      const response = await fetch(httpUrl + route, {redirect: 'error', signal: AbortSignal.timeout(3000)});
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      throw fail('CDP_UNREACHABLE', 'Ecom CDP did not respond on loopback');
    }
  }
  const version = await read('/json/version');
  if (version.webSocketDebuggerUrl !== webSocketDebuggerUrl) {
    throw fail('CDP_ENDPOINT_INVALID', 'The live CDP endpoint does not match the selected profile');
  }
  if (command === 'endpoint') return {ok: true, httpUrl, webSocketDebuggerUrl};
  if (command === 'tabs') return {ok: true, targets: await read('/json/list')};
  const method = options['cdp-method'];
  const target = options['cdp-target'];
  if (!/^[A-Za-z]+\.[A-Za-z][A-Za-z0-9]*$/.test(method ?? '') ||
      (target && !/^[\da-f]+$/i.test(target))) {
    throw fail('INVALID_ARGUMENT', 'Specify a CDP Domain.method and optionally a target ID from cdp tabs');
  }
  let params;
  try {
    params = JSON.parse(options['params-json'] ?? '{}');
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error();
  } catch {
    throw fail('INVALID_ARGUMENT', 'CDP parameters must be a JSON object');
  }
  const url = target ? 'ws://' + host + '/devtools/page/' + target : webSocketDebuggerUrl;
  const socket = new WebSocket(url);
  try {
    const result = await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(fail('CDP_TIMEOUT', 'No CDP reply; execution outcome is unknown')), 15000);
      const finish = (error, value) => {
        clearTimeout(deadline);
        if (error) reject(error);
        else resolve(value);
      };
      socket.addEventListener('open', () => socket.send(JSON.stringify({id: 1, method, params})), {once: true});
      socket.addEventListener('message', event => {
        const reply = JSON.parse(event.data);
        if (reply.id !== 1) return;
        if (reply.error) finish(fail('CDP_COMMAND_FAILED', reply.error.message));
        else finish(null, reply.result);
      });
      socket.addEventListener('error', () => finish(fail('CDP_DISCONNECTED', 'CDP socket failed; check the target before retrying')), {once: true});
      socket.addEventListener('close', () => finish(fail('CDP_DISCONNECTED', 'CDP socket closed before reply')), {once: true});
    });
    return {ok: true, result};
  } finally {
    socket.close();
  }
}
