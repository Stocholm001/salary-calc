// ui/month.js — หน้า "เดือนนี้" (F03)
// รูปตา (app.hidden) ซ่อนเฉพาะเงินเดือน, ยอดสุทธิ และรายรับรวม ยอดของแต่ละรายการแสดงตามปกติ

import { calcMonth, normalizeItem } from '../calc.js';
import {
  monthName, monthKey, parseMonthKey, monthLabel, yearLabel, yearOptions, addMonths,
} from '../dates.js';
import { t } from '../i18n.js';
import {
  formatMoney, formatPct, maskMoney, parseMoney, describeItem, methodBadge,
  pctOfSalaryText, negativeNetMessage, HIDDEN,
} from '../format.js';
import {
  loadMonth, findPrevSaved, copyFromPrevious, enableRecurring, updateRecurring,
  stopRecurring, getTemplate, firstDataYear, newId,
} from '../months.js';
import { html, mount, $, debounce, choose, toast, bindMoneyInputs } from './dom.js';
import { icons, pig } from './icons.js';
import { avatarInner } from './avatar.js';
import { greetName } from '../profile.js';
import { openItemSheet, TEMPLATE_KEYS } from './item-sheet.js';

let lastTab = 'deduct';

export async function renderMonth(root, app, key) {
  const { store } = app;
  const { year, month } = parseMonthKey(key);
  const m = await loadMonth(store, key);
  let tab = lastTab;
  let prev = await findPrevSaved(store, key);
  const years = yearOptions(app.current.year, await firstDataYear(store));
  if (!years.includes(year)) years.push(year), years.sort((a, b) => a - b);

  // ---------- บันทึก ----------
  const saveNow = async () => {
    let res;
    try {
      res = await store.saveMonth(key, { salarySatang: m.salarySatang, items: m.items });
    } catch (err) {
      console.error(err);
      showStatus(t('month.saveFailed'));
      return;
    }
    m.saved = true;
    // queued = ออฟไลน์: บันทึกในเครื่องแล้ว Firestore จะส่งขึ้นเองเมื่อออนไลน์
    showStatus(t(res?.queued ? 'month.savedOffline' : 'month.saved'), { autoHide: true });
    refreshCard();
  };
  const scheduleSave = debounce(saveNow, 600);
  const touch = () => { showStatus(t('month.saving')); scheduleSave(); };

  let statusTimer = null;
  function showStatus(text, { autoHide = false } = {}) {
    const el = $('#save-status', root);
    if (!el) return;
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(statusTimer);
    if (autoHide) statusTimer = setTimeout(() => el.classList.remove('is-visible'), 1800);
  }

  const money = (satang, opts) => maskMoney(formatMoney(satang, opts), app.hidden);

  // ---------- โครงหน้า ----------
  mount(root, html`
    <header class="topbar">
      <a class="hello" href="#/settings" title="${t('prof.toSettings')}">
        <span class="hello__avatar" aria-hidden="true">${avatarInner(app.profile)}</span>
        <h1 class="hello__text">${t('prof.hello', { name: greetName(app.profile) })}</h1>
      </a>
      <button type="button" class="icon-btn" id="eye"></button>
    </header>

    <section id="card" aria-live="polite"></section>

    <div class="row2">
      <label class="field">
        <span class="field__label">${t('month.month')}</span>
        <select class="select" id="sel-month">
          ${Array.from({ length: 12 }, (_, i) => html`<option value="${i + 1}" ${i + 1 === month ? html`selected` : ''}>${monthName(i + 1)}</option>`)}
        </select>
      </label>
      <label class="field">
        <span class="field__label">${t('month.year')}</span>
        <select class="select" id="sel-year">
          ${years.map((y) => html`<option value="${y}" ${y === year ? html`selected` : ''}>${yearLabel(y)}</option>`)}
        </select>
      </label>
    </div>

    <button type="button" class="dashed-btn" id="copy-prev"></button>

    <label class="field">
      <span class="field__label">${t('month.salary')}</span>
      <input class="input input--big" id="salary" type="text" inputmode="decimal" autocomplete="off"
             aria-describedby="salary-err">
      <span class="field__error" id="salary-err" role="alert"></span>
    </label>

    <div class="tabs" role="tablist" aria-label="${t('month.tabs')}" id="tabs"></div>
    <div id="list" role="tabpanel"></div>
    <button type="button" class="add-btn" id="add"></button>

    <p class="hint">${t('month.hint')}</p>
    <p class="save-status" id="save-status" aria-live="polite"></p>
  `);

  const salaryEl = $('#salary', root);
  bindMoneyInputs(root, '#salary');

  // ---------- ส่วนที่วาดใหม่ได้ ----------
  function refreshEye() {
    const eye = $('#eye', root);
    mount(eye, app.hidden ? icons.eyeOff() : icons.eye());
    eye.setAttribute('aria-label', app.hidden ? t('month.show') : t('month.hide'));
    eye.setAttribute('aria-pressed', String(app.hidden));
  }

  function refreshSalary() {
    if (app.hidden) {
      salaryEl.value = HIDDEN;
      salaryEl.readOnly = true;
      salaryEl.title = t('month.salaryHidden');
    } else {
      salaryEl.readOnly = false;
      salaryEl.title = '';
      if (document.activeElement !== salaryEl) salaryEl.value = formatMoney(m.salarySatang, { sign: 'none' });
    }
  }

  function refreshCard() {
    const r = calcMonth({ year, month, salarySatang: m.salarySatang, items: m.items });
    const neg = r.isNegative;
    const pct = r.deductPctBp;
    const barPct = pct == null ? 0 : Math.min(100, pct / 100);
    const net = app.hidden ? HIDDEN : `${neg ? '−' : ''}฿${formatMoney(Math.abs(r.netSatang), { sign: 'none' })}`;
    mount($('#card', root), html`
      <div class="pig-card ${neg ? 'pig-card--warn' : ''}">
        <div class="pig-card__top">
          ${pig(112)}
          <div class="pig-card__text">
            <p class="pig-card__eyebrow">${neg ? t('month.negLabel') : t('month.netLabel')} · ${monthLabel(year, month)}
              ${m.saved ? '' : html`<span class="chip chip--draft">${t('month.draft')}</span>`}</p>
            <p class="pig-card__net">${net}</p>
            <p class="pig-card__sub">${t('month.grossDeduct', { gross: money(r.grossSatang), deduct: formatMoney(r.deductSatang) })}</p>
          </div>
        </div>
        <div class="bar" aria-hidden="true"><span class="bar__fill" style="width:${barPct}%"></span></div>
        <p class="pig-card__pct">${t('month.deductPct', { pct: formatPct(pct) })}</p>
        ${neg ? html`<p class="pig-card__warn">${app.hidden ? t('month.negHidden') : negativeNetMessage(r.netSatang)}</p>` : ''}
      </div>`);
    return r;
  }

  function refreshCopy() {
    const btn = $('#copy-prev', root);
    if (!prev) {
      btn.disabled = true;
      mount(btn, html`${icons.copy()}<span>${t('month.copyNone')}</span>`);
      return;
    }
    const p = parseMonthKey(prev.key);
    const name = p.year === year ? monthName(p.month) : monthLabel(p.year, p.month);
    btn.disabled = false;
    mount(btn, html`${icons.copy()}<span>${t('month.copy', { name })}</span>`);
  }

  function refreshListAndTabs() {
    const r = refreshCard();
    const tabBtn = (kind, label, amount, sign) => html`
      <button type="button" role="tab" class="tabs__btn" data-tab="${kind}"
              aria-selected="${tab === kind}" id="tab-${kind}">
        ${label} ${sign}${formatMoney(amount, { sign: 'none' })}
      </button>`;
    mount($('#tabs', root), html`
      ${tabBtn('income', t('kind.income'), r.incomeSatang, '+')}
      ${tabBtn('deduct', t('kind.deduct'), r.deductSatang, '−')}`);
    $('#list', root).setAttribute('aria-labelledby', `tab-${tab}`);

    const rows = r.items.filter(({ item }) => item.kind === tab);
    mount($('#list', root), rows.length ? html`
      <ul class="items">
        ${rows.map(({ item, result }) => html`
          <li class="item">
            <button type="button" class="item-card" data-id="${item.id}">
              <span class="item-card__main">
                <span class="item-card__name">${item.name}</span>
                <span class="item-card__chips">
                  ${item.method === 'daily' || item.anchor === 'percent'
                    ? html`<span class="chip chip--${item.method === 'daily' ? 'daily' : 'pct'}">${methodBadge(item)}</span>` : ''}
                  ${item.templateId
                    ? html`<span class="chip chip--recur">${t('badge.recur')}</span>`
                    : html`<span class="chip chip--once">${t('badge.once')}</span>`}
                </span>
                <span class="item-card__desc">${describeItem(item, result)}</span>
              </span>
              <span class="item-card__side">
                <span class="item-card__amt item-card__amt--${item.kind === 'deduct' && item.paid ? 'paid' : item.kind}">
                  ${formatMoney(item.kind === 'income' ? result.amountSatang : -result.amountSatang, { sign: 'always' })}
                </span>
                <span class="item-card__pct">${pctOfSalaryText(result.pctOfSalaryBp)}</span>
              </span>
            </button>
            ${item.kind === 'deduct' ? html`
              <div class="item__foot">
                <button type="button" class="paid-btn ${item.paid ? 'is-paid' : ''}" data-paid="${item.id}"
                        aria-pressed="${String(!!item.paid)}" aria-label="${t('paid.label', { name: item.name })}: ${t(item.paid ? 'paid.yes' : 'paid.no')}">
                  ${item.paid ? icons.check() : icons.circle()}<span>${t(item.paid ? 'paid.yes' : 'paid.no')}</span>
                </button>
              </div>` : ''}
          </li>`)}
      </ul>` : html`<p class="empty">${t(tab === 'income' ? 'month.emptyIncome' : 'month.emptyDeduct')}</p>`);

    mount($('#add', root), html`${icons.plus()}<span>${t(tab === 'income' ? 'month.addIncome' : 'month.addDeduct')}</span>`);
  }

  function refreshAll() {
    refreshEye();
    refreshSalary();
    refreshCopy();
    refreshListAndTabs();
  }

  refreshAll();

  // ---------- เหตุการณ์ ----------
  $('#eye', root).addEventListener('click', () => {
    app.setHidden(!app.hidden);
    refreshAll();
  });

  const go = () => {
    const mm = Number($('#sel-month', root).value);
    const yy = Number($('#sel-year', root).value);
    app.navigate(`#/month/${monthKey(yy, mm)}`);
  };
  $('#sel-month', root).addEventListener('change', go);
  $('#sel-year', root).addEventListener('change', go);

  salaryEl.addEventListener('input', () => {
    if (app.hidden) return;
    const v = parseMoney(salaryEl.value);
    const err = $('#salary-err', root);
    if (v == null) {
      err.textContent = salaryEl.value.trim() === '' ? t('month.salaryRequired') : t('err.number');
      salaryEl.setAttribute('aria-invalid', 'true');
      return;
    }
    err.textContent = '';
    salaryEl.removeAttribute('aria-invalid');
    m.salarySatang = v;
    refreshListAndTabs();
    touch();
  });
  salaryEl.addEventListener('blur', refreshSalary);

  $('#tabs', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = lastTab = b.dataset.tab;
    refreshListAndTabs();
  });
  $('#tabs', root).addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    tab = lastTab = tab === 'income' ? 'deduct' : 'income';
    refreshListAndTabs();
    $(`#tab-${tab}`, root).focus();
  });

  $('#copy-prev', root).addEventListener('click', async () => {
    if (!prev) return;
    let mode = 'replace';
    if (m.items.length) {
      mode = await choose({
        title: t('copy.title'),
        message: t('copy.msg', { month: monthLabel(parseMonthKey(prev.key).year, parseMonthKey(prev.key).month) }),
        options: [
          { label: t('copy.replace'), value: 'replace', tone: 'primary' },
          { label: t('copy.append'), value: 'append', tone: 'plain' },
        ],
      });
      if (!mode) return;
    }
    const next = copyFromPrevious(m, prev.doc, mode);
    m.salarySatang = next.salarySatang;
    m.items = next.items;
    refreshSalary();
    refreshListAndTabs();
    await saveNow();
    toast(t('copy.done'));
  });

  $('#add', root).addEventListener('click', () => openSheet(null));
  $('#list', root).addEventListener('click', (e) => {
    const p = e.target.closest('[data-paid]');
    if (p) {
      const item = m.items.find((it) => it.id === p.dataset.paid);
      if (!item) return;
      const idx = m.items.indexOf(item);
      const next = { ...item };
      if (item.paid) delete next.paid; else next.paid = true;
      m.items[idx] = next;
      refreshListAndTabs();
      $(`[data-paid="${next.id}"]`, root)?.focus();
      touch();
      return;
    }
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const item = m.items.find((it) => it.id === b.dataset.id);
    if (item) openSheet(item);
  });

  // ---------- หน้าต่างเพิ่ม/แก้รายการ ----------
  async function openSheet(orig) {
    const others = m.items.filter((it) => it !== orig);
    const grossSatang = calcMonth({ year, month, salarySatang: m.salarySatang, items: others }).grossSatang;
    const tpl = orig?.templateId ? await getTemplate(store, orig.templateId) : null;

    const res = await openItemSheet({
      mode: orig ? 'edit' : 'add',
      item: orig,
      kind: tab,
      ctx: { year, month, key, salarySatang: m.salarySatang, grossSatang },
      weekStartsMonday: app.settings.weekStartsMonday,
      recurring: { on: !!orig?.templateId, endMonth: tpl?.endMonth ?? null },
      lastYear: app.current.year + 10,
    });
    if (!res) return;

    let changed;
    try {
      await scheduleSave.flush();
      changed = res.action === 'delete'
        ? await handleDelete(orig)
        : await handleSave(orig, res.item, res.recurring, tpl);
    } catch (err) {
      console.error(err);
      toast(t('save.failed'));
      return;
    }
    // ผู้ใช้กดยกเลิกในกล่องถาม → ไม่มีอะไรเปลี่ยน ไม่บันทึก (เดือนร่างจะได้ไม่ถูกสร้างเป็นเอกสาร)
    if (!changed) return;
    prev = await findPrevSaved(store, key);
    if (res.action !== 'delete' && res.item.kind !== tab) { tab = lastTab = res.item.kind; }
    refreshAll();
    await saveNow();
  }

  /** @returns true ถ้ามีการเปลี่ยน, false ถ้าผู้ใช้ยกเลิกกลางทาง */
  async function handleSave(orig, edited, recurring, tpl) {
    let item = normalizeItem({ ...edited, id: orig?.id ?? newId('itm'), templateId: orig?.templateId ?? null });
    if (orig?.paid && item.kind === 'deduct') item.paid = true;

    if (!orig) {
      if (recurring.on) item = await enableRecurring(store, key, item, recurring.endMonth);
      m.items.push(item);
      return true;
    }

    const idx = m.items.indexOf(orig);
    if (orig.templateId) {
      if (!recurring.on) {
        const ok = await choose({
          title: t('recurOff.title'),
          message: t('recurOff.msg'),
          options: [{ label: t('recurOff.title'), value: 'stop', tone: 'primary' }],
        });
        if (!ok) return false;
        await stopRecurring(store, orig.templateId, key);
        item = { ...item, templateId: null };
      } else {
        const tplChanged = TEMPLATE_KEYS.some((f) => JSON.stringify(orig[f] ?? null) !== JSON.stringify(item[f] ?? null))
          || (tpl?.endMonth ?? null) !== (recurring.endMonth ?? null);
        if (tplChanged) {
          const scope = await choose({
            title: t('recurEdit.title'),
            message: t('recurEdit.msg'),
            options: [
              { label: t('recurEdit.this'), value: 'this', tone: 'plain' },
              { label: t('recurEdit.future'), value: 'future', tone: 'primary' },
            ],
          });
          if (!scope) return false;
          if (scope === 'future') item = await updateRecurring(store, key, item, recurring.endMonth);
        }
      }
    } else if (recurring.on) {
      item = await enableRecurring(store, key, item, recurring.endMonth);
    }
    m.items[idx] = item;
    return true;
  }

  /** @returns true ถ้าลบแล้ว, false ถ้าผู้ใช้ยกเลิก */
  async function handleDelete(orig) {
    if (orig.templateId) {
      const scope = await choose({
        title: t('del.title', { name: orig.name }),
        message: t('del.msg'),
        options: [
          { label: t('del.this'), value: 'this', tone: 'plain' },
          { label: t('del.stop'), value: 'stop', tone: 'danger' },
        ],
      });
      if (!scope) return false;
      if (scope === 'stop') await stopRecurring(store, orig.templateId, addMonths(key, -1));
    }
    m.items = m.items.filter((it) => it !== orig);
    return true;
  }

  // ---------- cleanup ----------
  return async () => { await scheduleSave.flush(); };
}
