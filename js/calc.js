// calc.js — ฟังก์ชันคำนวณล้วน ๆ (ไม่แตะ DOM/Firebase)
//
// หน่วย:
//   เงิน = สตางค์ (integer)  เช่น 30,000.00 บาท = 3000000
//   %    = basis points (integer)  1% = 100, 3.25% = 325
// ห้ามใช้ float กับเงิน การหารทุกครั้งผ่าน roundDiv (BigInt, ปัดครึ่งขึ้น)

import { countDays, DEFAULT_WEEKDAYS } from './dates.js';

const BP_SCALE = 10000n; // 100% = 10000 bp

/**
 * หาร integer แล้วปัดครึ่งขึ้น (ค่าลบปัดออกจากศูนย์ แบบสมมาตร)
 * ใช้ BigInt เพื่อไม่ให้ผลคูณใหญ่เกิน Number.MAX_SAFE_INTEGER และกรณี .5 ปัดถูกต้อง
 */
export function roundDiv(numer, denom) {
  let n = BigInt(numer);
  let d = BigInt(denom);
  if (d === 0n) throw new RangeError('division by zero');
  if (d < 0n) { n = -n; d = -d; }
  const neg = n < 0n;
  if (neg) n = -n;
  const q = (2n * n + d) / (2n * d);
  return Number(neg ? -q : q);
}

/** เงินจาก %: roundHalfUp(base × bp / 10000) */
export function amountFromBp(baseSatang, bp) {
  return roundDiv(BigInt(baseSatang) * BigInt(bp), BP_SCALE);
}

/** % (bp) ของ amount เทียบกับ base, base เป็น 0 หรือติดลบ → null */
export function bpOf(amountSatang, baseSatang) {
  if (!(baseSatang > 0)) return null;
  return roundDiv(BigInt(amountSatang) * BP_SCALE, baseSatang);
}

/** % ของเงินเดือน (bp) สำหรับแสดงผล, เงินเดือน 0 → null */
export const pctOfSalary = (amountSatang, salarySatang) => bpOf(amountSatang, salarySatang);

/** ฐาน % ที่ใช้จริง: รายรับใช้ได้แค่ salary (ข้อมูลผิดจะถูกบังคับเป็น salary ไม่ throw) */
export function resolveBase(item) {
  return item.kind === 'deduct' && item.base === 'gross' ? 'gross' : 'salary';
}

/** ทำให้ item อยู่ในรูปที่ถูกต้องก่อนเก็บ (บังคับฐานของรายรับเป็น salary) */
export function normalizeItem(item) {
  if (item.method !== 'fixed') return { ...item };
  return { ...item, base: resolveBase(item) };
}

/**
 * คำนวณรายการเดียว
 * @param item  ตามข้อ 6.1 ของ SPEC
 * @param ctx   { year, month, salarySatang, grossSatang }
 *              grossSatang ใช้เฉพาะรายหักที่ base = "gross"
 * @returns {{
 *   amountSatang: number,
 *   pctOfSalaryBp: number|null,
 *   // fixed
 *   base?: 'salary'|'gross', baseSatang?: number, bp?: number|null, capped?: boolean,
 *   // daily
 *   countedDays?: number, offDays?: number, effectiveDays?: number,
 * }}
 */
export function calcItem(item, ctx) {
  const salary = ctx.salarySatang ?? 0;
  let out;

  if (item.method === 'daily') {
    const weekdays = item.weekdays ?? DEFAULT_WEEKDAYS;
    const countedDays = countDays(ctx.year, ctx.month, weekdays);
    const offDays = Math.max(0, Math.trunc(item.offDays ?? 0));
    const effectiveDays = Math.max(0, countedDays - offDays);
    out = {
      amountSatang: (item.rateSatang ?? 0) * effectiveDays,
      countedDays,
      offDays,
      effectiveDays,
    };
  } else if (item.method === 'fixed') {
    const base = resolveBase(item);
    const baseSatang = base === 'gross' ? (ctx.grossSatang ?? salary) : salary;
    let amount;
    let bp;
    if (item.anchor === 'percent') {
      bp = item.bp ?? 0;
      amount = amountFromBp(baseSatang, bp);
    } else {
      amount = item.amountSatang ?? 0;
      bp = bpOf(amount, baseSatang);
    }
    let capped = false;
    if (item.capSatang != null && amount > item.capSatang) {
      amount = item.capSatang;
      capped = true;
    }
    out = { amountSatang: amount, base, baseSatang, bp, capped };
  } else {
    throw new TypeError(`unknown method: ${item.method}`);
  }

  out.pctOfSalaryBp = pctOfSalary(out.amountSatang, salary);
  return out;
}

/**
 * สลับ "ยึดตาม" ของรายการ fixed แล้วคืน item ใหม่
 * ค่าที่ยึดใหม่มาจากค่าที่ผู้ใช้เห็นอยู่ตอนนี้ เช่น 1,000 บน 30,000 = 3.33% → ยึด % → 999.00
 */
export function switchAnchor(item, toAnchor, ctx) {
  if (item.method !== 'fixed' || item.anchor === toAnchor) return { ...item };
  const r = calcItem(item, ctx);
  if (toAnchor === 'percent') {
    return { ...item, anchor: 'percent', bp: r.bp ?? item.bp ?? 0 };
  }
  if (toAnchor === 'amount') {
    return { ...item, anchor: 'amount', amountSatang: r.amountSatang };
  }
  throw new TypeError(`unknown anchor: ${toAnchor}`);
}

/**
 * คำนวณทั้งเดือนตามลำดับข้อ 5.2
 * @param month { year, month, salarySatang, items }
 */
export function calcMonth({ year, month, salarySatang, items = [] }) {
  const salary = salarySatang ?? 0;
  const results = new Map();

  let income = 0;
  for (const item of items) {
    if (item.kind !== 'income') continue;
    const r = calcItem(item, { year, month, salarySatang: salary, grossSatang: salary });
    results.set(item, r);
    income += r.amountSatang;
  }
  const gross = salary + income;

  let deduct = 0;
  for (const item of items) {
    if (item.kind !== 'deduct') continue;
    const r = calcItem(item, { year, month, salarySatang: salary, grossSatang: gross });
    results.set(item, r);
    deduct += r.amountSatang;
  }
  const net = gross - deduct;

  return {
    salarySatang: salary,
    incomeSatang: income,
    grossSatang: gross,
    deductSatang: deduct,
    netSatang: net,
    deductPctBp: pctOfSalary(deduct, salary),
    isNegative: net < 0,
    items: items.map((item) => ({ item, result: results.get(item) })),
  };
}
