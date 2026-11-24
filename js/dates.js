// dates.js — ชื่อเดือนไทย, แปลง พ.ศ./ค.ศ., นับวัน
// ปีในโค้ดเป็น ค.ศ. เสมอ แปลงเป็น พ.ศ. เฉพาะตอนแสดงผล
// month เป็น 1–12, weekday เป็น ISO (1 = จันทร์ … 7 = อาทิตย์)
// ชื่อที่แสดงผลตามภาษาปัจจุบันใน i18n.js (ไทยใช้ พ.ศ., อังกฤษใช้ ค.ศ.)

import { getLang } from './i18n.js';

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

// index = ISO weekday (index 0 ไม่ใช้)
export const THAI_WEEKDAYS_SHORT = ['', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

export const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const EN_WEEKDAYS_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const THAI_WEEKDAYS_FULL = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const EN_WEEKDAYS_FULL = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const isEn = () => getLang() === 'en';
export const monthName = (m) => (isEn() ? EN_MONTHS : THAI_MONTHS)[m - 1];
export const monthShort = (m) => (isEn() ? EN_MONTHS_SHORT : THAI_MONTHS_SHORT)[m - 1];
export const weekdayShort = (w) => (isEn() ? EN_WEEKDAYS_SHORT : THAI_WEEKDAYS_SHORT)[w];
export const weekdayFull = (w) => (isEn() ? EN_WEEKDAYS_FULL : THAI_WEEKDAYS_FULL)[w];
/** ปีสำหรับแสดงผล: ไทย "พ.ศ. 2569", อังกฤษ "2026" */
export const yearLabel = (ceYear) => (isEn() ? String(ceYear) : `พ.ศ. ${ceYear + 543}`);
/** ปีแบบตัวเลขอย่างเดียว: ไทย 2569, อังกฤษ 2026 */
export const yearNumber = (ceYear) => (isEn() ? ceYear : ceYear + 543);

export const DEFAULT_WEEKDAYS = Object.freeze([1, 2, 3, 4, 5]);

export const toBE = (ceYear) => ceYear + 543;
export const toCE = (beYear) => beYear - 543;

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO weekday ของวันที่ (1 = จันทร์ … 7 = อาทิตย์) */
export function isoWeekday(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = อาทิตย์
  return d === 0 ? 7 : d;
}

/** จำนวนวันในเดือนที่ตรงกับ weekdays */
export function countDays(year, month, weekdays = DEFAULT_WEEKDAYS) {
  const set = new Set(weekdays);
  const n = daysInMonth(year, month);
  let count = 0;
  for (let day = 1; day <= n; day++) {
    if (set.has(isoWeekday(year, month, day))) count++;
  }
  return count;
}

/** เรียงและตัดค่าซ้ำ/ค่าที่ไม่ใช่ 1–7 */
export function normalizeWeekdays(weekdays) {
  return [...new Set(weekdays)]
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b);
}

/** ข้อความย่อชุดวัน: จ–ศ / ทุกวัน / ส–อา / จ พ ศ (อังกฤษ: Mon–Fri / Every day / Sat–Sun / Mon Wed Fri) */
export function weekdaysLabel(weekdays) {
  const w = normalizeWeekdays(weekdays);
  const key = w.join(',');
  const en = isEn();
  if (key === '1,2,3,4,5,6,7') return en ? 'Every day' : 'ทุกวัน';
  if (key === '1,2,3,4,5') return en ? 'Mon–Fri' : 'จ–ศ';
  if (key === '6,7') return en ? 'Sat–Sun' : 'ส–อา';
  return w.map(weekdayShort).join(' ');
}

/** "พฤศจิกายน 2569" / "November 2026" */
export function monthLabel(year, month) {
  return `${monthName(month)} ${yearNumber(year)}`;
}

/** คีย์เอกสารเดือน "YYYY-MM" (ค.ศ.) */
export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthKey(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** เลื่อนเดือน: addMonths("2026-12", 1) → "2027-01" */
export function addMonths(key, delta) {
  const p = parseMonthKey(key);
  if (!p) throw new Error(`invalid month key: ${key}`);
  const idx = p.year * 12 + (p.month - 1) + delta;
  return monthKey(Math.floor(idx / 12), (idx % 12 + 12) % 12 + 1);
}

/** ปีให้เลือกใน dropdown (ค.ศ.): min(ปีแรกที่มีข้อมูล, ปีปัจจุบัน) … ปีปัจจุบัน + 10 */
export function yearOptions(currentYear, firstDataYear = null) {
  const start = firstDataYear == null ? currentYear : Math.min(firstDataYear, currentYear);
  const years = [];
  for (let y = start; y <= currentYear + 10; y++) years.push(y);
  return years;
}
