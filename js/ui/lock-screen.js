// ui/lock-screen.js — หน้าใส่ PIN เพื่อปลดล็อกแอป (เมื่อไม่ได้ใช้งานเกิน 5 นาที)
// ใช้ <dialog> แบบ modal จึงอยู่บนสุดเสมอ (ทับหน้าต่างอื่นที่เปิดค้าง) และส่วนอื่นของแอปกดไม่ได้
// ตรวจ PIN ด้วย Firebase (reauthenticate) ไม่เก็บ PIN ในเครื่อง → ปลดล็อกต้องต่ออินเทอร์เน็ต

import { markActive, shouldLock, LOCK_AFTER_MS } from '../applock.js';
import { verifyPin, authErrorMessage, isWrongPin } from '../auth.js';
import { lockRemaining, recordFail, clearFails, formatWait } from '../lockout.js';
import { t } from '../i18n.js';
import { html, mount, $ } from './dom.js';
import { pig } from './icons.js';
import { createPinPad } from './pinpad.js';

const TOUCH_THROTTLE_MS = 15 * 1000; // บันทึกเวลาใช้งานล่าสุดไม่ถี่เกินนี้
const CHECK_EVERY_MS = 30 * 1000;    // ตรวจว่าครบเวลาล็อกหรือยัง ระหว่างเปิดแอปค้างไว้

/**
 * @param opts {
 *   uid, username, name,          // name = ชื่อที่ใช้ทักทายบนหน้าล็อก
 *   storage = localStorage,
 *   onLogout: async () => void,
 * }
 */
export function createAppLock({ uid, username, name, storage = globalThis.localStorage, onLogout }) {
  let locked = false;
  let unlockWaiters = [];
  let lastWrite = 0;

  const touch = () => {
    if (locked) return;
    const now = Date.now();
    if (now - lastWrite < TOUCH_THROTTLE_MS) return;
    lastWrite = now;
    markActive(storage, uid, now);
  };

  const check = () => {
    if (!locked && document.visibilityState === 'visible' && shouldLock(storage, uid)) lock();
  };

  /** แสดงหน้าล็อก คืน Promise ที่ resolve เมื่อปลดล็อกสำเร็จ */
  function lock() {
    const done = new Promise((resolve) => unlockWaiters.push(resolve));
    if (locked) return done;
    locked = true;
    showDialog();
    return done;
  }

  function unlocked() {
    locked = false;
    lastWrite = Date.now();
    markActive(storage, uid, lastWrite);
    const waiters = unlockWaiters;
    unlockWaiters = [];
    waiters.forEach((r) => r());
  }

  function showDialog() {
    const dlg = document.createElement('dialog');
    dlg.className = 'applock';
    dlg.setAttribute('aria-labelledby', 'applock-title');
    mount(dlg, html`
      <main class="login login--pin">
        <div class="login__hero">
          ${pig(110)}
          <h1 class="login__pin-title" id="applock-title">${t('lock.title', { name })}</h1>
          <p class="login__sub">${t('lock.sub', { min: LOCK_AFTER_MS / 60000 })}</p>
        </div>
        <div id="applock-pad"></div>
        <p class="login__msg" id="applock-msg" role="alert"></p>
        <button type="button" class="link-back" id="applock-logout">${t('lock.logout')}</button>
      </main>`);
    document.body.append(dlg);

    const msg = $('#applock-msg', dlg);
    let lockTimer = null;
    let pad = null;
    const stopLockTimer = () => { clearInterval(lockTimer); lockTimer = null; };
    // ใส่ PIN ผิดครบ 3 ครั้ง: ล็อกปุ่มแล้วนับถอยหลัง (ใช้ตัวนับเดียวกับหน้าล็อกอิน)
    const applyLockout = () => {
      const tick = () => {
        const ms = lockRemaining(storage, username);
        if (!ms) { stopLockTimer(); pad.lock(false); msg.textContent = ''; return; }
        msg.textContent = t('login.locked', { time: formatWait(ms) });
      };
      pad.lock(true);
      stopLockTimer();
      tick();
      lockTimer = setInterval(tick, 1000);
    };

    pad = createPinPad($('#applock-pad', dlg), {
      async onComplete(pin) {
        if (lockRemaining(storage, username)) { applyLockout(); return; }
        msg.textContent = t('cp.checking');
        try {
          await verifyPin(pin);
        } catch (e) {
          console.error(e);
          msg.textContent = authErrorMessage(e);
          if (isWrongPin(e)) {
            const r = recordFail(storage, username);
            pad.shake();
            if (r.lockedMs) applyLockout(); else msg.textContent = t('login.wrongLeft', { n: r.left });
          } else if (e?.code === 'auth/too-many-requests') pad.shake();
          else pad.reset();
          return;
        }
        clearFails(storage, username);
        close();
      },
    });

    const close = () => {
      stopLockTimer();
      pad.destroy();
      dlg.remove();
      unlocked();
    };

    // กด Esc ต้องปิดหน้าล็อกไม่ได้
    dlg.addEventListener('cancel', (e) => e.preventDefault());
    $('#applock-logout', dlg).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      await onLogout();
    });

    dlg.showModal();
    if (lockRemaining(storage, username)) applyLockout();
  }

  /** เริ่มจับเวลา: แตะ/พิมพ์ = ยังใช้งาน, ซ่อนแอป = บันทึกเวลา, กลับมา = ตรวจว่าต้องล็อกไหม */
  function start() {
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
      document.addEventListener(ev, touch, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (!locked) markActive(storage, uid);
      } else {
        check();
      }
    });
    setInterval(check, CHECK_EVERY_MS);
  }

  return {
    start,
    lock,
    /** ต้องล็อกตอนเปิดแอปหรือไม่ */
    needsLock: () => shouldLock(storage, uid),
    /** เพิ่งล็อกอินด้วย PIN: นับเวลาใหม่ */
    markActive: () => { lastWrite = Date.now(); markActive(storage, uid, lastWrite); },
  };
}
