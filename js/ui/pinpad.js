// ui/pinpad.js — จุด 6 จุด + แป้นตัวเลข 3×4 (1–9, ว่าง, 0, ลบ) ใช้ทั้งหน้าล็อกอินและเปลี่ยน PIN

import { html, mount, $ } from './dom.js';
import { t } from '../i18n.js';

const BACKSPACE = `<svg class="icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m11 9 6 6M17 9l-6 6"/></svg>`;

/**
 * @param root      element ที่จะวาดแป้นลงไป
 * @param onComplete(pin) เรียกเมื่อครบ 6 หลัก (async ได้ ระหว่างรอแป้นจะถูกล็อก)
 */
export function createPinPad(root, { onComplete, length = 6 }) {
  let pin = '';
  let busy = false;
  let destroyed = false;

  mount(root, html`
    <div class="pin">
      <div class="pin__dots" aria-hidden="true">
        ${Array.from({ length }, () => html`<span class="pin__dot"></span>`)}
      </div>
      <p class="visually-hidden" aria-live="polite" id="pin-count"></p>
      <div class="pin__pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => html`<button type="button" class="pin__key" data-key="${n}">${n}</button>`)}
        <span></span>
        <button type="button" class="pin__key" data-key="0">0</button>
        <button type="button" class="pin__key pin__key--del" data-key="del" aria-label="${t('pin.del')}">${{ __html: BACKSPACE }}</button>
      </div>
    </div>`);

  const dots = [...root.querySelectorAll('.pin__dot')];
  const dotsWrap = $('.pin__dots', root);

  function draw() {
    dots.forEach((d, i) => d.classList.toggle('is-on', i < pin.length));
    $('#pin-count', root).textContent = t('pin.count', { n: pin.length, total: length });
  }

  let locked = false;
  async function press(key) {
    if (busy || locked) return;
    if (key === 'del') pin = pin.slice(0, -1);
    else if (pin.length < length) pin += key;
    draw();
    if (pin.length === length) {
      const value = pin;
      setBusy(true);
      try { await onComplete(value); } finally { if (!destroyed) setBusy(false); }
    }
  }

  function setBusy(v) {
    busy = v;
    root.querySelectorAll('.pin__key').forEach((b) => { b.disabled = busy || locked; });
  }

  const onClick = (e) => {
    const b = e.target.closest('[data-key]');
    if (b) press(b.dataset.key);
  };
  root.addEventListener('click', onClick);

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
  };
  document.addEventListener('keydown', onKey);

  draw();

  return {
    reset() { pin = ''; draw(); },
    /** จุดสั่นแล้วล้างค่า */
    shake() {
      dotsWrap.classList.remove('is-shake');
      void dotsWrap.offsetWidth; // restart animation
      dotsWrap.classList.add('is-shake');
      if (navigator.vibrate) navigator.vibrate(120);
      setTimeout(() => { pin = ''; draw(); }, 350);
    },
    setBusy,
    /** ล็อกปุ่มทั้งหมด (ใส่ PIN ผิดหลายครั้ง) */
    lock(v) {
      locked = v;
      if (v) { pin = ''; draw(); }
      setBusy(busy);
    },
    destroy() {
      destroyed = true;
      busy = true;
      root.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    },
  };
}
