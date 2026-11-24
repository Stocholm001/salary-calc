// ui/login.js — ล็อกอิน: กรอกชื่อ (F01) → PIN (F02)
//   ปุ่ม "เข้าสู่ระบบ" → ชื่อต้องมีบัญชีแล้ว → กรอก PIN (ผิดครบ 3 ครั้ง ล็อก 5 นาที)
//   ปุ่ม "สมัครใช้งาน" → ฟอร์มสมัคร (ชื่อผู้ใช้*, ชื่อ*, นามสกุล, วันเกิด) → ตั้ง PIN → ยืนยัน PIN
// มีสวิตช์ภาษา TH | EN มุมขวาบน เปลี่ยนแล้ววาดขั้นตอนเดิมใหม่

import {
  initFirebase, usernameExists, signIn, signUp, authErrorMessage, isWrongPin,
} from '../auth.js';
import {
  normalizeUsername, validateUsername, checkNewUsername, getRecentNames, addRecentName, removeRecentName,
} from '../username.js';
import { lockRemaining, recordFail, clearFails, formatWait } from '../lockout.js';
import { validateProfile, todayIso } from '../profile.js';
import { t } from '../i18n.js';
import { html, mount, $ } from './dom.js';
import { pig, icons } from './icons.js';
import { createPinPad } from './pinpad.js';
import { langToggle, bindLangToggle } from './lang-toggle.js';

/**
 * @param root
 * @param onSignedIn() เรียกเมื่อล็อกอินสำเร็จ
 */
export function renderLogin(root, { onSignedIn }) {
  let pad = null;
  let typedName = '';
  let leavePin = () => {}; // หยุดนับถอยหลังของหน้า PIN
  let regValues = null;    // ค่าที่กรอกในฟอร์มสมัคร (กลับมาแก้ได้จากหน้า PIN)
  let regProfile = null;   // ข้อมูลส่วนตัวที่ตรวจแล้ว ใช้ตอนสร้างบัญชี
  // ขั้นตอนปัจจุบัน ใช้วาดใหม่ตอนเปลี่ยนภาษา
  let redraw = () => showName();

  const header = () => html`<div class="login__top">${langToggle()}</div>`;

  const unbindLang = bindLangToggle(root, () => redraw());

  // ---------- F01: กรอกชื่อ ----------
  function showName(prefill = '', error = '') {
    leavePin();
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
          <button type="button" class="btn btn--ghost btn--block btn--rect" id="register">${t('login.register')}</button>
        </form>
        ${recent.length ? html`
          <section class="login__recent" aria-labelledby="recent-lbl">
            <h2 class="field__label" id="recent-lbl">${t('login.recent')}</h2>
            <div class="login__chips">
              ${recent.map((r) => html`
                <span class="name-chip">
                  <button type="button" class="name-chip__name" data-name="${r.name}">${r.name}</button>
                  <button type="button" class="name-chip__x" data-remove="${r.username}"
                          aria-label="${t('login.removeRecent', { name: r.name })}">${icons.close()}</button>
                </span>`)}
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
    $('#register', root).addEventListener('click', () => showRegister({ username: input.value }));
    root.querySelector('.login__chips')?.addEventListener('click', (e) => {
      const x = e.target.closest('[data-remove]');
      if (x) {
        removeRecentName(localStorage, x.dataset.remove);
        showName($('#name', root)?.value ?? '');
        return;
      }
      const b = e.target.closest('[data-name]');
      if (b) submitName(b.dataset.name);
    });
  }

  /** เข้าสู่ระบบ: ชื่อต้องมีบัญชีแล้ว */
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
    const label = btn.textContent;
    const buttons = [$('#go', root), $('#register', root)];
    buttons.forEach((b) => { b.disabled = true; });
    btn.textContent = t('login.checking');
    const restore = () => { buttons.forEach((b) => { b.disabled = false; }); btn.textContent = label; };
    try {
      await initFirebase();
      const exists = await usernameExists(username);
      if (!exists) { restore(); errEl.textContent = t('login.notFound'); return; }
      showPin(username, 'enter');
    } catch (e) {
      console.error(e);
      restore();
      errEl.textContent = authErrorMessage(e);
    }
  }

  // ---------- สมัครใช้งาน: ข้อมูลส่วนตัว ----------
  function showRegister(values = {}, errors = {}) {
    leavePin();
    pad?.destroy(); pad = null;
    const v = { username: '', firstName: '', lastName: '', birthDate: '', ...values };
    const read = () => ({
      username: $('#r-username', root).value,
      firstName: $('#r-first', root).value,
      lastName: $('#r-last', root).value,
      birthDate: $('#r-birth', root).value,
    });
    redraw = () => showRegister(read());
    const field = (id, key, label, input, hint = '', hintId = '') => html`
      <label class="field">
        <span class="field__label">${label}</span>
        ${input}
        ${hint ? html`<span class="field__hint" id="${hintId}">${hint}</span>` : ''}
        <span class="field__error" id="${id}-err" role="alert">${errors[key] ?? ''}</span>
      </label>`;
    mount(root, html`
      <main class="login">
        ${header()}
        <div class="login__hero login__hero--small">
          ${pig(96)}
          <h1 class="login__title">${t('prof.registerTitle')}</h1>
          <p class="login__sub">${t('prof.registerSub')}</p>
        </div>
        <form class="login__form" id="reg-form" novalidate>
          ${field('r-username', 'username', t('prof.username'), html`
            <input class="input" id="r-username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off"
                   spellcheck="false" maxlength="20" pattern="[A-Za-z][A-Za-z0-9_]{2,19}" lang="en"
                   value="${v.username}" aria-describedby="r-username-hint r-username-err" required>`, t('user.rules'), 'r-username-hint')}
          ${field('r-first', 'firstName', t('prof.first'), html`
            <input class="input" id="r-first" type="text" autocomplete="given-name" maxlength="40"
                   value="${v.firstName}" aria-describedby="r-first-err" required>`)}
          ${field('r-last', 'lastName', t('prof.last'), html`
            <input class="input" id="r-last" type="text" autocomplete="family-name" maxlength="40"
                   value="${v.lastName}" aria-describedby="r-last-err">`)}
          ${field('r-birth', 'birthDate', t('prof.birth'), html`
            <input class="input" id="r-birth" type="date" autocomplete="bday" min="1900-01-01" max="${todayIso()}"
                   value="${v.birthDate}" aria-describedby="r-birth-err">`)}
          <button type="submit" class="btn btn--primary btn--block btn--rect" id="r-next">${t('prof.next')}</button>
        </form>
        <button type="button" class="link-back" id="r-back">${t('prof.haveAccount')}</button>
      </main>`);

    const firstBad = ['username', 'firstName', 'lastName', 'birthDate'].find((k) => errors[k]);
    const idOf = { username: '#r-username', firstName: '#r-first', lastName: '#r-last', birthDate: '#r-birth' };
    for (const [k, sel] of Object.entries(idOf)) if (errors[k]) $(sel, root).setAttribute('aria-invalid', 'true');
    $(firstBad ? idOf[firstBad] : (v.username ? '#r-first' : '#r-username'), root).focus();

    $('#r-back', root).addEventListener('click', () => showName(read().username));
    // บอกทันทีระหว่างพิมพ์ ถ้าพิมพ์อักขระที่ใช้ไม่ได้ (เช่น ลืมเปลี่ยนแป้นเป็นภาษาอังกฤษ)
    $('#r-username', root).addEventListener('input', (e) => {
      const val = e.target.value;
      const { error } = checkNewUsername(val);
      const live = val && !/^[A-Za-z0-9_]*$/.test(val) ? error : '';
      $('#r-username-err', root).textContent = live;
      if (live) e.target.setAttribute('aria-invalid', 'true'); else e.target.removeAttribute('aria-invalid');
    });
    $('#reg-form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const vals = read();
      const { username, error: uErr } = checkNewUsername(vals.username);
      const errs = {};
      if (uErr) errs.username = uErr;
      const prof = validateProfile(vals);
      if (!prof.ok) Object.assign(errs, prof.errors);
      if (Object.keys(errs).length) { showRegister(vals, errs); return; }

      const btn = $('#r-next', root);
      btn.disabled = true;
      btn.textContent = t('login.checking');
      try {
        await initFirebase();
        if (await usernameExists(username)) { showRegister(vals, { username: t('login.taken') }); return; }
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = t('prof.next');
        $('#r-username-err', root).textContent = authErrorMessage(err);
        return;
      }
      regValues = vals;
      regProfile = prof.value;
      typedName = vals.username.trim();
      showPin(username, 'create');
    });
  }

  // ---------- F02: PIN ----------
  /** mode: "enter" | "create" | "confirm" */
  function showPin(username, mode, firstPin = '', message = '') {
    leavePin();
    pad?.destroy();
    redraw = () => showPin(username, mode, firstPin, '');
    const title = {
      enter: t('login.enter', { name: typedName }),
      create: t('login.create', { name: regProfile?.firstName || typedName }),
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
        <button type="button" class="link-back" id="back">${t(mode === 'enter' ? 'login.back' : 'login.backEdit')}</button>
        <p class="login__foot">${mode === 'enter' ? t('login.footEnter') : t('login.footCreate')}</p>
      </main>`);

    $('#back', root).addEventListener('click', () => (mode === 'enter' ? showName(typedName) : showRegister(regValues ?? {})));
    const msg = $('#pin-msg', root);

    // ใส่ PIN ผิดครบ 3 ครั้ง: ล็อกปุ่มแล้วนับถอยหลัง
    let lockTimer = null;
    const stopLock = () => { clearInterval(lockTimer); lockTimer = null; };
    const applyLock = () => {
      const tick = () => {
        const ms = lockRemaining(localStorage, username);
        if (!ms) { stopLock(); pad?.lock(false); msg.textContent = ''; return; }
        msg.textContent = t('login.locked', { time: formatWait(ms) });
      };
      pad.lock(true);
      stopLock();
      tick();
      lockTimer = setInterval(tick, 1000);
    };
    leavePin = stopLock;

    pad = createPinPad($('#pad', root), {
      async onComplete(pin) {
        msg.textContent = '';
        if (mode === 'enter' && lockRemaining(localStorage, username)) { applyLock(); return; }
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
          else await signUp(username, regProfile, pin);
          addRecentName(localStorage, typedName, username);
          clearFails(localStorage, username);
          stopLock();
          pad.destroy();
          unbindLang();
          await onSignedIn();
        } catch (e) {
          console.error(e);
          msg.textContent = authErrorMessage(e);
          if (mode === 'enter' && isWrongPin(e)) {
            const r = recordFail(localStorage, username);
            pad.shake();
            if (r.lockedMs) applyLock();
            else msg.textContent = t('login.wrongLeft', { n: r.left });
            return;
          }
          if (isWrongPin(e) || e?.code === 'auth/too-many-requests') pad.shake();
          else pad.reset();
          if (mode === 'confirm' && !isWrongPin(e)) {
            // สร้างบัญชีไม่สำเร็จ (เช่น เน็ตหลุด) ให้เริ่มตั้ง PIN ใหม่
            setTimeout(() => showPin(username, 'create', '', authErrorMessage(e)), 450);
          }
        }
      },
    });
    if (mode === 'enter' && lockRemaining(localStorage, username)) applyLock();
  }

  showName();
  return () => { leavePin(); pad?.destroy(); unbindLang(); };
}
