import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {fail, privatePath, writeNew} from './common.mjs';
import {discover, inspectInConnection, callMailbox} from './browser.mjs';

const maxImage = 10 * 1024 * 1024;
const maxTotal = 24 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const accountPattern = /^[0-9a-f]{24}$/;
const states = new Set(['opening','login-required','verification-required','page-changed',
  'account-unverified','account-ready','account-mismatch','unsupported-form',
  'uploading','upload-incomplete','form-readback-mismatch','form-not-empty','form-changed','form-ready',
  'images-ready','review-incomplete','review-ready',
  'submission-checking','submission-unknown','not-submitted','submitted','published']);
export function validateNoteOptions(action, options) {
  if (['preflight','prepare','upload','fill'].includes(action) && !options.manifest)
    throw fail('INVALID_ARGUMENT','Specify --manifest');
  if (action === 'preflight') return;
  if (!options.container) throw fail('INVALID_ARGUMENT','Specify --container');
  if (options['fixture-port'] !== undefined && (!/^\d{4,5}$/.test(options['fixture-port']) ||
      Number(options['fixture-port']) < 1024 || Number(options['fixture-port']) > 65535))
    throw fail('INVALID_ARGUMENT','Specify a loopback fixture port from 1024 to 65535');
  if (['status','prepare','submit','upload','fill'].includes(action) && !uuid.test(options.preparation??''))
    throw fail('INVALID_ARGUMENT','Specify --preparation with the ID returned by open');
  if (['prepare','submit','upload','fill'].includes(action) &&
      (!uuid.test(options.instance??'') || !accountPattern.test(options['account-id']??'')))
    throw fail('INVALID_ARGUMENT','Pin --instance and the verified --account-id');
  if (['prepare','upload','fill'].includes(action)&&!/^[0-9a-f]{64}$/.test(options.digest??''))
    throw fail('INVALID_ARGUMENT','Specify --digest from the reviewed preflight');
  if (action==='submit'&&(!options.confirm?.startsWith(options.preparation+':') ||
      !/^[0-9a-f]{64}$/.test(options.confirm.slice(37))))
    throw fail('INVALID_ARGUMENT','Specify --confirm from the reviewed ready form');
}
const creatorUrl = 'https://creator.xiaohongshu.com/publish/publish';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const invalid = message => fail('INVALID_NOTE', message, {executed:false});

function writeAttempt(file, value) {
  const fd = fs.openSync(file,'wx',0o600);
  try {
    fs.writeFileSync(fd,JSON.stringify(value)+'\n');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

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
  return {summary,text,digest:hash(JSON.stringify({title,text,images:media.map(m=>m.sha256)})),media};
}

export async function noteCommand(action, options, deps={}) {
  if (action === 'preflight') {
    const note = readNote(options.manifest);
    return {ok:true,schemaVersion:1,state:'preflight-passed',manifestDigest:note.digest,
      note:note.summary,topicMode:'literal-text',submitted:false};
  }
  if (!options.container) throw fail('INVALID_ARGUMENT','Specify --container');
  const connection = (deps.discover??discover)(options);
  const fixture = options.fixture === true || options['fixture-port'] !== undefined;
  if (fixture && connection.channel !== 'dev')
    throw fail('XHS_FIXTURE_DEV_REQUIRED','Loopback fixtures require an explicitly selected Ecom Dev instance');
  const {container} = await (deps.inspect??inspectInConnection)(connection,options.container);
  if (container.platform !== 'xiaohongshu')
    throw fail('XHS_CONTAINER_REQUIRED','Select a Xiaohongshu account container');
  const preparation = options.preparation;
  const instance = {id:connection.endpoint.instanceId,channel:connection.channel};
  const receiptPath = preparation && uuid.test(preparation)
    ? path.join(connection.folder,preparation+'.xhs-attempt.json') : null;
  const resultPath = receiptPath?.replace('.xhs-attempt.json','.xhs-result.json');
  const receipt = () => {
    if (!receiptPath) return null;
    try {
      privatePath(receiptPath);
      const item = JSON.parse(fs.readFileSync(receiptPath,'utf8'));
      if (item.containerId !== container.id || item.fixture !== fixture ||
          item.preparationId !== preparation)
        throw fail('XHS_PREPARATION_NOT_FOUND','Attempt belongs to a different container or fixture');
      return item;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const claimPath = (accountId,digest) => path.join(connection.folder,
    hash(JSON.stringify([container.id,fixture,accountId,digest]))+'.xhs-claim.json');
  const alreadyClaimed = file => {
    try {
      privatePath(file);
      const previous = JSON.parse(fs.readFileSync(file,'utf8'));
      throw fail('XHS_SAME_NOTE_ATTEMPTED','This account already has a submission attempt for the same material',
        {executed:'unknown',recovery:'xhs note status --preparation '+previous.preparationId});
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  const prior = action === 'status' || action === 'submit' ? receipt() : null;
  const settled = () => {
    if (!prior) return null;
    try {
      privatePath(resultPath);
      const item = JSON.parse(fs.readFileSync(resultPath,'utf8'));
      if (item.preparationId === preparation && item.container?.id === container.id &&
          item.instance?.id === prior.instance.id && item.fixture === fixture) return item;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return null;
  };
  const recovered = () => settled() ?? ({
    ok:true,schemaVersion:1,state:'submission-unknown',instance:prior.instance,
    container:{id:container.id,name:container.name},preparationId:preparation,fixture,
    accountId:prior.accountId,manifestDigest:prior.manifestDigest,
    recovery:'Inspect the creator account’s note management page before considering another submission'
  });
  if (prior && action === 'submit')
    throw fail('XHS_SUBMISSION_ALREADY_ATTEMPTED','This preparation has a saved submission attempt; use xhs note status',{executed:'unknown'});
  if (prior && (prior.instance.id !== instance.id || settled())) return recovered();
  const settle = (result, attempt) => {
    if (!['published','not-submitted'].includes(result.state)) return;
    try { writeNew(resultPath,result); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (result.state === 'not-submitted') {
      const claim = claimPath(attempt.accountId,attempt.manifestDigest);
      try {
        privatePath(claim);
        if (JSON.parse(fs.readFileSync(claim,'utf8')).preparationId === preparation)
          fs.unlinkSync(claim);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  };
  if (connection.endpoint.xhsNoteProtocol !== 1)
    throw fail('BROWSER_UPGRADE_REQUIRED','Xiaohongshu note actions require Ecom with xhsNoteProtocol 1');
  if (['upload','fill'].includes(action) && connection.endpoint.xhsNoteReviewProtocol !== 1)
    throw fail('BROWSER_UPGRADE_REQUIRED','Split note preparation requires xhsNoteReviewProtocol 1');
  const call = deps.call??callMailbox;
  const native = async (verb, extra={}) => {
    const result = await call(connection,{method:'xhs.note.'+verb,containerId:container.id,
      ...(preparation?{preparationId:preparation}:{}),...extra},15000);
    const data = result.noteState;
    if (result.containerId !== container.id || result.fixture !== fixture ||
        !uuid.test(result.preparationId??'') ||
        (verb !== 'open' && result.preparationId !== (extra.preparationId??preparation)) ||
        !data || !states.has(data.state) ||
        (data.accountId !== undefined && !accountPattern.test(data.accountId)) ||
        (data.state === 'review-ready' && (!Number.isInteger(data.imageCount) ||
          data.imageCount < 1 || data.imageCount > 18 ||
          data.fields?.imageCount !== data.imageCount || data.fields?.imagesMatch !== true ||
          data.fields?.title !== 'matched' || data.fields?.body !== 'matched' ||
          data.fields?.publishEnabled !== true)) ||
        (data.state === 'published' && !accountPattern.test(data.noteId??'')) ||
        (data.state === 'form-ready' && (!data.confirmation ||
          data.confirmation !== result.preparationId+':'+data.manifestDigest ||
          !/^[0-9a-f]{64}$/.test(data.manifestDigest??'') ||
          !Number.isInteger(data.imageCount) || data.imageCount<1 || data.imageCount>18)))
      throw fail('PROTOCOL_MISMATCH','Native note response did not match the selected preparation',{executed:'unknown',operationId:result.operationId});
    return {ok:true,schemaVersion:1,...data,operationId:result.operationId,instance,
      container:{id:container.id,name:container.name},preparationId:result.preparationId,fixture,
      creatorUrl:fixture?null:creatorUrl,
      ...(data.state==='published'&&!fixture?{noteUrl:'https://www.xiaohongshu.com/explore/'+data.noteId}:{})};
  };
  const until = async (current, waiting, ms) => {
    const end = Date.now()+ms;
    while (waiting.includes(current.state) && Date.now()<end) {
      await (deps.pause??pause)(500);
      current = await native('status',{preparationId:current.preparationId});
    }
    return current;
  };
  if (action === 'open') {
    // Creator identity can arrive before the upload controls render.
    return until(await native('open',fixture?{fixturePort:Number(options['fixture-port'])}:{}),['opening','unsupported-form'],15000);
  }
  if (action === 'status') {
    try {
      const result = await native('status');
      if (prior) settle(result,prior);
      return prior && !['published','submitted','not-submitted','submission-checking','submission-unknown'].includes(result.state) ? recovered() : result;
    } catch (error) {
      if (prior && ['XHS_PREPARATION_NOT_FOUND','XHS_PREPARATION_EXPIRED','OPERATION_TIMEOUT','INSTANCE_CHANGED'].includes(error.code))
        return recovered();
      throw error;
    }
  }
  const state = await until(await native('status'),['opening'],9000);
  const accountId = options['account-id'];
  if (state.accountId !== accountId)
    throw fail('XHS_ACCOUNT_NOT_VERIFIED','The current creator account did not match --account-id: '+state.state);
  if (action === 'fill') {
    const note = readNote(options.manifest);
    if (note.digest !== options.digest || state.manifestDigest !== note.digest)
      throw fail('XHS_MANIFEST_CHANGED','The manifest does not match the uploaded images and text');
    if (!['images-ready','review-incomplete','review-ready'].includes(state.state))
      throw fail('XHS_FORM_UNAVAILABLE','Check image upload status before filling: '+state.state);
    return native('fill',{accountId,manifestDigest:note.digest});
  }
  if (action === 'prepare' || action === 'upload') {
    if (state.state !== 'account-ready')
      throw fail('XHS_FORM_UNAVAILABLE','Open a fresh creator preparation and inspect the account: '+state.state);
    const note = readNote(options.manifest,true);
    if (note.digest !== options.digest)
      throw fail('XHS_MANIFEST_CHANGED','Repeat preflight and review the current manifest digest');
    alreadyClaimed(claimPath(accountId,note.digest));
    const staged = [];
    try {
      privatePath(connection.folder,true);
      const media = note.media.map(({bytes,type,sha256})=>{
        const stage = crypto.randomUUID();
        const file = path.join(connection.folder,stage+'.xhs-media');
        const fd = fs.openSync(file,'wx',0o600);
        staged.push(file);
        try { fs.writeFileSync(fd,bytes); } finally { fs.closeSync(fd); }
        return {stage,type,sha256};
      });
      return await until(await native(action,{accountId,manifestDigest:note.digest,
        title:note.summary.title,text:note.text,media}),['uploading','opening'],95000);
    } finally {
      for (const file of staged) {
        try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
  }
  if (action === 'submit') {
    if (state.state !== 'form-ready' || state.confirmation !== options.confirm)
      throw fail('XHS_CONFIRMATION_MISMATCH','Use the confirmation returned by this ready preparation');
    const attempt = {preparationId:preparation,containerId:container.id,instance,fixture,accountId,manifestDigest:state.manifestDigest};
    const claim = claimPath(accountId,state.manifestDigest);
    alreadyClaimed(claim);
    try { writeAttempt(receiptPath,attempt); }
    catch (error) {
      if (error.code === 'EEXIST') throw fail('XHS_SUBMISSION_ALREADY_ATTEMPTED','Inspect xhs note status; the preparation already has a submission attempt',{executed:'unknown'});
      throw error;
    }
    try { writeAttempt(claim,attempt); }
    catch (error) {
      settle({...state,state:'not-submitted',reason:'local-attempt-claim-failed'},attempt);
      if (error.code === 'EEXIST') alreadyClaimed(claim);
      throw error;
    }
    let result;
    try {
      result = await until(await native('submit',{accountId,confirm:options.confirm}),['submission-checking','submission-unknown'],12000);
    } catch (error) {
      throw fail(error.code??'XHS_SUBMISSION_UNKNOWN','Submission outcome is uncertain; inspect xhs note status before any new attempt',
        {executed:'unknown',operationId:error.operationId,recovery:'xhs note status --preparation '+preparation});
    }
    settle(result,attempt);
    if (result.state === 'submission-checking') {
      return {...result,state:'submission-unknown',
        recovery:'Inspect xhs note status before considering another submission'};
    }
    return result;
  }
  throw fail('INVALID_ARGUMENT','Unknown note command');
}
