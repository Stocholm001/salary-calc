// applock.js — ล็อกแอปด้วย PIN เมื่อไม่ได้ใช้งานเกิน LOCK_AFTER_MS (แบบแอปธนาคาร)
// ไม่ได้ออกจากระบบจริง แค่ต้องใส่ PIN ก่อนเห็นข้อมูล
// เก็บเวลาที่ใช้งานล่าสุดใน localStorage แยกตามผู้ใช้ (uid) ฟังก์ชันล้วน ๆ ไม่แตะ DOM/Firebase

export const LOCK_AFTER_MS = 5 * 60 * 1000;
const KEY = 'salary-calc:last-active';
// นาฬิกาเครื่องถอยหลังเกินนี้ (เช่น ปรับเวลาเครื่องย้อนกลับ) ให้ถือว่าต้องล็อก
const CLOCK_BACK_TOLERANCE_MS = 60 * 1000;

function readAll(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** บันทึกว่าผู้ใช้ยังใช้งานอยู่ ณ เวลา now */
export function markActive(storage, uid, now = Date.now()) {
  const all = readAll(storage);
  all[uid] = now;
  try { storage.setItem(KEY, JSON.stringify(all)); } catch { /* storage เต็ม/ถูกปิด */ }
}

/** เวลาที่ใช้งานล่าสุด (ms) หรือ null ถ้าไม่เคยบันทึก */
export function lastActive(storage, uid) {
  const v = readAll(storage)[uid];
  return Number.isFinite(v) ? v : null;
}

/**
 * ต้องล็อกหรือไม่: ไม่เคยบันทึก (เช่น เปิดแอปครั้งแรกหลังอัปเดต), ไม่ได้ใช้งานครบ afterMs,
 * หรือนาฬิกาเครื่องถอยหลังผิดปกติ
 */
export function shouldLock(storage, uid, now = Date.now(), afterMs = LOCK_AFTER_MS) {
  const t = lastActive(storage, uid);
  if (t == null) return true;
  if (now < t - CLOCK_BACK_TOLERANCE_MS) return true;
  return now - t >= afterMs;
}
