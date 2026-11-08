import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fail} from './common.mjs';
import {discover, inspectInConnection, callMailbox} from './browser.mjs';

const maxImage = 10 * 1024 * 1024;
const maxTotal = 24 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const creatorUrl = 'https://creator.xiaohongshu.com/publish/publish';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const invalid = message => fail('INVALID_NOTE', message, {executed:false});

function readBounded(file, limit) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || !stat.size || stat.size > limit) throw Error();
    const bytes = Buffer.alloc(stat.size + 1);
    let n = 0;
    while (n < bytes.length) {
      const got = fs.readSync(fd, bytes, n, bytes.length - n, null);
      if (!got) break;
      n += got;
    }
    if (n !== stat.size) throw Error();
    return bytes.subarray(0,n);
  } catch {
    throw invalid('Input must be a readable regular file within the size limit');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function imageType(bytes) {
  if (bytes.length >= 33 && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) &&
      bytes.subarray(8,16).equals(Buffer.from('0000000d49484452','hex')) &&
      bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 &&
      bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082','hex'))) return 'image/png';
  if (bytes.length >= 20 && bytes[0] === 255 && bytes[1] === 216 &&
      bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return 'image/jpeg';
  throw invalid('Images must have PNG or JPEG signatures');
}

export function readNote(file, keepBytes = false) {
  if (!file) throw invalid('Specify --manifest with a JSON note manifest');
  const manifest = path.resolve(file);
  let doc;
  try { doc = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readBounded(manifest,16384))); }
  catch { throw invalid('Expected a readable UTF-8 JSON manifest of at most 16 KiB'); }
  if (!doc || Array.isArray(doc) || typeof doc !== 'object' ||
      Object.keys(doc).some(k=>!['title','body','topics','images'].includes(k)))
    throw invalid('Manifest accepts title, body, topics and ordered images');
  const {title,body,topics=[],images} = doc;
  if (typeof title !== 'string' || !title.trim() || title !== title.trim() || title.length > 20 || /[\r\n\x00-\x1f]/.test(title))
    throw invalid('Title must be a single trimmed line of 1 to 20 UTF-16 units');
  if (typeof body !== 'string' || !body.trim() || /[\x00-\x08\x0b-\x1f]/.test(body))
    throw invalid('Body must contain text; use LF for line breaks');
  if (!Array.isArray(topics) || topics.length > 10 || new Set(topics).size !== topics.length ||
      topics.some(t=>typeof t !== 'string' || !/^[\p{L}\p{M}\p{N}_-]{1,30}$/u.test(t)))
    throw invalid('Topics must be up to 10 unique plain names without # or spaces');
  const text = body + (topics.length ? '\n\n' + topics.map(t=>'#'+t).join(' ') : '');
  if (text.length > 1000) throw invalid('Body including topic text must fit 1000 UTF-16 units');
  if (!Array.isArray(images) || !images.length || images.length > 18)
    throw invalid('Provide 1 to 18 ordered images');
  let total = 0;
  const media = images.map((name,index)=>{
    if (typeof name !== 'string' || !name.trim() || name.includes('\0'))
      throw invalid('Each image must be a local file path');
    const bytes = readBounded(path.resolve(path.dirname(manifest),name),maxImage);
    total += bytes.length;
    if (total > maxTotal) throw invalid('Combined images exceed the Ecom limit of 24 MiB');
    return {index:index+1,name:path.basename(name),type:imageType(bytes),size:bytes.length,sha256:hash(bytes),...(keepBytes?{bytes}:{})};
  });
  if (new Set(media.map(m=>m.sha256)).size !== media.length)
    throw invalid('Image bytes must be unique');
  const summary = {title,body,topics,images:media.map(({bytes,...m})=>m)};
  return {summary,text,digest:hash(JSON.stringify(summary)),media};
}

export async function noteCommand(action, options, deps={}) {
  if (action === 'preflight') {
    const note = readNote(options.manifest);
    return {ok:true,schemaVersion:1,state:'preflight-passed',manifestDigest:note.digest,
      note:note.summary,topicMode:'literal-text',submitted:false};
  }
  if (!options.container) throw fail('INVALID_ARGUMENT','Specify --container');
  const connection = (deps.discover??discover)(options);
  if (action === 'probe') {
    if (connection.endpoint.xhsCreatorProbeProtocol !== 1)
      throw fail('BROWSER_UPGRADE_REQUIRED','Creator probe requires a compatible Ecom Dev');
    const {container} = await (deps.inspect??inspectInConnection)(connection,options.container);
    if (container.platform !== 'xiaohongshu') throw fail('XHS_CONTAINER_REQUIRED','Select a Xiaohongshu account container');
    const result = await (deps.call??callMailbox)(connection,{method:'business.read',operation:'xhs.creator-probe',containerId:container.id,params:{}},30000);
    if (result.containerId !== container.id || result.businessOperation !== 'xhs.creator-probe')
      throw fail('PROTOCOL_MISMATCH','Unexpected creator page response',{operationId:result.operationId,executed:'unknown'});
    return {ok:true,schemaVersion:1,operationId:result.operationId,container,
      instance:{id:connection.endpoint.instanceId,channel:connection.channel},creatorUrl,probe:result.data};
  }
  throw fail('INVALID_ARGUMENT','Unknown note command');
}
