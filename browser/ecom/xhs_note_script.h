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
  const login = () => location.pathname.startsWith('/login') ||
    all('input').some(e => /手机号|验证码/.test(e.placeholder || ''));
  const store = globalThis.ecomXhsNote ??= {};
  const note = store[a.id];
  const idValid = id => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id);
  const shell = () => a.fixture || all('.user-info .user_avatar').length === 1;
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
  const checkAccount = () => {
    if (store.identityPending) return;
    store.identityPending = true;
    const endpoint = a.fixture ? '/fixture/account' : '/api/galaxy/user/info';
    fetch(endpoint, {credentials:'same-origin', cache:'no-store', redirect:'error',
      signal:AbortSignal.timeout(7000)})
      .then(async r => {
        if (r.status === 401 || r.status === 403) return {status:'login-required'};
        if (!r.ok || !r.headers.get('content-type')?.includes('json')) return {status:'account-unverified'};
        const j = await r.json();
        if (j?.success !== true && j?.code !== 0) return {status:'account-unverified'};
        const d = j.data?.userInfo ?? j.data?.user_info ?? j.data;
        const accountId = d?.userId ?? d?.user_id ?? d?.userid ?? d?.id;
        const nickname = d?.nickname ?? d?.nickName ?? d?.name;
        if (!idValid(accountId)) return {status:'account-unverified'};
        return {status:'verified', accountId, nickname:typeof nickname === 'string' ? nickname.slice(0,100) : ''};
      }).then(value => { store.identity = {...value, at:Date.now()}; })
      .catch(() => { store.identity = {status:'account-unverified',at:Date.now()}; })
      .finally(() => { store.identityPending = false; });
  };
  const readyAccount = () => {
    if (!shell()) return false;
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
    document.execCommand('insertText',false,n.text);
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
      .filter(e => /^(发布成功|笔记发布成功|已提交审核)$/.test(words(e))));
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
    if (verification()) return reply('verification-required');
    if (login()) return reply('login-required');
    if (!onEntry) return reply('page-changed');
    if (!readyAccount()) {
      if (note?.phase === 'uploading') return reply('uploading');
      return reply(account?.status === 'login-required' ? 'login-required' :
        account?.status === 'account-unverified' ? 'account-unverified' : 'opening');
    }
    if (a.action === 'prepare') {
      if (note) return reply('form-changed');
      if (account.accountId !== a.account) return reply('account-mismatch');
      if (editor() || preview().length) return reply('form-not-empty');
      const next = {account:a.account,title:a.title,text:a.text,count:a.files.length,phase:'uploading'};
      store[a.id] = next;
      const transfer = new DataTransfer();
      for (const f of a.files) {
        const bytes = Uint8Array.fromBase64(f.data);
        transfer.items.add(new File([bytes],f.name,{type:f.type}));
      }
      let uploadDispatched = false;
      let filled = false;
      const started = Date.now();
      const diagnostic = () => ({uploaded:preview().length, composer:!!editor(), filled});
      const run = () => {
        try {
          if (!onEntry || location.pathname !== '/publish/publish' || verification() || login() ||
              !shell() || store.identity?.accountId !== next.account || Date.now()-started > 90000) {
            next.phase = 'upload-incomplete';
            next.diagnostic = diagnostic();
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
              return;
            }
          }
          setTimeout(run,250);
        } catch { next.phase = 'upload-incomplete'; next.diagnostic = diagnostic(); }
      };
      if (!imageInput()) {
        const tab = imageTab();
        if (!tab) {
          next.phase = 'unsupported-form';
          return reply(next.phase);
        }
        tab.click();
      }
      run();
      return reply(next.phase,identity());
    }
    if (a.action === 'submit') {
      if (!note || note.phase !== 'form-ready' || note.clicked ||
          note.account !== a.account || account.accountId !== a.account)
        return reply('form-changed');
      const form = current(note);
      if (!form || !same(form.images,note.previews)) return reply('form-changed');
      note.clicked = true;
      // Watch the platform acknowledgement even if it is a transient toast.
      const watcher = new MutationObserver(() => { observed(); });
      watcher.observe(document.documentElement,{childList:true,subtree:true,attributes:true});
      setTimeout(() => watcher.disconnect(),20000);
      form.form.publish.click();
      return reply('submission-unknown',{...identity(),evidence:'publish-click-dispatched'});
    }
    if (!note) return reply(imageInput() || imageTab() ? 'account-ready' : 'unsupported-form',identity());
    if (note.account !== account.accountId) return reply('account-mismatch');
    if (note.phase === 'form-ready') {
      const form = current(note);
      if (!form || !same(form.images,note.previews)) return reply('form-changed');
      return reply('form-ready',{...identity(),imageCount:note.count});
    }
    return reply(note.phase,{...identity(),...(note.diagnostic?{formEvidence:note.diagnostic}:{})});
  } catch {
    return reply(note?.clicked ? 'submission-unknown' : 'unsupported-form');
  }
}))JS";

}  // namespace ecom

#endif  // BRAVE_BROWSER_ECOM_XHS_NOTE_SCRIPT_H_
