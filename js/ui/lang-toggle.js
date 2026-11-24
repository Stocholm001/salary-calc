// ui/lang-toggle.js — สวิตช์ภาษา TH | EN (ใช้ทั้งหน้าล็อกอินและหน้าตั้งค่า)

import { html } from './dom.js';
import { getLang, setLang, t } from '../i18n.js';

export function langToggle() {
  const cur = getLang();
  const btn = (code, label) => html`
    <button type="button" class="lang__btn" data-lang="${code}" aria-pressed="${cur === code}"
            lang="${code}">${label}</button>`;
  return html`
    <div class="lang" role="group" aria-label="${t('lang.label')}">
      ${btn('th', 'TH')}${btn('en', 'EN')}
    </div>`;
}

/** ผูกเหตุการณ์คลิกใน root: เปลี่ยนภาษาแล้วเรียก onChange() ให้วาดหน้าใหม่ คืนฟังก์ชันสำหรับถอด */
export function bindLangToggle(root, onChange) {
  const onClick = (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === getLang()) return;
    setLang(b.dataset.lang);
    onChange();
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
