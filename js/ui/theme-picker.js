// ui/theme-picker.js — หน้าต่างเลือกธีมสี (กดแล้วเปลี่ยนสีทันที)

import { html, mount, $, $$ } from './dom.js';
import { THEMES, getTheme, setTheme, themeIcon } from '../theme.js';
import { t } from '../i18n.js';

/** เปิดหน้าต่างเลือกธีม onChange(id) ถูกเรียกทุกครั้งที่เปลี่ยน คืน Promise เมื่อปิด */
export function openThemePicker(onChange) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.setAttribute('aria-labelledby', 'th-title');
    const cur = getTheme();
    mount(dlg, html`
      <div class="sheet__form">
        <div class="sheet__grip" aria-hidden="true"></div>
        <h2 class="sheet__title" id="th-title">${t('theme.title')}</h2>
        <div class="themes" role="radiogroup" aria-labelledby="th-title">
          ${THEMES.map((x) => html`
            <button type="button" class="theme-opt" role="radio" data-theme-id="${x.id}"
                    aria-checked="${x.id === cur}" tabindex="${x.id === cur ? 0 : -1}">
              <img class="theme-opt__icon" src="${themeIcon(x.id)}" alt="" width="64" height="64" loading="lazy">
              <span class="theme-opt__no">${x.no}</span>
              <span class="theme-opt__name">${t(`theme.${x.id}`)}</span>
              <span class="theme-opt__dots" aria-hidden="true">
                <span style="background:${x.bg}"></span><span style="background:${x.accent}"></span>
              </span>
            </button>`)}
        </div>
        <button type="button" class="btn btn--primary btn--block" id="th-done">${t('theme.done')}</button>
      </div>`);
    document.body.append(dlg);

    const opts = $$('[data-theme-id]', dlg);
    const select = (btn) => {
      const id = setTheme(btn.dataset.themeId);
      opts.forEach((b) => {
        const on = b.dataset.themeId === id;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      onChange?.(id);
    };
    opts.forEach((b) => b.addEventListener('click', () => select(b)));
    // ลูกศรเลื่อนตัวเลือกแบบ radiogroup
    $('.themes', dlg).addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const i = opts.indexOf(document.activeElement);
      const next = opts[(i + step + opts.length) % opts.length];
      next.focus();
      select(next);
    });
    $('#th-done', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { dlg.remove(); resolve(getTheme()); });
    dlg.showModal();
    opts.find((b) => b.dataset.themeId === cur)?.focus();
  });
}
