// theme.js — ธีมสี (รหัสสีอยู่ใน css/style.css :root และ css/themes.css, ที่มา design/THEMES.md)
// ธีมที่เลือกเก็บใน localStorage ของเครื่อง เหมือนภาษา (ใช้ได้ตั้งแต่หน้าล็อกอิน)
// index.html มีสคริปต์สั้น ๆ อ่านคีย์เดียวกันนี้ก่อนวาดหน้า กันจอกะพริบเป็นสีเหลืองก่อน

const THEME_KEY = 'salary-calc:theme';
export const DEFAULT_THEME = 'yellow';

/** id = ค่าใน data-theme, bg = สีพื้นหลัง (ใช้กับแถบสถานะของมือถือ), accent = สีหลัก */
export const THEMES = [
  { id: 'yellow', no: '00', bg: '#FFF8DC', accent: '#B4441A' },
  { id: 'mint', no: '01', bg: '#EEF8F3', accent: '#17785A' },
  { id: 'ocean', no: '02', bg: '#EEF5FC', accent: '#1F5FA8' },
  { id: 'peach', no: '03', bg: '#FFF3EC', accent: '#B93C0C' },
  { id: 'sakura', no: '04', bg: '#FFF2F5', accent: '#B12E5B' },
  { id: 'latte', no: '05', bg: '#F7F1E8', accent: '#87472A' },
  { id: 'matcha', no: '06', bg: '#F3F6EA', accent: '#4B6A1D' },
  { id: 'navy-gold', no: '07', bg: '#F5F3EE', accent: '#1E2F5C' },
  { id: 'teal-coral', no: '08', bg: '#EFF8F8', accent: '#BF3F2A' },
  { id: 'graphite', no: '09', bg: '#F5F5F2', accent: '#222222' },
  { id: 'midnight', no: '10', bg: '#12161F', accent: '#F5B84C', dark: true },
];

const byId = (id) => THEMES.find((x) => x.id === id);

let theme = DEFAULT_THEME;

export const getTheme = () => theme;
export const themeIcon = (id) => `icons/themes/${id}.png`;

/** ตั้งธีม (ค่าที่ไม่รู้จักเป็นค่าเริ่มต้น) เก็บลง storage ถ้ามี แล้วเปลี่ยนสีหน้าทันที */
export function setTheme(next, storage = globalThis.localStorage) {
  theme = byId(next) ? next : DEFAULT_THEME;
  try { storage?.setItem(THEME_KEY, theme); } catch { /* storage ใช้ไม่ได้ ก็ใช้แค่ในหน่วยความจำ */ }
  applyTheme(theme);
  return theme;
}

/** อ่านธีมที่เคยเลือกไว้ในเครื่อง */
export function initTheme(storage = globalThis.localStorage) {
  let saved = null;
  try { saved = storage?.getItem(THEME_KEY); } catch { /* ignore */ }
  return setTheme(saved ?? DEFAULT_THEME, storage);
}

function applyTheme(id) {
  if (!globalThis.document) return;
  const root = document.documentElement;
  if (id === DEFAULT_THEME) root.removeAttribute('data-theme');
  else root.dataset.theme = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = byId(id).bg;
}
