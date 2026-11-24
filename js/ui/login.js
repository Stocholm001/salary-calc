// ui/login.js — ล็อกอิน: กรอกชื่อ (F01) → PIN (F02)
//   ชื่อมีบัญชีแล้ว → กรอก PIN
//   ชื่อใหม่      → ตั้ง PIN → ยืนยัน PIN (ไม่ตรงให้ตั้งใหม่)
// มีสวิตช์ภาษา TH | EN มุมขวาบน เปลี่ยนแล้ววาดขั้นตอนเดิมใหม่

import {
  initFirebase, usernameExists, signIn, signUp, authErrorMessage, isWrongPin,
} from '../auth.js';
import {
  normalizeUsername, validateUsername, getRecentNames, addRecentName,
} from '../username.js';
import { t } from '../i18n.js';
import { html, mount, $ } from './dom.js';
import { pig } from './icons.js';
import { createPinPad } from './pinpad.js';
import { langToggle, bindLangToggle } from './lang-toggle.js';

/**
 * @param root
 * @param onSignedIn() เรียกเมื่อล็อกอินสำเร็จ
 */
export function renderLogin(root, { onSignedIn }) {
  let pad = null;
  let typedName = '';
  // ขั้นตอนปัจจุบัน ใช้วาดใหม่ตอนเปลี่ยนภาษา
  let redraw = () => showName();

  const header = () => html`<div class="login__top">${langToggle()}</div>`;

  const unbindLang = bindLangToggle(root, () => redraw());

  // ---------- F01: กรอกชื่อ ----------
  function showName(prefill = '', error = '') {
    pad?.destroy(); pad = null;
    redraw = () => showName($('#name', root)?.value ?? prefill, '');
    const recent = getRecentNames(localStorage);
    mount(root, html`
      <main class="login">
        ${header()}
        <div class="login__hero">
          ${pig(150)}
          <h1 class="login__title">${t('app.name')}</h1>
          <p class="login__sub">${t('login.sub')}</p>
        </div>
        <form class="login__form" id="name-form" novalidate>
          <label class="field">
            <span class="field__label">${t('login.name')}</span>
            <input class="input" id="name" type="text" autocomplete="username" autocapitalize="none"
                   spellcheck="false" maxlength="40" value="${prefill}" aria-describedby="name-err" required>
            <span class="field__error" id="name-err" role="alert">${error}</span>
          </label>
          <button type="submit" class="btn btn--primary btn--block btn--rect" id="go">${t('login.go')}</button>
        </form>
        ${recent.length ? html`
          <section class="login__recent" aria-labelledby="recent-lbl">
            <h2 class="field__label" id="recent-lbl">${t('login.recent')}</h2>
            <div class="login__chips">
              ${recent.map((r) => html`<button type="button" class="name-chip" data-name="${r.name}">${r.name}</button>`)}
            </div>
          </section>` : ''}
        <p class="login__foot">${t('login.footName')}</p>
      </main>`);

    const input = $('#name', root);
    if (!prefill) input.focus();

    $('#name-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      submitName(input.value);
    });
    root.querySelector('.login__chips')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-name]');
      if (b) submitName(b.dataset.name);
    });
  }

  async function submitName(name) {
    const username = normalizeUsername(name);
    const err = validateUsername(username);
    const errEl = $('#name-err', root);
    if (err) {
      errEl.textContent = err;
      $('#name', root).setAttribute('aria-invalid', 'true');
      return;
    }
    typedName = name.trim();
    const btn = $('#go', root);
    btn.disabled = true;
    btn.textContent = t('login.checking');
    try {
      await initFirebase();
      const exists = await usernameExists(username);
      showPin(username, exists ? 'enter' : 'create');
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      btn.textContent = t('login.go');
      errEl.textContent = authErrorMessage(e);
    }
  }

  // ---------- F02: PIN ----------
  /** mode: "enter" | "create" | "confirm" */
  function showPin(username, mode, firstPin = '', message = '') {
    pad?.destroy();
    redraw = () => showPin(username, mode, firstPin, '');
    const title = {
      enter: t('login.enter', { name: typedName }),
      create: t('login.create', { name: typedName }),
      confirm: t('login.confirm'),
    }[mode];

    mount(root, html`
      <main class="login login--pin">
        ${header()}
        <div class="login__hero">
          ${pig(110)}
          <h1 class="login__pin-title">${title}</h1>
        </div>
        <div id="pad"></div>
        <p class="login__msg" id="pin-msg" role="alert">${message}</p>
        <button type="button" class="link-back" id="back">${t('login.back')}</button>
        <p class="login__foot">${mode === 'enter' ? t('login.footEnter') : t('login.footCreate')}</p>
      </main>`);

    $('#back', root).addEventListener('click', () => showName(typedName));
    const msg = $('#pin-msg', root);

    pad = createPinPad($('#pad', root), {
      async onComplete(pin) {
        msg.textContent = '';
        if (mode === 'create') {
          showPin(username, 'confirm', pin);
          return;
        }
        if (mode === 'confirm' && pin !== firstPin) {
          pad.shake();
          setTimeout(() => showPin(username, 'create', '', t('pin.mismatch')), 450);
          return;
        }
        msg.textContent = mode === 'enter' ? t('login.signingIn') : t('login.creating');
        try {
          if (mode === 'enter') await signIn(username, pin);
          else await signUp(username, typedName, pin);
          addRecentName(localStorage, typedName, username);
          pad.destroy();
          unbindLang();
          await onSignedIn();
        } catch (e) {
          console.error(e);
          msg.textContent = authErrorMessage(e);
          if (isWrongPin(e) || e?.code === 'auth/too-many-requests') pad.shake();
          else pad.reset();
          if (mode === 'confirm' && !isWrongPin(e)) {
            // สร้างบัญชีไม่สำเร็จ (เช่น เน็ตหลุด) ให้เริ่มตั้ง PIN ใหม่
            setTimeout(() => showPin(username, 'create', '', authErrorMessage(e)), 450);
          }
        }
      },
    });
  }

  showName();
  return () => { pad?.destroy(); unbindLang(); };
}
