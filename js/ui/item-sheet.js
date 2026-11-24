// ui/item-sheet.js — หน้าต่างเพิ่ม/แก้รายการ (F04 ต่อวัน, F05 จำนวนเงิน / %)
// เป็น bottom sheet บน <dialog> แสดงค่าจริงเสมอ (ไม่สนสถานะซ่อนตัวเลข)

import { calcItem, switchAnchor, amountFromBp, bpOf, resolveBase } from '../calc.js';
import { countDays, monthShort, yearNumber, monthKey, parseMonthKey, weekdayShort, weekdayFull } from '../dates.js';
import { t as tr } from '../i18n.js';
import { formatMoney, formatPct, parseMoney, parsePercent, dailySummaryLines, pctOfSalaryText } from '../format.js';
import { html, mount, $, $$, bindMoneyInputs } from './dom.js';
import { icons } from './icons.js';

/** ฟิลด์ที่ถ้าเปลี่ยนต้องถามว่าแก้ template ด้วยไหม (offDays เป็นของเดือนนั้นเท่านั้น) */
export const TEMPLATE_KEYS = [
  'name', 'kind', 'method', 'anchor', 'amountSatang', 'bp', 'base', 'capSatang', 'rateSatang', 'weekdays',
];


const moneyText = (s) => (s == null ? '' : formatMoney(s, { sign: 'none' }));
const pctText = (bp) => (bp == null ? '' : formatPct(bp).replace('%', ''));

/**
 * @param opts {
 *   mode: "add"|"edit", item?, kind: "income"|"deduct",
 *   ctx: { year, month, key, salarySatang, grossSatang },
 *   weekStartsMonday: boolean,
 *   recurring: { on, endMonth },
 *   lastYear: number   // ปีสุดท้ายใน dropdown "ถึงเดือน" (ค.ศ.)
 * }
 * @returns Promise<null | { action: "delete" } | { action: "save", item, recurring: { on, endMonth } }>
 */
export function openItemSheet(opts) {
  const { ctx } = opts;
  const src = opts.item ?? {};
  const d = {
    name: src.name ?? '',
    kind: src.kind ?? opts.kind ?? 'deduct',
    method: src.method ?? 'fixed',
    anchor: src.anchor ?? 'amount',
    amountSatang: src.amountSatang ?? null,
    bp: src.bp ?? null,
    base: src.base ?? 'salary',
    capSatang: src.capSatang ?? null,
    rateSatang: src.rateSatang ?? null,
    weekdays: src.weekdays ? [...src.weekdays] : [1, 2, 3, 4, 5],
    offDays: src.offDays ?? 0,
  };
  const rec = { on: !!opts.recurring?.on, endMonth: opts.recurring?.endMonth ?? null };

  // ค่าที่แสดงในช่องบาท/% (ช่องที่ไม่ได้ยึดคำนวณจากช่องที่ยึด)
  const baseSatang = () => (resolveBase(d) === 'gross' ? ctx.grossSatang : ctx.salarySatang);

  /** คำนวณค่าของช่องที่ไม่ได้ยึดใหม่จากช่องที่ยึด (เฉพาะใน d ไม่แตะ DOM) เช่น หลังเปลี่ยนฐานหรือประเภท */
  function recomputeOther() {
    if (d.method !== 'fixed') return;
    if (d.anchor === 'percent' && d.bp != null) d.amountSatang = amountFromBp(baseSatang(), d.bp);
    if (d.anchor === 'amount' && d.amountSatang != null) d.bp = bpOf(d.amountSatang, baseSatang());
  }
  recomputeOther();

  const weekdayOrder = opts.weekStartsMonday ? [1, 2, 3, 4, 5, 6, 7] : [7, 1, 2, 3, 4, 5, 6];

  // ตัวเลือก "ถึงเดือน": เดือนนี้ … ธ.ค. ของ lastYear
  const endOptions = [];
  for (let k = ctx.key; parseMonthKey(k).year <= opts.lastYear;) {
    endOptions.push(k);
    const { year, month } = parseMonthKey(k);
    k = month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
  }
  if (rec.endMonth && !endOptions.includes(rec.endMonth)) endOptions.unshift(rec.endMonth);
  const endLabel = (k) => { const p = parseMonthKey(k); return `${monthShort(p.month)} ${yearNumber(p.year)}`; };

  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.setAttribute('aria-labelledby', 'sheet-title');
    let result = null;

    const seg = (name, label, value, current, tone = 'dark') => html`
      <button type="button" class="seg__btn seg__btn--${tone}" data-${name}="${value}" aria-pressed="${current === value}">${label}</button>`;

    mount(dlg, html`
      <form class="sheet__form" novalidate>
        <div class="sheet__grip" aria-hidden="true"></div>
        <h2 class="sheet__title" id="sheet-title"></h2>

        <label class="field">
          <span class="field__label">${tr('sheet.name')}</span>
          <input class="input" id="f-name" type="text" autocomplete="off" maxlength="60" value="${d.name}" aria-describedby="err-name">
          <span class="field__error" id="err-name" role="alert"></span>
        </label>

        <div class="seg" role="group" aria-label="${tr('sheet.kind')}" id="seg-kind"></div>

        <div class="field">
          <span class="field__label" id="lbl-method">${tr('sheet.method')}</span>
          <div class="seg" role="group" aria-labelledby="lbl-method" id="seg-method"></div>
        </div>

        <div id="method-body"></div>

        <div class="recur">
          <div class="recur__row">
            <span id="lbl-recur">${tr('sheet.recur')}</span>
            <button type="button" class="switch" role="switch" id="f-recur" aria-labelledby="lbl-recur" aria-checked="${rec.on}"></button>
          </div>
          <label class="recur__row recur__end" id="recur-end" ${rec.on ? '' : html`hidden`}>
            <span>${tr('sheet.until')}</span>
            <select class="select" id="f-end">
              <option value="">${tr('sheet.noEnd')}</option>
              ${endOptions.map((k) => html`<option value="${k}" ${k === rec.endMonth ? html`selected` : ''}>${endLabel(k)}</option>`)}
            </select>
          </label>
        </div>

        ${opts.mode === 'edit' ? html`
          <button type="button" class="link-danger" id="f-delete">${icons.trash()}<span>${tr('sheet.delete')}</span></button>` : ''}

        <div class="sheet__actions">
          <button type="button" class="btn btn--ghost" id="f-cancel">${tr('common.cancel')}</button>
          <button type="submit" class="btn btn--primary">${tr('common.save')}</button>
        </div>
      </form>`);

    const form = $('form', dlg);

    // ---------- วาดส่วนที่เปลี่ยนตามสถานะ ----------
    function refreshHead() {
      const inc = d.kind === 'income';
      $('#sheet-title', dlg).textContent = opts.mode === 'edit'
        ? tr(inc ? 'sheet.editIncome' : 'sheet.editDeduct')
        : tr(inc ? 'month.addIncome' : 'month.addDeduct');
      mount($('#seg-kind', dlg), html`
        ${seg('kind', tr('sheet.kindIncome'), 'income', d.kind, 'accent')}
        ${seg('kind', tr('sheet.kindDeduct'), 'deduct', d.kind, 'accent')}`);
      mount($('#seg-method', dlg), html`
        ${seg('method', tr('sheet.methodFixed'), 'fixed', d.method)}
        ${seg('method', tr('sheet.methodDaily'), 'daily', d.method)}`);
    }

    function fixedBody() {
      const isDeduct = d.kind === 'deduct';
      return html`
        <div class="pair">
          <label class="field">
            <span class="field__label">${tr('sheet.amount')}</span>
            <input class="input ${d.anchor === 'amount' ? 'is-anchor' : ''}" id="f-amount" type="text" inputmode="decimal" autocomplete="off" value="${moneyText(d.amountSatang)}">
          </label>
          <span class="pair__swap" aria-hidden="true">${icons.swap()}</span>
          <label class="field">
            <span class="field__label">${tr('sheet.pct')}</span>
            <input class="input ${d.anchor === 'percent' ? 'is-anchor' : ''}" id="f-pct" type="text" inputmode="decimal" autocomplete="off" value="${pctText(d.bp)}">
          </label>
        </div>
        <p class="field__hint">${tr('sheet.pairHint')}</p>
        <span class="field__error" id="err-value" role="alert"></span>

        ${isDeduct ? html`
          <div class="field">
            <span class="field__label" id="lbl-base">${tr('sheet.base')}</span>
            <div class="seg" role="group" aria-labelledby="lbl-base" id="seg-base">
              ${seg('base', tr('sheet.baseSalary'), 'salary', d.base)}
              ${seg('base', tr('sheet.baseGross'), 'gross', d.base)}
            </div>
          </div>` : ''}

        <div class="field">
          <span class="field__label" id="lbl-anchor">${tr('sheet.anchor')}</span>
          <div class="seg" role="group" aria-labelledby="lbl-anchor" id="seg-anchor">
            ${seg('anchor', tr('sheet.anchorAmount'), 'amount', d.anchor)}
            ${seg('anchor', tr('sheet.anchorPct'), 'percent', d.anchor)}
          </div>
        </div>

        <label class="field">
          <span class="field__label">${tr('sheet.cap')}</span>
          <input class="input" id="f-cap" type="text" inputmode="decimal" autocomplete="off"
                 placeholder="${tr('sheet.capPh')}" value="${moneyText(d.capSatang)}">
          <span class="field__error" id="err-cap" role="alert"></span>
        </label>
        <p class="calc-line" id="calc-line" aria-live="polite"></p>`;
    }

    function dailyBody() {
      return html`
        <label class="field">
          <span class="field__label">${tr('sheet.rate')}</span>
          <input class="input" id="f-rate" type="text" inputmode="decimal" autocomplete="off" value="${moneyText(d.rateSatang)}">
          <span class="field__error" id="err-value" role="alert"></span>
        </label>

        <div class="field">
          <span class="field__label" id="lbl-days">${tr('sheet.days')}</span>
          <div class="days" role="group" aria-labelledby="lbl-days">
            ${weekdayOrder.map((w) => html`
              <button type="button" class="day" data-day="${w}" aria-pressed="${d.weekdays.includes(w)}"
                      aria-label="${weekdayFull(w)}">${weekdayShort(w)}</button>`)}
          </div>
        </div>

        <div class="stepper-row">
          <span id="lbl-off">${tr('sheet.off')}</span>
          <div class="stepper" role="group" aria-labelledby="lbl-off">
            <button type="button" class="stepper__btn" id="off-dec" aria-label="${tr('sheet.offDec')}">${icons.minus()}</button>
            <output class="stepper__val" id="off-val" aria-live="polite">${d.offDays}</output>
            <button type="button" class="stepper__btn" id="off-inc" aria-label="${tr('sheet.offInc')}">${icons.plus()}</button>
          </div>
        </div>

        <div class="calc-box" id="calc-box" aria-live="polite"></div>`;
    }

    function refreshBody() {
      mount($('#method-body', dlg), d.method === 'daily' ? dailyBody() : fixedBody());
      refreshCalc();
    }

    function draftItem() {
      return { ...d, base: resolveBase(d) };
    }

    function refreshCalc() {
      if (d.method === 'daily') {
        const box = $('#calc-box', dlg);
        if (d.rateSatang == null || !d.weekdays.length) {
          box.textContent = d.weekdays.length ? tr('sheet.rateHint') : tr('sheet.daysRequired');
          return;
        }
        const r = calcItem(draftItem(), ctx);
        const [l1, l2, l3] = dailySummaryLines(draftItem(), r, ctx.year, ctx.month);
        mount(box, html`<p class="calc-box__sub">${l1}</p><p class="calc-box__main">${l2}</p><p class="calc-box__sub">${l3}</p>`);
        $('#off-val', dlg).textContent = d.offDays;
        $('#off-dec', dlg).disabled = d.offDays <= 0;
        $('#off-inc', dlg).disabled = d.offDays >= countDays(ctx.year, ctx.month, d.weekdays);
      } else {
        const line = $('#calc-line', dlg);
        const ready = d.anchor === 'amount' ? d.amountSatang != null : d.bp != null;
        if (!ready) { line.textContent = ''; return; }
        const r = calcItem(draftItem(), ctx);
        line.textContent = tr('sheet.calcLine', { amount: formatMoney(r.amountSatang), pct: pctOfSalaryText(r.pctOfSalaryBp) })
          + (r.capped ? tr('sheet.capped') : '');
      }
    }

    function setAnchorUi() {
      $('#f-amount', dlg)?.classList.toggle('is-anchor', d.anchor === 'amount');
      $('#f-pct', dlg)?.classList.toggle('is-anchor', d.anchor === 'percent');
      $$('#seg-anchor [data-anchor]', dlg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.anchor === d.anchor)));
    }

    /** คำนวณช่องที่ไม่ได้ยึดใหม่ แล้วอัปเดตช่องบนจอ (เช่น เปลี่ยนฐาน) */
    function syncOtherField() {
      recomputeOther();
      $('#f-amount', dlg).value = moneyText(d.amountSatang);
      $('#f-pct', dlg).value = pctText(d.bp);
    }

    refreshHead();
    refreshBody();

    // ---------- เหตุการณ์ ----------
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) { dlg.close(); return; } // แตะพื้นหลัง
      const t = e.target.closest('button');
      if (!t) return;

      if (t.dataset.kind) {
        d.kind = t.dataset.kind;
        if (d.kind === 'income') d.base = 'salary';
        recomputeOther(); // ฐานอาจเปลี่ยนจาก gross เป็น salary
        refreshHead(); refreshBody();
      } else if (t.dataset.method) {
        d.method = t.dataset.method;
        recomputeOther();
        refreshHead(); refreshBody();
      } else if (t.dataset.base) {
        d.base = t.dataset.base;
        $$('#seg-base [data-base]', dlg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.base === d.base)));
        syncOtherField(); refreshCalc();
      } else if (t.dataset.anchor) {
        const to = t.dataset.anchor;
        if (to === d.anchor) return;
        const ready = d.anchor === 'amount' ? d.amountSatang != null : d.bp != null;
        if (ready) {
          const s = switchAnchor({ ...draftItem(), method: 'fixed' }, to, ctx);
          if (s.anchor !== to) {
            // ฐานเป็น 0 คิด % ไม่ได้ → คงยึดตามบาทไว้ จำนวนเงินจะได้ไม่หาย
            $('#err-value', dlg).textContent = tr('sheet.pctNoBase');
            return;
          }
          $('#err-value', dlg).textContent = '';
          d.anchor = to;
          if (to === 'percent') { d.bp = s.bp; d.amountSatang = amountFromBp(baseSatang(), s.bp); }
          else { d.amountSatang = s.amountSatang; d.bp = bpOf(s.amountSatang, baseSatang()); }
          $('#f-amount', dlg).value = moneyText(d.amountSatang);
          $('#f-pct', dlg).value = pctText(d.bp);
        } else {
          d.anchor = to;
        }
        setAnchorUi(); refreshCalc();
      } else if (t.dataset.day) {
        const w = Number(t.dataset.day);
        d.weekdays = d.weekdays.includes(w) ? d.weekdays.filter((x) => x !== w) : [...d.weekdays, w].sort((a, b) => a - b);
        t.setAttribute('aria-pressed', String(d.weekdays.includes(w)));
        d.offDays = Math.min(d.offDays, countDays(ctx.year, ctx.month, d.weekdays));
        refreshCalc();
      } else if (t.id === 'off-dec') {
        d.offDays = Math.max(0, d.offDays - 1); refreshCalc();
      } else if (t.id === 'off-inc') {
        d.offDays += 1; refreshCalc();
      } else if (t.id === 'f-recur') {
        rec.on = !rec.on;
        t.setAttribute('aria-checked', String(rec.on));
        $('#recur-end', dlg).hidden = !rec.on;
      } else if (t.id === 'f-cancel') {
        dlg.close();
      } else if (t.id === 'f-delete') {
        result = { action: 'delete' };
        dlg.close();
      }
    });

    bindMoneyInputs(dlg, '#f-amount, #f-cap, #f-rate');
    dlg.addEventListener('input', (e) => {
      const t = e.target;
      const err = $('#err-value', dlg);
      if (t.id === 'f-name') {
        d.name = t.value;
        $('#err-name', dlg).textContent = '';
      } else if (t.id === 'f-amount') {
        const v = parseMoney(t.value);
        err.textContent = v == null && t.value.trim() ? tr('err.number') : '';
        d.anchor = 'amount';
        d.amountSatang = v;
        d.bp = v == null ? null : bpOf(v, baseSatang());
        $('#f-pct', dlg).value = pctText(d.bp);
        setAnchorUi(); refreshCalc();
      } else if (t.id === 'f-pct') {
        const v = parsePercent(t.value);
        err.textContent = v == null && t.value.trim() ? tr('sheet.pctInvalid') : '';
        d.anchor = 'percent';
        d.bp = v;
        d.amountSatang = v == null ? null : amountFromBp(baseSatang(), v);
        $('#f-amount', dlg).value = moneyText(d.amountSatang);
        setAnchorUi(); refreshCalc();
      } else if (t.id === 'f-cap') {
        const v = parseMoney(t.value);
        $('#err-cap', dlg).textContent = v == null && t.value.trim() ? tr('err.number') : '';
        d.capSatang = v;
        refreshCalc();
      } else if (t.id === 'f-rate') {
        const v = parseMoney(t.value);
        err.textContent = v == null && t.value.trim() ? tr('err.number') : '';
        d.rateSatang = v;
        refreshCalc();
      }
    });

    dlg.addEventListener('change', (e) => {
      if (e.target.id === 'f-end') rec.endMonth = e.target.value || null;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = validate();
      if (!item) return;
      result = { action: 'save', item, recurring: { ...rec } };
      dlg.close();
    });

    function validate() {
      let ok = true;
      const fail = (id, msg, focusId) => {
        $(id, dlg).textContent = msg;
        if (ok) $(focusId, dlg)?.focus();
        ok = false;
      };
      if (!d.name.trim()) fail('#err-name', tr('sheet.nameRequired'), '#f-name');

      if (d.method === 'daily') {
        if (d.rateSatang == null) fail('#err-value', tr('sheet.rateRequired'), '#f-rate');
        else if (!d.weekdays.length) fail('#err-value', tr('sheet.daysRequired'), '#f-rate');
        if (!ok) return null;
        return {
          name: d.name.trim(), kind: d.kind, method: 'daily',
          rateSatang: d.rateSatang, weekdays: [...d.weekdays], offDays: d.offDays,
        };
      }

      const capText = $('#f-cap', dlg).value.trim();
      if (d.anchor === 'amount' && d.amountSatang == null) fail('#err-value', tr('sheet.valueRequired'), '#f-amount');
      if (d.anchor === 'percent' && d.bp == null) fail('#err-value', tr('sheet.valueRequired'), '#f-pct');
      if (capText && d.capSatang == null) fail('#err-cap', tr('err.number'), '#f-cap');
      if (!ok) return null;
      return {
        name: d.name.trim(), kind: d.kind, method: 'fixed', anchor: d.anchor,
        amountSatang: d.anchor === 'amount' ? d.amountSatang : null,
        bp: d.anchor === 'percent' ? d.bp : null,
        base: resolveBase(d),
        capSatang: capText ? d.capSatang : null,
      };
    }

    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(result);
    });

    document.body.append(dlg);
    dlg.showModal();
    if (opts.mode === 'add') $('#f-name', dlg).focus();
  });
}
