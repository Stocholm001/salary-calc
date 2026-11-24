// lockout.js — ใส่ PIN ผิดครบ 3 ครั้ง ล็อกการกรอก PIN ของชื่อนั้น 5 นาที (นับแยกตามเครื่อง)
//
// เก็บใน localStorage ของเครื่องนี้ จึงกันการเดา PIN บนเครื่องนี้ได้
// ส่วนการกันจากเครื่องอื่น Firebase Auth จำกัดจำนวนครั้งฝั่งเซิร์ฟเวอร์ให้อยู่แล้ว (auth/too-many-requests)

export const MAX_TRIES = 3;
export const LOCK_MS = 5 * 60 * 1000;
const KEY = 'salary-calc:pin-fails';

function readAll(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
const writeAll = (storage, all) => { try { storage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ } };

/** เวลาที่ยังถูกล็อกอยู่ (ms) 0 = ไม่ล็อก */
export function lockRemaining(storage, username, now = Date.now()) {
  const r = readAll(storage)[username];
  return r?.until > now ? r.until - now : 0;
}

/** ผิดไปแล้วกี่ครั้งในรอบนี้ */
export function failCount(storage, username, now = Date.now()) {
  const r = readAll(storage)[username];
  if (!r || r.until > now) return 0;
  return r.count ?? 0;
}

/**
 * บันทึกว่าใส่ PIN ผิด 1 ครั้ง
 * @returns {{ left: number, lockedMs: number }} left = เหลือกี่ครั้งก่อนล็อก, lockedMs > 0 = เพิ่งถูกล็อก
 */
export function recordFail(storage, username, now = Date.now()) {
  const all = readAll(storage);
  const count = failCount(storage, username, now) + 1;
  if (count >= MAX_TRIES) {
    all[username] = { count: 0, until: now + LOCK_MS };
    writeAll(storage, all);
    return { left: 0, lockedMs: LOCK_MS };
  }
  all[username] = { count, until: 0 };
  writeAll(storage, all);
  return { left: MAX_TRIES - count, lockedMs: 0 };
}

/** ล็อกอินสำเร็จ: ล้างตัวนับ */
export function clearFails(storage, username) {
  const all = readAll(storage);
  if (!(username in all)) return;
  delete all[username];
  writeAll(storage, all);
}

/** 4:59 */
export function formatWait(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
