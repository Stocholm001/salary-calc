// ui/dom.js — helper เล็ก ๆ สำหรับสร้าง DOM

import { t } from '../i18n.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** escape ข้อความก่อนใส่ใน template string */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** tagged template: ค่าที่แทรกจะถูก escape ยกเว้นห่อด้วย raw() */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return { __html: out };
}

function render(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && '__html' in v) return v.__html;
  return esc(v);
}

export const raw = (s) => ({ __html: String(s) });

/** ใส่ html() ลงใน element */
export function mount(el, tpl) {
  el.innerHTML = render(tpl);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms) {
  let t = null;
  let pending = null;
  const wrapped = (...args) => {
    pending = args;
    clearTimeout(t);
    t = setTimeout(() => { t = null; const a = pending; pending = null; fn(...a); }, ms);
  };
  /** เรียกงานที่ค้างทันที (เช่น ก่อนเปลี่ยนเดือน) */
  wrapped.flush = () => {
    if (t == null) return undefined;
    clearTimeout(t); t = null;
    const a = pending; pending = null;
    return fn(...a);
  };
  return wrapped;
}

/**
 * กล่องให้เลือก (ใช้ <dialog>) คืน Promise ของ value ที่เลือก หรือ null ถ้ายกเลิก
 * options: [{ label, value, tone?: "primary"|"danger"|"plain" }]
 */
export function choose({ title, message = '', options }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'choice';
    mount(dlg, html`
      <form method="dialog" class="choice__body">
        <h2 class="choice__title">${title}</h2>
        ${message ? html`<p class="choice__msg">${message}</p>` : ''}
        <div class="choice__actions">
          ${options.map((o) => html`
            <button class="btn btn--${o.tone ?? 'plain'}" value="${o.value}">${o.label}</button>`)}
          <button class="btn btn--ghost" value="">${t('common.cancel')}</button>
        </div>
      </form>`);
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      const v = dlg.returnValue;
      dlg.remove();
      resolve(v === '' ? null : v);
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(''); });
    dlg.showModal();
  });
}

/** ข้อความแจ้งสั้น ๆ ด้านล่างจอ */
export function toast(text, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('toast--show'));
  setTimeout(() => { el.classList.remove('toast--show'); setTimeout(() => el.remove(), 300); }, ms);
}
