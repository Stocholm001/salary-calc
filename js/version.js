// version.js — เลขเวอร์ชันของแอป = วันเวลาที่ deploy
// GitHub Pages ส่ง Last-Modified (เวลาที่ deploy) มากับ index.html ซึ่งเบราว์เซอร์ให้มาเป็น document.lastModified
// ไม่ต้องแก้เลขเองตอน deploy, ตอนออฟไลน์ service worker คืนไฟล์จากแคชพร้อม header เดิม จึงยังเป็นเวอร์ชันที่ใช้อยู่จริง

// เวลาที่โหลดโค้ด: ถ้าเซิร์ฟเวอร์ไม่ส่ง Last-Modified เบราว์เซอร์จะให้ document.lastModified เป็นเวลาปัจจุบัน
const LOADED_AT = Date.now();
const NO_HEADER_TOLERANCE_MS = 5000;

/**
 * "11/24/2026 23:39:30" (รูปแบบของ document.lastModified, เวลาเครื่อง) → "2026.11.24-2339"
 * อ่านไม่ได้ หรือเท่ากับเวลาที่โหลด (ไม่มี header เช่น ตอนพัฒนาในเครื่อง) → "dev"
 */
export function versionFromLastModified(lastModified, loadedAt = LOADED_AT) {
  const d = new Date(lastModified);
  if (Number.isNaN(d.getTime())) return 'dev';
  if (Math.abs(loadedAt - d.getTime()) < NO_HEADER_TOLERANCE_MS) return 'dev';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** เวอร์ชันของหน้าที่เปิดอยู่ */
export const appVersion = () => versionFromLastModified(globalThis.document?.lastModified ?? '');
