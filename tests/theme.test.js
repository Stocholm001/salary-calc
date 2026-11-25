// tests/theme.test.js — ธีมสี: จำค่าในเครื่อง, ค่าแปลก ๆ กลับเป็นค่าเริ่มต้น, ทุกธีมมีชื่อ/CSS/รูป
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { THEMES, DEFAULT_THEME, getTheme, setTheme, initTheme, themeIcon } from '../js/theme.js';
import { t, setLang } from '../js/i18n.js';
import { createMemoryStorage } from '../js/store/local.js';

afterEach(() => { setTheme(DEFAULT_THEME, null); setLang('th', null); });

test('setTheme / initTheme จำค่าใน storage, ค่าแปลก ๆ กลับเป็นค่าเริ่มต้น', () => {
  const s = createMemoryStorage();
  setTheme('midnight', s);
  assert.equal(getTheme(), 'midnight');
  setTheme(DEFAULT_THEME, null);
  assert.equal(initTheme(s), 'midnight');
  assert.equal(setTheme('neon', s), DEFAULT_THEME);
  assert.equal(initTheme(createMemoryStorage()), DEFAULT_THEME);
});

test('มี 11 ธีม (00–10) ไม่ซ้ำกัน', () => {
  assert.equal(THEMES.length, 11);
  assert.equal(new Set(THEMES.map((x) => x.id)).size, 11);
  assert.deepEqual(THEMES.map((x) => x.no), ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
});

test('ทุกธีมมีชื่อทั้งสองภาษา, มีรูปตัวอย่าง และมีบล็อก CSS (ยกเว้นค่าเริ่มต้นที่อยู่ใน :root)', () => {
  const css = readFileSync(new URL('../css/themes.css', import.meta.url), 'utf8');
  for (const { id, bg, accent } of THEMES) {
    for (const lang of ['th', 'en']) {
      setLang(lang, null);
      assert.notEqual(t(`theme.${id}`), `theme.${id}`, `${lang} name for ${id}`);
    }
    assert.ok(existsSync(new URL(`../${themeIcon(id)}`, import.meta.url)), `icon for ${id}`);
    if (id === DEFAULT_THEME) continue;
    const block = css.match(new RegExp(`\\[data-theme="${id}"\\] \\{([^}]*)\\}`))?.[1];
    assert.ok(block, `css block for ${id}`);
    assert.match(block, new RegExp(`--bg: ${bg};`), `bg of ${id}`);
    assert.match(block, new RegExp(`--accent: ${accent};`), `accent of ${id}`);
  }
});

test('index.html ใส่ธีมก่อนวาดหน้าด้วยรายชื่อเดียวกับ theme.js', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const { id, bg } of THEMES) {
    if (id === DEFAULT_THEME) continue;
    assert.ok(page.includes(`${/-/.test(id) ? `'${id}'` : id}: '${bg}'`), `early script knows ${id}`);
  }
});
