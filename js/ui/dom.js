// ui/dom.js — helper เล็ก ๆ สำหรับสร้าง DOM

import { t } from '../i18n.js';
import { formatMoneyTyping } from '../format.js';

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
  if (v == null) return '';
  if (typeof v === 'boolean') return String(v); // aria-pressed="false" ต้องเป็นคำว่า false ไม่ใช่ค่าว่าง
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

/** ให้เบราว์เซอร์ดาวน์โหลดข้อความเป็นไฟล์ */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // iOS Safari ต้องให้ URL อยู่สักพักก่อนเริ่มดาวน์โหลด
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** ใส่ comma ในช่องเงินตามที่พิมพ์อยู่ โดยคงตำแหน่งเคอร์เซอร์ */
export function applyMoneyTyping(el) {
  if (el.readOnly) return;
  const caret = el.selectionStart ?? el.value.length;
  const r = formatMoneyTyping(el.value, caret);
  if (r.value === el.value) return;
  el.value = r.value;
  if (document.activeElement === el) el.setSelectionRange(r.caret, r.caret);
}

/**
 * ช่องกรอกเงินที่ตรงกับ selector ใน root: ใส่ comma ทันทีระหว่างพิมพ์
 * ใช้ capture เพื่อให้ทำก่อน listener อื่น ๆ และใช้ได้กับช่องที่วาดใหม่ทีหลัง
 */
export function bindMoneyInputs(root, selector) {
  root.addEventListener('input', (e) => {
    if (e.target.matches?.(selector)) applyMoneyTyping(e.target);
  }, true);
}
