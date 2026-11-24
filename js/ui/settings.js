// ui/settings.js — ตั้งค่า (F07)

import { html, mount, $, $$, toast, choose, downloadText } from './dom.js';
import { createPinPad } from './pinpad.js';
import { langToggle, bindLangToggle } from './lang-toggle.js';
import { verifyPin, changePin, authErrorMessage, isWrongPin } from '../auth.js';
import { lockRemaining, recordFail, clearFails, formatWait } from '../lockout.js';
import { t } from '../i18n.js';
import { icons } from './icons.js';
import { avatarInner } from './avatar.js';
import { fullName, formatBirthDate, validateProfile, todayIso } from '../profile.js';
import { openImage, IMAGE_ACCEPT, DecoderLoadError } from './image-load.js';
import { backupCsv, backupFilename } from '../csv.js';
import { installState, promptInstall, onInstallChange } from '../pwa.js';

export async function renderSettings(root, app) {
  const online = app.store.kind === 'firestore';
  const p = app.profile ?? {};

  const sw = (key, title, sub) => html`
    <div class="set-row">
      <span class="set-row__text">
        <span class="set-row__title" id="lbl-${key}">${title}</span>
        ${sub ? html`<span class="set-row__sub">${sub}</span>` : ''}
      </span>
      <button type="button" class="switch" role="switch" data-setting="${key}"
              aria-labelledby="lbl-${key}" aria-checked="${String(!!app.settings[key])}"></button>
    </div>`;

  const row = (id, title, sub, enabled, extraClass = '') => html`
    <button type="button" class="set-row set-row--btn ${extraClass}" id="${id}" ${enabled ? '' : html`disabled`}>
      <span class="set-row__text">
        <span class="set-row__title">${title}</span>
        <span class="set-row__sub" id="${id}-sub" ${sub ? '' : html`hidden`}>${sub}</span>
      </span>
    </button>`;

  mount(root, html`
    <header class="topbar"><h1 class="topbar__title">${t('nav.settings')}</h1></header>

    <section class="profile">
      <button type="button" class="profile__avatar" id="avatar" aria-label="${t('photo.change')}">
        <span id="avatar-img">${avatarInner(p)}</span>
        <span class="profile__cam" aria-hidden="true">${icons.camera()}</span>
      </button>
      <input type="file" accept="${IMAGE_ACCEPT}" id="photo-file" hidden>
      <span>
        <span class="profile__name">${fullName(p)}</span>
        ${online && p.username ? html`<span class="profile__sub">@${p.username}</span>` : ''}
        ${p.birthDate ? html`<span class="profile__sub">${t('prof.birthLine', { date: formatBirthDate(p.birthDate) })}</span>` : ''}
        <span class="profile__sub">${online ? t('set.loggedIn') : t('set.localMode')}</span>
        <button type="button" class="profile__remove" id="photo-remove" ${app.profile?.photo ? '' : html`hidden`}>${t('photo.remove')}</button>
      </span>
    </section>

    <section class="panel panel--list">
      ${row('edit-profile', t('prof.edit'), '', true)}
      <div class="set-row">
        <span class="set-row__text"><span class="set-row__title">${t('lang.label')}</span></span>
        <span id="lang-slot">${langToggle()}</span>
      </div>
      ${sw('hideOnOpen', t('set.hideOnOpen'), t('set.hideOnOpenSub'))}
      ${sw('weekStartsMonday', t('set.weekMonday'), '')}
      ${row('change-pin', t('set.changePin'), online ? t('set.changePinSub') : t('set.needFirebase'), online)}
      ${row('install', t('set.install'), t('set.installSub'), false)}
      ${row('backup', t('set.backup'), t('set.backupSub'), true)}
    </section>

    <section class="panel panel--list">
      ${row('logout', t('set.logout'), online ? '' : t('set.needFirebase'), online, 'set-row--danger')}
    </section>

    <p class="hint">${t('set.forgot')}</p>
  `);

  bindLangToggle($('#lang-slot', root), () => app.rerender());

  $$('[data-setting]', root).forEach((b) => b.addEventListener('click', async () => {
    const key = b.dataset.setting;
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    if (key === 'hideOnOpen') app.setHidden(v); // มีผลทันที ไม่ต้องรอเปิดแอปใหม่
    try {
      await app.saveSettings({ [key]: v });
    } catch (err) {
      console.error(err);
      b.setAttribute('aria-checked', String(!v));
      toast(t('set.saveFailed'));
    }
  }));

  // รูปโปรไฟล์: กดวงกลม → เลือกรูป (ถ้ามีรูปอยู่แล้วให้เลือกได้ว่าจะเปลี่ยนหรือลบ)
  const fileEl = $('#photo-file', root);
  const setPhoto = async (dataUrl) => {
    await app.store.saveProfilePhoto(dataUrl);
    app.profile = { ...app.profile, photo: dataUrl };
    mount($('#avatar-img', root), avatarInner(app.profile));
    $('#photo-remove', root).hidden = !dataUrl;
  };
  // ต้องเปิดตัวเลือกไฟล์ใน handler ของการกดโดยตรง (Safari ไม่ยอมเปิดถ้ามี await คั่น)
  $('#avatar', root).addEventListener('click', () => {
    fileEl.value = '';
    fileEl.click();
  });
  $('#photo-remove', root).addEventListener('click', async () => {
    const ok = await choose({
      title: t('photo.removeTitle'),
      options: [{ label: t('photo.remove'), value: 'yes', tone: 'danger' }],
    });
    if (!ok) return;
    try { await setPhoto(null); toast(t('photo.removed')); } catch (err) { console.error(err); toast(t('set.saveFailed')); }
  });
  fileEl.addEventListener('change', async () => {
    const file = fileEl.files?.[0];
    if (!file) return;
    let dataUrl;
    const avatar = $('#avatar', root);
    avatar.setAttribute('aria-busy', 'true');
    toast(t('photo.opening'), 1500);
    try {
      dataUrl = await squarePhoto(file, 256);
    } catch (err) {
      console.error(err);
      toast(t(err instanceof DecoderLoadError ? 'photo.needNet' : 'photo.bad'), 3500);
      return;
    } finally {
      avatar.removeAttribute('aria-busy');
    }
    try { await setPhoto(dataUrl); toast(t('photo.saved')); } catch (err) { console.error(err); toast(t('set.saveFailed')); }
  });

  // ติดตั้งลงหน้าจอ: สถานะเปลี่ยนได้ทีหลัง (beforeinstallprompt มาช้า / ติดตั้งเสร็จ)
  const installBtn = $('#install', root);
  const installSub = $('#install-sub', root);
  const syncInstall = () => {
    const st = installState();
    installBtn.disabled = st === 'installed' || st === 'unsupported';
    installSub.textContent = {
      installed: t('set.installed'),
      unsupported: t('set.installNo'),
    }[st] ?? t('set.installSub');
  };
  syncInstall();
  const offInstall = onInstallChange(syncInstall);
  installBtn.addEventListener('click', async () => {
    const st = installState();
    if (st === 'ios') {
      await choose({ title: t('ios.title'), message: t('ios.msg'), options: [{ label: t('ios.ok'), value: 'ok', tone: 'primary' }] });
    } else if (st === 'prompt') {
      if (await promptInstall()) toast(t('set.installDone'));
      syncInstall();
    }
  });

  const backupBtn = $('#backup', root);
  backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    $('#backup-sub', root).textContent = t('set.backupWorking');
    try {
      const keys = await app.store.listMonthKeys();
      if (!keys.length) { toast(t('set.backupEmpty')); return; }
      const months = [];
      for (const key of keys) months.push({ key, doc: await app.store.getMonth(key) });
      const file = backupFilename();
      downloadText(file, backupCsv(months));
      toast(t('year.csvDone', { file }));
    } catch (err) {
      console.error(err);
      toast(t('csv.failed'));
    } finally {
      backupBtn.disabled = false;
      $('#backup-sub', root).textContent = t('set.backupSub');
    }
  });

  $('#edit-profile', root).addEventListener('click', async () => {
    const value = await openProfileSheet(app.profile ?? {}, (v) => app.store.saveProfile(v));
    if (!value) return;
    app.profile = { ...app.profile, ...value };
    toast(t('prof.saved'));
    app.rerender();
  });

  $('#change-pin', root).addEventListener('click', () => openChangePin(app.profile?.username ?? ''));
  $('#logout', root).addEventListener('click', async () => {
    const ok = await choose({
      title: t('set.logoutTitle'),
      message: t('set.logoutMsg'),
      options: [{ label: t('set.logout'), value: 'yes', tone: 'danger' }],
    });
    if (!ok) return;
    $('#logout', root).disabled = true;
    await app.logout();
  });

  // keepAlive = แค่ซ่อนแท็บ หน้ายังอยู่ ไม่ต้องเลิกฟัง
  return (opts) => { if (!opts?.keepAlive) offInstall(); };
}

/**
 * หน้าต่างแก้ข้อมูลส่วนตัว คืนค่าที่บันทึกแล้ว หรือ null ถ้ายกเลิก
 * @param save async (value) => void
 */
function openProfileSheet(profile, save) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.setAttribute('aria-labelledby', 'pf-title');
    let result = null;
    const field = (id, label, input) => html`
      <label class="field">
        <span class="field__label">${label}</span>
        ${input}
        <span class="field__error" id="${id}-err" role="alert"></span>
      </label>`;
    mount(dlg, html`
      <form class="sheet__form" id="pf-form" novalidate>
        <div class="sheet__grip" aria-hidden="true"></div>
        <h2 class="sheet__title" id="pf-title">${t('prof.editTitle')}</h2>
        ${field('pf-first', t('prof.first'), html`<input class="input" id="pf-first" type="text" autocomplete="given-name"
              maxlength="40" value="${profile.firstName || profile.displayName || ''}" aria-describedby="pf-first-err" required>`)}
        ${field('pf-last', t('prof.last'), html`<input class="input" id="pf-last" type="text" autocomplete="family-name"
              maxlength="40" value="${profile.lastName ?? ''}" aria-describedby="pf-last-err">`)}
        ${field('pf-birth', t('prof.birth'), html`<input class="input" id="pf-birth" type="date" autocomplete="bday"
              min="1900-01-01" max="${todayIso()}" value="${profile.birthDate ?? ''}" aria-describedby="pf-birth-err">`)}
        <div class="sheet__actions">
          <button type="button" class="btn btn--ghost" id="pf-cancel">${t('common.cancel')}</button>
          <button type="submit" class="btn btn--primary" id="pf-save">${t('common.save')}</button>
        </div>
      </form>`);
    document.body.append(dlg);

    const ids = { firstName: '#pf-first', lastName: '#pf-last', birthDate: '#pf-birth' };
    $('#pf-cancel', dlg).addEventListener('click', () => dlg.close());
    $('#pf-form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = validateProfile({
        firstName: $('#pf-first', dlg).value, lastName: $('#pf-last', dlg).value, birthDate: $('#pf-birth', dlg).value,
      });
      for (const [k, sel] of Object.entries(ids)) {
        $(`${sel}-err`, dlg).textContent = r.ok ? '' : (r.errors[k] ?? '');
        if (!r.ok && r.errors[k]) $(sel, dlg).setAttribute('aria-invalid', 'true'); else $(sel, dlg).removeAttribute('aria-invalid');
      }
      if (!r.ok) { $(ids[Object.keys(r.errors)[0]], dlg).focus(); return; }
      const btn = $('#pf-save', dlg);
      btn.disabled = true;
      try {
        await save(r.value);
        result = r.value;
        dlg.close();
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        toast(t('set.saveFailed'));
      }
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
  });
}

/** ครอปรูปเป็นสี่เหลี่ยมจัตุรัสตรงกลาง ย่อเป็น size px แล้วคืน data URL (JPEG) */
async function squarePhoto(file, size) {
  const img = await openImage(file);
  try {
    const side = Math.min(img.width, img.height);
    if (!side) throw new Error('empty image');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFC2D4';
    ctx.fillRect(0, 0, size, size); // รูปพื้นโปร่ง (PNG) จะได้พื้นชมพูแทนสีดำ
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.source, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    img.close();
  }
}

/** เปลี่ยน PIN: PIN เดิม (reauthenticate) → PIN ใหม่ → ยืนยัน PIN ใหม่ → updatePassword */
function openChangePin(username) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.setAttribute('aria-labelledby', 'cp-title');
  mount(dlg, html`
    <div class="sheet__form">
      <div class="sheet__grip" aria-hidden="true"></div>
      <h2 class="sheet__title" id="cp-title"></h2>
      <div id="cp-pad"></div>
      <p class="login__msg" id="cp-msg" role="alert"></p>
      <button type="button" class="btn btn--ghost" id="cp-cancel">${t('common.cancel')}</button>
    </div>`);
  document.body.append(dlg);

  let pad = null;
  const msg = $('#cp-msg', dlg);
  let lockTimer = null;
  const showLock = () => {
    pad.lock(true);
    clearInterval(lockTimer);
    const tick = () => {
      const ms = lockRemaining(localStorage, username);
      if (!ms) { clearInterval(lockTimer); pad.lock(false); msg.textContent = ''; return; }
      msg.textContent = t('login.locked', { time: formatWait(ms) });
    };
    tick();
    lockTimer = setInterval(tick, 1000);
  };

  function step(stage, firstPin = '', message = '') {
    pad?.destroy();
    $('#cp-title', dlg).textContent = t({ old: 'cp.old', next: 'cp.next', confirm: 'cp.confirm' }[stage]);
    msg.textContent = message;
    pad = createPinPad($('#cp-pad', dlg), {
      async onComplete(pin) {
        msg.textContent = '';
        if (stage === 'old') {
          if (lockRemaining(localStorage, username)) { showLock(); return; }
          msg.textContent = t('cp.checking');
          try {
            await verifyPin(pin);
            clearFails(localStorage, username);
            step('next');
          } catch (e) {
            msg.textContent = authErrorMessage(e);
            if (isWrongPin(e)) {
              const r = recordFail(localStorage, username);
              pad.shake();
              if (r.lockedMs) showLock(); else msg.textContent = t('login.wrongLeft', { n: r.left });
            } else if (e?.code === 'auth/too-many-requests') pad.shake(); else pad.reset();
          }
        } else if (stage === 'next') {
          step('confirm', pin);
        } else if (pin !== firstPin) {
          pad.shake();
          setTimeout(() => step('next', '', t('pin.mismatch')), 450);
        } else {
          msg.textContent = t('cp.saving');
          try {
            await changePin(pin);
            dlg.close();
            toast(t('cp.done'));
          } catch (e) {
            console.error(e);
            step(e?.code === 'auth/requires-recent-login' ? 'old' : 'next', '', authErrorMessage(e));
          }
        }
      },
    });
  }

  $('#cp-cancel', dlg).addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { clearInterval(lockTimer); pad?.destroy(); dlg.remove(); });
  dlg.showModal();
  step('old');
  if (lockRemaining(localStorage, username)) showLock();
}
