// ui/settings.js — ตั้งค่า (F07)
// ติดตั้งลงหน้าจอ / สำรองข้อมูล (CSV) เปิดใน Phase 4

import { html, mount, $, $$, toast, choose } from './dom.js';
import { createPinPad } from './pinpad.js';
import { langToggle, bindLangToggle } from './lang-toggle.js';
import { verifyPin, changePin, authErrorMessage, isWrongPin } from '../auth.js';
import { t } from '../i18n.js';

export async function renderSettings(root, app) {
  const name = app.profile?.displayName ?? '';
  const initial = [...name.trim()][0] ?? '?';
  const online = app.store.kind === 'firestore';

  const sw = (key, title, sub) => html`
    <div class="set-row">
      <span class="set-row__text">
        <span class="set-row__title" id="lbl-${key}">${title}</span>
        ${sub ? html`<span class="set-row__sub">${sub}</span>` : ''}
      </span>
      <button type="button" class="switch" role="switch" data-setting="${key}"
              aria-labelledby="lbl-${key}" aria-checked="${!!app.settings[key]}"></button>
    </div>`;

  const row = (id, title, sub, enabled, extraClass = '') => html`
    <button type="button" class="set-row set-row--btn ${extraClass}" id="${id}" ${enabled ? '' : html`disabled`}>
      <span class="set-row__text">
        <span class="set-row__title">${title}</span>
        ${sub ? html`<span class="set-row__sub">${sub}</span>` : ''}
      </span>
    </button>`;

  mount(root, html`
    <header class="topbar"><h1 class="topbar__title">${t('nav.settings')}</h1></header>

    <section class="profile">
      <span class="profile__avatar" aria-hidden="true">${initial}</span>
      <span>
        <span class="profile__name">${name}</span>
        <span class="profile__sub">${online ? t('set.loggedIn') : t('set.localMode')}</span>
      </span>
    </section>

    <section class="panel panel--list">
      <div class="set-row">
        <span class="set-row__text"><span class="set-row__title">${t('lang.label')}</span></span>
        <span id="lang-slot">${langToggle()}</span>
      </div>
      ${sw('hideOnOpen', t('set.hideOnOpen'), t('set.hideOnOpenSub'))}
      ${sw('weekStartsMonday', t('set.weekMonday'), '')}
      ${row('change-pin', t('set.changePin'), online ? t('set.changePinSub') : t('set.needFirebase'), online)}
      ${row('install', t('set.install'), t('set.installSub'), false)}
      ${row('backup', t('set.backup'), t('set.backupSub'), false)}
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
    try {
      await app.saveSettings({ [key]: v });
    } catch (err) {
      console.error(err);
      b.setAttribute('aria-checked', String(!v));
      toast(t('set.saveFailed'));
    }
  }));

  $('#change-pin', root).addEventListener('click', openChangePin);
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

  return null;
}

/** เปลี่ยน PIN: PIN เดิม (reauthenticate) → PIN ใหม่ → ยืนยัน PIN ใหม่ → updatePassword */
function openChangePin() {
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

  function step(stage, firstPin = '', message = '') {
    pad?.destroy();
    $('#cp-title', dlg).textContent = t({ old: 'cp.old', next: 'cp.next', confirm: 'cp.confirm' }[stage]);
    msg.textContent = message;
    pad = createPinPad($('#cp-pad', dlg), {
      async onComplete(pin) {
        msg.textContent = '';
        if (stage === 'old') {
          msg.textContent = t('cp.checking');
          try {
            await verifyPin(pin);
            step('next');
          } catch (e) {
            msg.textContent = authErrorMessage(e);
            if (isWrongPin(e) || e?.code === 'auth/too-many-requests') pad.shake(); else pad.reset();
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
  dlg.addEventListener('close', () => { pad?.destroy(); dlg.remove(); });
  dlg.showModal();
  step('old');
}
