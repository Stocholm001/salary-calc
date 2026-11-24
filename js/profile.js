// profile.js — ข้อมูลส่วนตัวของผู้ใช้: ชื่อ*, นามสกุล, วันเกิด (ไม่บังคับ)
// ไม่แตะ DOM/Firebase

import { monthName, yearNumber } from './dates.js';
import { t } from './i18n.js';

export const NAME_MAX = 40;

/** ตัดช่องว่างหัวท้าย และยุบช่องว่างซ้อน */
const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

/** "YYYY-MM-DD" ที่เป็นวันจริง → { y, m, d } | null */
export function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** วันนี้ตามเวลาเครื่อง "YYYY-MM-DD" */
export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * ตรวจและจัดข้อมูลส่วนตัว
 * @returns {{ ok: true, value: { firstName, lastName, birthDate, displayName } } | { ok: false, errors: { field: message } }}
 */
export function validateProfile({ firstName, lastName, birthDate }, today = todayIso()) {
  const errors = {};
  const first = clean(firstName);
  const last = clean(lastName);
  const birth = String(birthDate ?? '').trim();

  if (!first) errors.firstName = t('prof.firstRequired');
  else if ([...first].length > NAME_MAX) errors.firstName = t('prof.tooLong', { n: NAME_MAX });
  if ([...last].length > NAME_MAX) errors.lastName = t('prof.tooLong', { n: NAME_MAX });

  if (birth) {
    const p = parseIsoDate(birth);
    if (!p || p.y < 1900) errors.birthDate = t('prof.badDate');
    else if (birth > today) errors.birthDate = t('prof.futureDate');
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      firstName: first,
      lastName: last,
      birthDate: birth || null,
      displayName: fullName({ firstName: first, lastName: last }),
    },
  };
}

/** ชื่อเต็ม "ชื่อ นามสกุล" (บัญชีเก่าที่ไม่มี firstName ใช้ displayName/username แทน) */
export function fullName(p) {
  const first = clean(p?.firstName) || clean(p?.displayName) || clean(p?.username);
  return [first, clean(p?.lastName)].filter(Boolean).join(' ');
}

/** ชื่อสำหรับทักทาย: ชื่ออย่างเดียว */
export function greetName(p) {
  return clean(p?.firstName) || clean(p?.displayName) || clean(p?.username);
}

/** "1997-03-05" → "5 มีนาคม 2540" / "5 March 1997" */
export function formatBirthDate(iso) {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `${p.d} ${monthName(p.m)} ${yearNumber(p.y)}`;
}
