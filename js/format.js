// format.js — จัดรูปแบบเงิน/%, แปลงค่าที่ผู้ใช้กรอก, ข้อความอธิบายรายการ, ซ่อนตัวเลข
// รับ/คืนค่าเป็นสตางค์และ basis points (integer) เสมอ ไม่แปลงผ่าน float

import { monthLabel, weekdaysLabel, DEFAULT_WEEKDAYS } from './dates.js';

export const MINUS = '−'; // −
export const HIDDEN = '••••••';
export const NO_PCT = '—';

const intFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0, useGrouping: true });

function splitSatang(satang) {
  const neg = satang < 0;
  const abs = BigInt(Math.abs(satang));
  return { neg, int: abs / 100n, frac: abs % 100n };
}

/**
 * เงิน: 2940000 → "29,400.00"
 * sign: "auto" (ติดลบใส่ −), "always" (+ / −), "none" (ไม่ใส่เครื่องหมาย)
 */
export function formatMoney(satang, { sign = 'auto' } = {}) {
  const { neg, int, frac } = splitSatang(satang);
  const body = `${intFmt.format(int)}.${String(frac).padStart(2, '0')}`;
  if (sign === 'none') return body;
  if (neg) return MINUS + body;
  if (sign === 'always' && satang > 0) return '+' + body;
  return body;
}

/** เงินแบบสั้น: ถ้าเป็นบาทเต็มไม่ใส่ทศนิยม 5000 → "50", 5050 → "50.50" */
export function formatMoneyCompact(satang) {
  const { neg, int, frac } = splitSatang(satang);
  const body = intFmt.format(int) + (frac === 0n ? '' : `.${String(frac).padStart(2, '0')}`);
  return neg ? MINUS + body : body;
}

/** %: 333 → "3.33%", null → "—" */
export function formatPct(bp) {
  if (bp == null) return NO_PCT;
  const neg = bp < 0;
  const abs = Math.abs(bp);
  const s = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}%`;
  return neg ? MINUS + s : s;
}

/** % แบบสั้น (ตัดศูนย์ท้าย): 300 → "3%", 150 → "1.5%", 325 → "3.25%" */
export function formatPctCompact(bp) {
  if (bp == null) return NO_PCT;
  const neg = bp < 0;
  const abs = Math.abs(bp);
  let frac = String(abs % 100).padStart(2, '0').replace(/0+$/, '');
  const s = `${Math.trunc(abs / 100)}${frac ? '.' + frac : ''}%`;
  return neg ? MINUS + s : s;
}

/** ซ่อนยอดเงินเมื่อ hidden = true (ใช้กับข้อความเงินที่จัดรูปแบบแล้ว) */
export function maskMoney(text, hidden) {
  return hidden ? HIDDEN : text;
}

// ---------- แปลงค่าที่ผู้ใช้กรอก ----------

// ตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง อนุญาต comma คั่นหลักและช่องว่าง
const DECIMAL_RE = /^(\d+)(?:\.(\d{0,2}))?$/;

function parseFixed2(str) {
  if (typeof str === 'number') str = String(str);
  if (typeof str !== 'string') return null;
  const s = str.replace(/[,\s]/g, '');
  if (s === '' || s === '.') return null;
  const m = DECIMAL_RE.exec(s.startsWith('.') ? '0' + s : s);
  if (!m) return null;
  const value = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(value) ? value : null;
}

/** "1,000.5" → 100050 (สตางค์), ไม่ถูกต้อง/ทศนิยมเกิน 2 ตำแหน่ง → null */
export const parseMoney = parseFixed2;

/** "3.25" → 325 (bp), ไม่ถูกต้อง/ทศนิยมเกิน 2 ตำแหน่ง → null */
export const parsePercent = parseFixed2;

// ---------- ข้อความอธิบายรายการ ----------

const BASE_LABEL = { salary: 'ของเงินเดือน', gross: 'ของรายรับรวม' };

/** ป้ายวิธีคิด: "ต่อวัน" / "%" / "คงที่" */
export function methodBadge(item) {
  if (item.method === 'daily') return 'ต่อวัน';
  return item.anchor === 'percent' ? '%' : 'คงที่';
}

/**
 * บรรทัดอธิบายบนการ์ดรายการ
 *   daily:   "50 × 20 วัน (จ–ศ 21 − หยุด 1)"
 *   percent: "3% ของเงินเดือน" / "5% ของเงินเดือน (สูงสุด 875.00)"
 *   amount:  "จำนวนเงินคงที่"
 * @param result ผลจาก calcItem
 */
export function describeItem(item, result) {
  if (item.method === 'daily') {
    const wd = weekdaysLabel(item.weekdays ?? DEFAULT_WEEKDAYS);
    const days = result.offDays > 0
      ? `${wd} ${result.countedDays} ${MINUS} หยุด ${result.offDays}`
      : `${wd} ${result.countedDays}`;
    return `${formatMoneyCompact(item.rateSatang ?? 0)} × ${result.effectiveDays} วัน (${days})`;
  }
  if (item.anchor === 'percent') {
    let s = `${formatPctCompact(item.bp ?? 0)} ${BASE_LABEL[result.base]}`;
    if (result.capped) s += ` (สูงสุด ${formatMoney(item.capSatang)})`;
    return s;
  }
  return result.capped ? `จำนวนเงินคงที่ (สูงสุด ${formatMoney(item.capSatang)})` : 'จำนวนเงินคงที่';
}

/**
 * กล่องผลคำนวณของรายการต่อวัน (F04) คืน 3 บรรทัด
 *   "พฤศจิกายน 2569 · จ–ศ 21 วัน − หยุด 1 = 20 วัน"
 *   "50 × 20 = 1,000.00 บาท"
 *   "= 3.33% ของเงินเดือน"
 */
export function dailySummaryLines(item, result, year, month) {
  const wd = weekdaysLabel(item.weekdays ?? DEFAULT_WEEKDAYS);
  const days = result.offDays > 0
    ? `${wd} ${result.countedDays} วัน ${MINUS} หยุด ${result.offDays} = ${result.effectiveDays} วัน`
    : `${wd} ${result.countedDays} วัน`;
  return [
    `${monthLabel(year, month)} · ${days}`,
    `${formatMoneyCompact(item.rateSatang ?? 0)} × ${result.effectiveDays} = ${formatMoney(result.amountSatang)} บาท`,
    `= ${formatPct(result.pctOfSalaryBp)} ของเงินเดือน`,
  ];
}

/** ข้อความ "x.xx% ของเงินเดือน" ใต้ยอดเงินในการ์ด */
export function pctOfSalaryText(bp) {
  return `${formatPct(bp)} ของเงินเดือน`;
}

/** ข้อความเตือนตอนยอดสุทธิติดลบ */
export function negativeNetMessage(netSatang) {
  return `เดือนนี้รายหักมากกว่ารายรับ ${formatMoney(Math.abs(netSatang))} บาท`;
}
