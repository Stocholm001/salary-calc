// ui/year.js — สรุปทั้งปี (F06)

import { monthName, monthShort, yearLabel, yearNumber, yearOptions } from '../dates.js';
import { formatMoney, maskMoney, formatPct, HIDDEN } from '../format.js';
import { loadYear, firstDataYear } from '../months.js';
import { t } from '../i18n.js';
import { html, mount, $ } from './dom.js';
import { icons } from './icons.js';

export async function renderYear(root, app, year) {
  const s = await loadYear(app.store, year);
  const years = yearOptions(app.current.year, await firstDataYear(app.store));
  if (!years.includes(year)) years.push(year), years.sort((a, b) => a - b);

  const money = (v, opts) => maskMoney(formatMoney(v, opts), app.hidden);
  const maxGross = Math.max(1, ...s.months.filter((m) => m.saved).map((m) => m.grossSatang));

  mount(root, html`
    <header class="topbar">
      <h1 class="topbar__title">${t('nav.year')}</h1>
      <label class="topbar__select">
        <span class="visually-hidden">${t('month.year')}</span>
        <select class="select" id="sel-year">
          ${years.map((y) => html`<option value="${y}" ${y === year ? html`selected` : ''}>${yearLabel(y)}</option>`)}
        </select>
      </label>
    </header>

    <section class="pig-card pig-card--plain">
      <p class="pig-card__eyebrow">${t('year.netTotal', { n: s.savedCount })}</p>
      <p class="pig-card__net">${app.hidden ? HIDDEN : `${s.netSatang < 0 ? '−' : ''}฿${formatMoney(Math.abs(s.netSatang), { sign: 'none' })}`}</p>
    </section>

    <div class="stat-row">
      <div class="stat"><p class="stat__label">${t('year.gross')}</p><p class="stat__val">${money(s.grossSatang)}</p></div>
      <div class="stat"><p class="stat__label">${t('year.deduct')}</p><p class="stat__val stat__val--deduct">${money(-s.deductSatang)}</p></div>
    </div>

    <ul class="panel months">
      ${s.months.map((m) => html`
        <li>
          <a class="month-row" href="#/month/${m.key}" aria-label="${monthName(m.month)} ${yearNumber(year)}${m.saved ? '' : ` · ${t('year.notSaved')}`}">
            <span class="month-row__name">${monthShort(m.month)}</span>
            ${m.saved ? html`
              <span class="month-row__bar" aria-hidden="true">
                <span class="month-row__gross" style="width:${(m.grossSatang / maxGross) * 100}%">
                  <span class="month-row__net" style="width:${m.grossSatang > 0 ? Math.max(0, m.netSatang / m.grossSatang) * 100 : 0}%"></span>
                </span>
              </span>
              <span class="month-row__net-val ${m.netSatang < 0 ? 'is-neg' : ''}">${money(m.netSatang)}</span>
              <span class="month-row__sub">${t('year.rowSub', { gross: money(m.grossSatang), deduct: money(m.deductSatang), pct: formatPct(m.deductPctBp) })}</span>` : html`
              <span class="month-row__dots" aria-hidden="true"></span>
              <span class="month-row__empty">${t('year.notSaved')}</span>`}
          </a>
        </li>`)}
    </ul>

    <section class="panel">
      <h2 class="panel__title">${t('year.byName')}</h2>
      ${s.deductByName.length ? html`
        <ul class="by-name">
          ${s.deductByName.map((r) => html`
            <li><span>${r.name}</span><span class="amt-deduct">${money(-r.amountSatang)}</span></li>`)}
        </ul>` : html`<p class="empty">${t('year.noDeduct')}</p>`}
    </section>

    <button type="button" class="btn btn--dark btn--block" disabled aria-describedby="csv-note">
      ${icons.download()}<span>${t('year.csv', { year: yearNumber(year) })}</span>
    </button>
    <p class="hint" id="csv-note">${t('year.csvSoon')}</p>
  `);

  $('#sel-year', root).addEventListener('change', (e) => app.navigate(`#/year/${e.target.value}`));
  return null;
}
