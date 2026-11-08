// Copyright 2026 The Ecom Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/

#ifndef BRAVE_BROWSER_ECOM_XHS_NOTE_SCRIPT_H_
#define BRAVE_BROWSER_ECOM_XHS_NOTE_SCRIPT_H_

namespace ecom {

// This adapter runs in an isolated world of a pinned creator document. The
// caller supplies values only, never script, selectors, endpoints, or URLs.
inline constexpr char kXhsNoteScript[] = R"JS(((a) => {
  const reply = (state, fields = {}) => JSON.stringify({state, ...fields});
  if (location.origin !== a.origin) return reply('page-changed');
  const visible = e => !!e && !!e.getClientRects().length &&
    getComputedStyle(e).visibility !== 'hidden' &&
    !e.closest('[inert],[aria-hidden=true]');
  const all = sel => [...document.querySelectorAll(sel)].filter(visible);
  const one = values => values.length === 1 ? values[0] : null;
  const words = e => e.innerText.trim();
  const onEntry = location.pathname === '/publish/publish';
  const verification = () => all('[class*=captcha-modal],iframe[src*=captcha],[class*=verify-modal]').length > 0;
  const login = () => /^\/login(?:\/|$)/.test(location.pathname) ||
    all('[role=dialog], .login-modal, .login-container').some(dialog =>
      [...dialog.querySelectorAll('input')].some(input =>
        visible(input) && /手机号|验证码/.test(input.placeholder || '')) &&
      /扫码登录|手机号登录|验证码登录|登录小红书/.test(words(dialog)));
  const store = globalThis.ecomXhsNote ??= {};
  const note = store[a.id];
  const idValid = id => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id);
  const imageInput = () => one([...document.querySelectorAll(
      a.fixture ? 'input[type=file]' : '.upload-input[type=file][multiple]')]
    .filter(e => /image|\.png|\.jpe?g/i.test(e.accept) && visible(e.parentElement)));
  const imageTab = () => {
    const exact = all(a.fixture ? '[role=tab]' : '.creator-tab').filter(e => words(e) === '上传图文');
    if (exact.length) return exact[0];
    const leaves = all('div,span').filter(e => !e.children.length && words(e) === '上传图文');
    const controls = [...new Set(leaves.map(e =>
      e.closest('button,[role=tab],[class*=tab]') || e).filter(e => words(e) === '上传图文'))];
    return one(controls);
  };
  const editor = () => {
    const title = one(all('input').filter(e => /填写标题|输入标题|添加标题/.test(e.placeholder || '')));
    const body = one(all('[contenteditable=true]').filter(e =>
      e.matches('[role=textbox],.tiptap,.ProseMirror,.ql-editor,#post-textarea') || a.fixture));
    const publish = one(all('button').filter(e => words(e) === '发布'));
    return title && body && publish ? {title, body, publish} : null;
  };
  const account = store.identity;
  const fetchAccount = async () => {
    const endpoint = a.fixture ? '/fixture/account' : '/api/galaxy/user/info';
    try {
      const r = await fetch(endpoint, {credentials:'same-origin', cache:'no-store', redirect:'error',
        signal:AbortSignal.timeout(7000)});
      if (r.status === 401) return {status:'login-required'};
      if (!r.ok || !r.headers.get('content-type')?.includes('json')) return {status:'account-unverified'};
      const j = await r.json();
      if ((j?.success !== true && j?.code !== 0) || j?.success === false ||
          (j.code !== undefined && j.code !== 0)) return {status:'account-unverified'};
      const d = j.data?.userInfo ?? j.data?.user_info ?? j.data;
      const accountId = d?.userId ?? d?.user_id ?? d?.userid ?? d?.id;
      const nickname = d?.nickname ?? d?.nickName ?? d?.nick_name ?? d?.userName ?? d?.name;
      if (!idValid(accountId)) return {status:'account-unverified'};
      return {status:'verified', accountId, nickname:typeof nickname === 'string' ? nickname.slice(0,100) : ''};
    } catch { return {status:'account-unverified'}; }
  };
  const checkAccount = () => {
    if (store.identityPending) return;
    store.identityPending = true;
    fetchAccount().then(value => { store.identity = {...value, at:Date.now()}; })
      .finally(() => { store.identityPending = false; });
  };
  const readyAccount = () => {
    if (!account || Date.now()-account.at > 30000) {
      checkAccount();
      return false;
    }
    return account.status === 'verified';
  };
  const identity = () => ({accountId:account.accountId, nickname:account.nickname});
  const readBody = field => field.innerText.replace(/\r\n/g,'\n');
  const preview = () => {
    const selector = a.fixture ? '[data-xhs-image] img' :
      '.img-preview-area .flex-list .img-container img';
    return all(selector).filter(e => e.complete && e.naturalWidth > 0)
      .map(e => e.currentSrc || e.src);
  };
  const same = (x,y) => x.length === y.length && x.every((v,i)=>v === y[i]);
  const readyButton = e => !e.disabled && e.getAttribute('aria-disabled') !== 'true';
  const fill = (form, n) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(form.title,n.title);
    form.title.dispatchEvent(new Event('input',{bubbles:true}));
    form.title.dispatchEvent(new Event('change',{bubbles:true}));
    form.body.focus({preventScroll:true});
    const range = document.createRange();
    range.selectNodeContents(form.body);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    // Chromium insertText can introduce an extra paragraph separator. Build
    // escaped text nodes and explicit line breaks for exact body readback.
    const fragment = document.createElement('div');
    for (const [index,line] of n.text.split('\n').entries()) {
      if (index) fragment.append(document.createElement('br'));
      fragment.append(document.createTextNode(line));
    }
    if (n.text.endsWith('\n')) fragment.append(document.createElement('br'));
    document.execCommand('insertHTML',false,fragment.innerHTML);
    selection.removeAllRanges();
  };
  const current = n => {
    const form = editor();
    const images = preview();
    return form && images.length === n.count && form.title.value === n.title &&
      readBody(form.body) === n.text && readyButton(form.publish) &&
      !all('.img-preview-area [aria-busy=true], .img-preview-area .mask.uploading, .img-preview-area .mask.failed, .upload-progress,.upload-loading').length
      ? {form,images} : null;
  };
  const observed = () => {
    if (!note?.clicked) return null;
    if (a.fixture) {
      const result = one(all('[data-xhs-published]'));
      const id = result?.getAttribute('data-xhs-published');
      if (idValid(id) && result.getAttribute('data-xhs-title') === note.title)
        return {state:'published', noteId:id, evidence:'fixture-confirmation'};
    }
    const result = one(all('[role=alert],[role=status],.d-message,.publish-success')
      .filter(e => /^(发布成功|笔记发布成功|已提交审核)(?:[！!。\s]|$)/.test(words(e))));
    if (result) {
      note.acknowledged = true;
      const link = one([...result.querySelectorAll('a[href]')].filter(e =>
        e.origin === 'https://www.xiaohongshu.com' && /^\/explore\/[a-f0-9]{24}$/.test(e.pathname)));
      if (link && /发布成功/.test(words(result))) {
        note.published = {state:'published',noteId:link.pathname.split('/').at(-1),evidence:'creator-success-link'};
        return note.published;
      }
    }
    if (note.published) return note.published;
    if (note.acknowledged) return {state:'submitted',evidence:'creator-acknowledgement'};
    return {state:'submission-unknown',evidence:'publish-click-dispatched'};
  };

  try {
    if (a.action === 'status' && note?.clicked) {
      const result = observed();
      return reply(result.state,{accountId:note.account,...result});
    }
    if (a.action === 'status' && note?.submission) {
      return reply(note.submission.state,{accountId:note.account,...note.submission});
    }
    if (verification()) return reply('verification-required');
    if (login()) return reply('login-required');
    if (!onEntry) return reply('page-changed');
    if (!readyAccount()) {
      if (note?.phase === 'uploading') return reply('uploading');
      const fresh = account && Date.now()-account.at <= 30000;
      if (!fresh) return reply('opening');
      const composerVisible = !!(imageTab() || imageInput() || editor());
      return reply(account.status === 'login-required' && !composerVisible
        ? 'login-required' : 'account-unverified');
    }
    if (a.action === 'prepare') {
      if (note) return reply('form-changed');
      if (account.accountId !== a.account) return reply('account-mismatch');
      if (editor() || preview().length) return reply('form-not-empty');
      const next = {account:a.account,title:a.title,text:a.text,count:a.files.length,phase:'uploading',started:Date.now()};
      store[a.id] = next;
      const transfer = new DataTransfer();
      for (const f of a.files) {
        const bytes = Uint8Array.fromBase64(f.data);
        transfer.items.add(new File([bytes],f.name,{type:f.type}));
      }
      let uploadDispatched = false;
      let filled = false;
      const diagnostic = () => {
        const form = editor();
        return {uploaded:preview().length, composer:!!form, filled,
          titleMatches:form?.title.value === next.title,
          bodyMatches:!!form && readBody(form.body) === next.text};
      };
      const cleanup = () => {
        observer.disconnect();
        document.removeEventListener('load',run,true);
      };
      const run = () => {
        if (next.phase !== 'uploading') { cleanup(); return; }
        try {
          if (!onEntry || location.pathname !== '/publish/publish' || verification() || login() ||
              store.identity?.accountId !== next.account || Date.now()-next.started > 90000) {
            next.phase = filled ? 'form-readback-mismatch' : 'upload-incomplete';
            next.diagnostic = diagnostic();
            cleanup();
            return;
          }
          if (!uploadDispatched) {
            const input = imageInput();
            if (input) {
              if (input.files.length || (!input.multiple && next.count > 1)) {
                next.phase = 'form-not-empty';
                return;
              }
              input.files = transfer.files;
              uploadDispatched = true;
              input.dispatchEvent(new Event('change',{bubbles:true}));
            }
          }
          const form = editor();
          if (uploadDispatched && form && !filled && preview().length === next.count) {
            if (form.title.value || readBody(form.body).trim()) {
              next.phase = 'form-not-empty';
              return;
            }
            filled = true;
            fill(form,next);
          }
          if (filled) {
            const valid = current(next);
            if (valid) {
              next.previews = valid.images;
              next.phase = 'form-ready';
              cleanup();
              return;
            }
          }
          next.diagnostic = diagnostic();
        } catch { next.phase = 'upload-incomplete'; next.diagnostic = diagnostic(); cleanup(); }
      };
      const observer = new MutationObserver(run);
      observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});
      document.addEventListener('load',run,true);
      setTimeout(run,90000);
      if (!imageInput()) {
        const tab = imageTab();
        if (!tab) {
          next.phase = 'unsupported-form';
          cleanup();
          return reply(next.phase);
        }
        tab.click();
      }
      run();
      return reply(next.phase,identity());
    }
    if (a.action === 'submit') {
      if (!note || note.phase !== 'form-ready' || note.clicked || note.submission ||
          note.account !== a.account || account.accountId !== a.account)
        return reply('not-submitted',{reason:'form-or-account-changed'});
      note.submission = {state:'submission-checking'};
      fetchAccount().then(fresh => {
        if (fresh.status !== 'verified' || fresh.accountId !== note.account ||
            location.origin !== a.origin || location.pathname !== '/publish/publish' ||
            verification() || login()) {
          note.submission = {state:'not-submitted',reason:'account-or-page-changed'};
          return;
        }
        const form = current(note);
        if (!form || !same(form.images,note.previews)) {
          note.submission = {state:'not-submitted',reason:'form-changed'};
          return;
        }
        // Watch the platform acknowledgement even if it is a transient toast.
        const watcher = new MutationObserver(() => { observed(); });
        watcher.observe(document.documentElement,{childList:true,subtree:true,attributes:true});
        setTimeout(() => watcher.disconnect(),20000);
        note.clicked = true;
        form.form.publish.click();
      }).catch(() => {
        if (!note.clicked) note.submission = {state:'not-submitted',reason:'form-unavailable'};
      });
      return reply('submission-checking',identity());
    }
    if (!note) return reply(imageInput() || imageTab() ? 'account-ready' : 'unsupported-form',identity());
    if (note.account !== account.accountId) return reply('account-mismatch');
    if (note.phase === 'form-ready') {
      const form = current(note);
      if (!form || !same(form.images,note.previews)) return reply('form-changed');
      return reply('form-ready',{...identity(),imageCount:note.count});
    }
    const phase = note.phase === 'uploading' && Date.now()-note.started > 90000
      ? note.diagnostic?.filled ? 'form-readback-mismatch' : 'upload-incomplete' : note.phase;
    return reply(phase,{...identity(),...(note.diagnostic?{formEvidence:note.diagnostic}:{})});
  } catch {
    return reply(note?.clicked ? 'submission-unknown' : 'unsupported-form');
  }
}))JS";

}  // namespace ecom

#endif  // BRAVE_BROWSER_ECOM_XHS_NOTE_SCRIPT_H_
