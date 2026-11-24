// username.js — normalize ชื่อผู้ใช้, แปลงเป็นอีเมลภายใน, ชื่อที่ใช้ล่าสุดในเครื่อง
// pure (ไม่แตะ Firebase) เพื่อให้เทสต์ได้ด้วย node --test

import { t } from './i18n.js';

/** อีเมลส่วนหน้า @ ยาวได้ไม่เกิน 64 ตัว: "u_" + hex 2 ตัวต่อไบต์ → username ได้ไม่เกิน 31 ไบต์ UTF-8 */
export const MAX_USERNAME_BYTES = 31;
export const MAX_RECENT = 5;

/** trim, ตัวพิมพ์เล็ก, ช่องว่างเป็น _, เหลือแค่ a-z 0-9 _ ก-๙ */
export function normalizeUsername(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_ก-๙]/g, '');
}

const utf8 = (s) => new TextEncoder().encode(s);

/** ข้อความ error ภาษาไทย หรือ null ถ้าใช้ได้ */
export function validateUsername(username) {
  if (!username || /^_+$/.test(username)) return t('user.tooShort');
  if (utf8(username).length > MAX_USERNAME_BYTES) return t('user.tooLong');
  return null;
}

/** u_<hex ของ UTF-8 username>@<domain> */
export function usernameToEmail(username, domain) {
  const hex = [...utf8(username)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `u_${hex}@${domain}`;
}

export const isValidPin = (pin) => /^\d{6}$/.test(pin);

// ---------- ชื่อที่ใช้ล่าสุดในเครื่องนี้ (localStorage) ----------

const RECENT_KEY = 'salary-calc:recent-names';

/** @returns [{ name, username }] ใหม่สุดก่อน */
export function getRecentNames(storage) {
  try {
    const list = JSON.parse(storage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((r) => r && r.name && r.username).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function addRecentName(storage, name, username) {
  const list = getRecentNames(storage).filter((r) => r.username !== username);
  list.unshift({ name: String(name).trim(), username });
  storage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

export function removeRecentName(storage, username) {
  const list = getRecentNames(storage).filter((r) => r.username !== username);
  storage.setItem(RECENT_KEY, JSON.stringify(list));
}
