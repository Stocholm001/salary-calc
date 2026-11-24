// format.js — จัดรูปแบบเงิน/%, แปลงค่าที่ผู้ใช้กรอก, ข้อความอธิบายรายการ, ซ่อนตัวเลข
// รับ/คืนค่าเป็นสตางค์และ basis points (integer) เสมอ ไม่แปลงผ่าน float

import { monthLabel, weekdaysLabel, DEFAULT_WEEKDAYS } from './dates.js';
import { t } from './i18n.js';

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

// ---------- ข้อความอธิบายรายการ (ตามภาษาปัจจุบัน) ----------

const baseLabel = (base) => t(base === 'gross' ? 'fmt.ofGross' : 'fmt.ofSalary');

/** ป้ายวิธีคิด: "ต่อวัน" / "%" / "คงที่" */
export function methodBadge(item) {
  if (item.method === 'daily') return t('badge.daily');
  return item.anchor === 'percent' ? '%' : t('badge.fixed');
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
      ? t('fmt.dailyOff', { wd, count: result.countedDays, off: result.offDays }).replace('−', MINUS)
      : `${wd} ${result.countedDays}`;
    return t('fmt.daily', { rate: formatMoneyCompact(item.rateSatang ?? 0), n: result.effectiveDays, days });
  }
  const cap = result.capped ? ` (${t('fmt.max', { cap: formatMoney(item.capSatang) })})` : '';
  if (item.anchor === 'percent') return `${formatPctCompact(item.bp ?? 0)} ${baseLabel(result.base)}${cap}`;
  return t('fmt.fixed') + cap;
}

/**
 * กล่องผลคำนวณของรายการต่อวัน (F04) คืน 3 บรรทัด
 *   "พฤศจิกายน 2569 · จ–ศ 21 วัน − หยุด 1 = 20 วัน"
 *   "50 × 20 = 1,000.00 บาท"
 *   "= 3.33% ของเงินเดือน"
 */
export function dailySummaryLines(item, result, year, month) {
  const wd = weekdaysLabel(item.weekdays ?? DEFAULT_WEEKDAYS);
  const p = { month: monthLabel(year, month), wd, count: result.countedDays, off: result.offDays, eff: result.effectiveDays };
  return [
    (result.offDays > 0 ? t('fmt.sum1Off', p) : t('fmt.sum1', p)).replace('−', MINUS),
    t('fmt.sum2', { rate: formatMoneyCompact(item.rateSatang ?? 0), n: result.effectiveDays, amount: formatMoney(result.amountSatang) }),
    t('fmt.sum3', { pct: formatPct(result.pctOfSalaryBp) }),
  ];
}

/** ข้อความ "x.xx% ของเงินเดือน" ใต้ยอดเงินในการ์ด */
export function pctOfSalaryText(bp) {
  return t('fmt.pctOfSalary', { pct: formatPct(bp) });
}

/** ข้อความเตือนตอนยอดสุทธิติดลบ */
export function negativeNetMessage(netSatang) {
  return t('fmt.negative', { amount: formatMoney(Math.abs(netSatang)) });
}
