// tests/calc.test.js — test cases ข้อ 10 ของ SPEC (ต้องผ่านทุกข้อ)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countDays } from '../js/dates.js';
import { calcItem, calcMonth, switchAnchor, normalizeItem, roundDiv } from '../js/calc.js';
import { formatMoney, formatPct, describeItem } from '../js/format.js';

const MON_FRI = [1, 2, 3, 4, 5];
const ALL = [1, 2, 3, 4, 5, 6, 7];
const WEEKEND = [6, 7];
const NOV_2026 = { year: 2026, month: 11 };

const fixedPct = (bp, extra = {}) =>
  ({ id: 't', name: 't', kind: 'deduct', method: 'fixed', anchor: 'percent', bp, base: 'salary', capSatang: null, ...extra });
const fixedAmt = (amountSatang, extra = {}) =>
  ({ id: 't', name: 't', kind: 'deduct', method: 'fixed', anchor: 'amount', amountSatang, base: 'salary', capSatang: null, ...extra });
const daily = (rateSatang, offDays, extra = {}) =>
  ({ id: 't', name: 't', kind: 'deduct', method: 'daily', rateSatang, weekdays: MON_FRI, offDays, ...extra });

// ข้อมูลตัวอย่างข้อ 1
const SAMPLE_ITEMS = [
  fixedAmt(250000, { id: 'ot', name: 'ค่าล่วงเวลา (OT)', kind: 'income' }),
  daily(5000, 1, { id: 'park', name: 'ค่าจอดรถ' }),
  fixedPct(300, { id: 'pvd', name: 'กองทุนสำรองเลี้ยงชีพ' }),
  fixedAmt(120000, { id: 'tax', name: 'ภาษีหัก ณ ที่จ่าย' }),
];

test('1: countDays 2026-11 จ–ศ = 21', () => {
  assert.equal(countDays(2026, 11, MON_FRI), 21);
});

test('2: countDays 2026-11 ทุกวัน = 30 / ส–อา = 9', () => {
  assert.equal(countDays(2026, 11, ALL), 30);
  assert.equal(countDays(2026, 11, WEEKEND), 9);
});

test('3: countDays 2026-10 จ–ศ = 22 / 2026-12 จ–ศ = 23', () => {
  assert.equal(countDays(2026, 10, MON_FRI), 22);
  assert.equal(countDays(2026, 12, MON_FRI), 23);
});

test('4: countDays 2027-02 จ–ศ (ไม่ใช่ปีอธิกสุรทิน) = 20', () => {
  assert.equal(countDays(2027, 2, MON_FRI), 20);
});

test('5: countDays 2028-02 จ–ศ (ปีอธิกสุรทิน) = 21', () => {
  assert.equal(countDays(2028, 2, MON_FRI), 21);
});

test('6: daily 50 บาท, 2026-11, จ–ศ, offDays 1 = 1,000.00', () => {
  const r = calcItem(daily(5000, 1), { ...NOV_2026, salarySatang: 3000000 });
  assert.equal(r.countedDays, 21);
  assert.equal(r.effectiveDays, 20);
  assert.equal(r.amountSatang, 100000);
  assert.equal(formatMoney(r.amountSatang), '1,000.00');
});

test('7: daily offDays มากกว่าจำนวนวัน (25) = 0.00', () => {
  const r = calcItem(daily(5000, 25), { ...NOV_2026, salarySatang: 3000000 });
  assert.equal(r.effectiveDays, 0);
  assert.equal(r.amountSatang, 0);
  assert.equal(formatMoney(r.amountSatang), '0.00');
});

test('8: fixed percent 3% ของ salary 30,000 = 900.00', () => {
  const r = calcItem(fixedPct(300), { ...NOV_2026, salarySatang: 3000000 });
  assert.equal(r.amountSatang, 90000);
  assert.equal(formatMoney(r.amountSatang), '900.00');
});

test('9: fixed amount 900 บน salary 30,000 → 3.00%', () => {
  const r = calcItem(fixedAmt(90000), { ...NOV_2026, salarySatang: 3000000 });
  assert.equal(r.pctOfSalaryBp, 300);
  assert.equal(formatPct(r.pctOfSalaryBp), '3.00%');
});

test('10: fixed percent 5% ของ gross 32,500 = 1,625.00', () => {
  const r = calcItem(fixedPct(500, { base: 'gross' }),
    { ...NOV_2026, salarySatang: 3000000, grossSatang: 3250000 });
  assert.equal(r.base, 'gross');
  assert.equal(r.amountSatang, 162500);
  assert.equal(formatMoney(r.amountSatang), '1,625.00');
});

test('11: fixed percent 5% ของ 30,000, cap 875.00 = 875.00', () => {
  const item = fixedPct(500, { capSatang: 87500 });
  const r = calcItem(item, { ...NOV_2026, salarySatang: 3000000 });
  assert.equal(r.amountSatang, 87500);
  assert.equal(r.capped, true);
  assert.equal(describeItem(item, r), '5% ของเงินเดือน (สูงสุด 875.00)');
});

test('12: anchor percent 3% เมื่อ salary เปลี่ยนเป็น 35,000 = 1,050.00', () => {
  const r = calcItem(fixedPct(300), { ...NOV_2026, salarySatang: 3500000 });
  assert.equal(r.amountSatang, 105000);
  assert.equal(formatMoney(r.amountSatang), '1,050.00');
});

test('13: anchor amount 900 เมื่อ salary 35,000 → 2.57%', () => {
  const r = calcItem(fixedAmt(90000), { ...NOV_2026, salarySatang: 3500000 });
  assert.equal(r.amountSatang, 90000);
  assert.equal(formatPct(r.pctOfSalaryBp), '2.57%');
});

test('14: กรอก 1,000 บน 30,000 → 3.33% แล้วสลับไปยึดตาม % → 999.00', () => {
  const ctx = { ...NOV_2026, salarySatang: 3000000 };
  const item = fixedAmt(100000);
  const before = calcItem(item, ctx);
  assert.equal(formatPct(before.bp), '3.33%');

  const switched = switchAnchor(item, 'percent', ctx);
  assert.equal(switched.anchor, 'percent');
  assert.equal(switched.bp, 333);
  const after = calcItem(switched, ctx);
  assert.equal(after.amountSatang, 99900);
  assert.equal(formatMoney(after.amountSatang), '999.00');
});

test('15: ปัดเศษ 1.5% ของ 33,333.00 = 500.00 (ไม่ใช่ 499.99)', () => {
  const r = calcItem(fixedPct(150), { ...NOV_2026, salarySatang: 3333300 });
  assert.equal(r.amountSatang, 50000);
  assert.equal(formatMoney(r.amountSatang), '500.00');
});

test('16: ข้อมูลตัวอย่างข้อ 1 ทั้งเดือน', () => {
  const m = calcMonth({ ...NOV_2026, salarySatang: 3000000, items: SAMPLE_ITEMS });
  assert.equal(formatMoney(m.incomeSatang), '2,500.00');
  assert.equal(formatMoney(m.deductSatang), '3,100.00');
  assert.equal(formatMoney(m.grossSatang), '32,500.00');
  assert.equal(formatMoney(m.netSatang), '29,400.00');
  assert.equal(formatPct(m.deductPctBp), '10.33%');
  assert.equal(m.isNegative, false);

  const byId = Object.fromEntries(m.items.map(({ item, result }) => [item.id, result]));
  assert.equal(byId.park.amountSatang, 100000);
  assert.equal(formatPct(byId.park.pctOfSalaryBp), '3.33%');
  assert.equal(byId.pvd.amountSatang, 90000);
  assert.equal(byId.tax.amountSatang, 120000);
});

test('17: salary 10,000, รายหัก 12,000 → net −2,000.00, flag ติดลบ', () => {
  const m = calcMonth({ ...NOV_2026, salarySatang: 1000000, items: [fixedAmt(1200000)] });
  assert.equal(m.netSatang, -200000);
  assert.equal(formatMoney(m.netSatang), '−2,000.00');
  assert.equal(m.isNegative, true);
});

test('18: salary 0 มีรายหัก 500 → pct = null, ไม่ error', () => {
  const m = calcMonth({ ...NOV_2026, salarySatang: 0, items: [fixedAmt(50000)] });
  assert.equal(m.deductSatang, 50000);
  assert.equal(m.deductPctBp, null);
  assert.equal(m.items[0].result.pctOfSalaryBp, null);
  assert.equal(formatPct(m.deductPctBp), '—');
  // รายการ % บนเงินเดือน 0 ก็ต้องไม่ error
  assert.doesNotThrow(() => calcMonth({ ...NOV_2026, salarySatang: 0, items: [fixedPct(300)] }));
});

test('19: รายรับแบบ % ฐาน gross → บังคับใช้ฐาน salary (ไม่ throw)', () => {
  const ot = fixedPct(1000, { kind: 'income', base: 'gross' });
  const m = calcMonth({ ...NOV_2026, salarySatang: 3000000, items: [ot, fixedAmt(100000, { kind: 'income' })] });
  const r = m.items[0].result;
  assert.equal(r.base, 'salary');
  assert.equal(r.amountSatang, 300000); // 10% ของ 30,000 ไม่ใช่ของ gross
  assert.equal(normalizeItem(ot).base, 'salary');
});

// ---------- เพิ่มเติม ----------

test('roundDiv ปัดครึ่งขึ้นถูกต้อง', () => {
  assert.equal(roundDiv(5, 2), 3);
  assert.equal(roundDiv(4, 3), 1);
  assert.equal(roundDiv(-5, 2), -3);
  assert.equal(roundDiv(0, 7), 0);
  assert.throws(() => roundDiv(1, 0), RangeError);
});

test('switchAnchor percent → amount ใช้จำนวนเงินที่เห็นอยู่', () => {
  const ctx = { ...NOV_2026, salarySatang: 3000000 };
  const s = switchAnchor(fixedPct(333), 'amount', ctx);
  assert.equal(s.anchor, 'amount');
  assert.equal(s.amountSatang, 99900);
});

test('describeItem ของรายการต่อวันและจำนวนเงินคงที่', () => {
  const ctx = { ...NOV_2026, salarySatang: 3000000 };
  const park = daily(5000, 1);
  assert.equal(describeItem(park, calcItem(park, ctx)), '50 × 20 วัน (จ–ศ 21 − หยุด 1)');
  const tax = fixedAmt(120000);
  assert.equal(describeItem(tax, calcItem(tax, ctx)), 'จำนวนเงินคงที่');
  const pvd = fixedPct(300);
  assert.equal(describeItem(pvd, calcItem(pvd, ctx)), '3% ของเงินเดือน');
});

// ---------- เพิ่มจากรีวิว: switchAnchor กรณีพิเศษ ----------

test('switchAnchor: เงินเดือน 0 สลับไปยึด % ไม่ได้ → คงยึดตามบาท จำนวนเงินไม่หาย', () => {
  const ctx0 = { ...NOV_2026, salarySatang: 0, grossSatang: 0 };
  const a = switchAnchor(fixedAmt(100000, { bp: null }), 'percent', ctx0);
  assert.equal(a.anchor, 'amount');
  assert.equal(a.amountSatang, 100000);
  const b = switchAnchor(fixedAmt(100000, { bp: 500 }), 'percent', ctx0);
  assert.equal(b.anchor, 'amount', 'bp ค้างเก่าต้องไม่ถูกนำมาใช้');
  assert.equal(calcItem(b, ctx0).amountSatang, 100000);
});

test('switchAnchor: ฐาน gross และกรณีถูก cap', () => {
  const ctx = { ...NOV_2026, salarySatang: 3000000, grossSatang: 3250000 };
  // 1,000 บน gross 32,500 = 3.08% → ยึด % → 1,001.00
  const g = switchAnchor(fixedAmt(100000, { base: 'gross' }), 'percent', ctx);
  assert.equal(g.bp, 308);
  assert.equal(calcItem(g, ctx).amountSatang, 100100);
  // 5% ของ 30,000 cap 875 → ยึดบาท ได้ 875.00 (ค่าที่ผู้ใช้เห็น)
  const c = switchAnchor(fixedPct(500, { capSatang: 87500 }), 'amount', ctx);
  assert.equal(c.amountSatang, 87500);
  assert.equal(calcItem(c, ctx).capped, false);
  // 2,000 บาท cap 875 → ยึด % ได้ 6.67% และจำนวนเงินยังถูก cap ที่ 875.00
  const p = switchAnchor(fixedAmt(200000, { capSatang: 87500 }), 'percent', ctx);
  assert.equal(p.bp, 667);
  assert.equal(calcItem(p, ctx).amountSatang, 87500);
});

// ---------- เพิ่มจากรีวิว: ข้อมูลเสียต้องไม่ทำให้ได้ NaN หรือ throw ----------

test('calcItem/calcMonth: ข้อมูลเสีย (string, NaN, ทศนิยม, null) ไม่ได้ NaN และไม่ throw', () => {
  const ctx = { ...NOV_2026, salarySatang: 3000000 };
  assert.equal(calcItem(daily(5000, 'abc'), ctx).amountSatang, 105000, 'offDays ไม่ใช่ตัวเลข → 0');
  assert.equal(calcItem(daily(5000, NaN), ctx).amountSatang, 105000);
  assert.equal(calcItem(daily(5000, '2'), ctx).amountSatang, 95000);
  assert.equal(calcItem(daily(5000, -3), ctx).amountSatang, 105000, 'ติดลบ → 0');
  assert.equal(calcItem(daily(5000, 1.7), ctx).amountSatang, 100000, 'ทศนิยมตัดทิ้ง');
  assert.equal(calcItem(daily('5000', 0, { weekdays: ['1', '2', '3', '4', '5'] }), ctx).amountSatang, 105000);
  assert.equal(calcItem(fixedPct(12.5), ctx).amountSatang, 3000000 * 13 / 10000, 'bp ทศนิยม → ปัดครึ่งขึ้น');
  // เงินเดือนทศนิยม 100.5 สตางค์ → ปัดเป็น 101 ไม่ throw
  assert.equal(
    calcItem(fixedAmt(90000), { ...ctx, salarySatang: 100.5 }).pctOfSalaryBp,
    calcItem(fixedAmt(90000), { ...ctx, salarySatang: 101 }).pctOfSalaryBp,
  );

  const r = calcMonth({ ...NOV_2026, salarySatang: '3000000', items: [fixedAmt('90000')] });
  assert.equal(r.deductSatang, 90000, 'ต้องบวกเป็นตัวเลข ไม่ใช่ต่อ string');
  assert.equal(r.deductPctBp, 300);

  const n = calcMonth({ ...NOV_2026, salarySatang: null, items: [fixedAmt(50000)] });
  assert.equal(n.salarySatang, 0);
  assert.equal(n.deductPctBp, null);
  assert.equal(n.netSatang, -50000);
});

test('calcMonth: kind/method ไม่รู้จักไม่ถูกนับ และไม่ throw ทั้งเดือน', () => {
  const r = calcMonth({
    ...NOV_2026, salarySatang: 100000,
    items: [fixedAmt(5000), { ...fixedAmt(7000), kind: 'x' }, { ...fixedAmt(9000), method: 'zzz' }],
  });
  assert.equal(r.deductSatang, 5000);
  assert.equal(r.items[1].result, undefined);
  assert.equal(r.items[2].result, undefined);
  assert.throws(() => calcItem({ ...fixedAmt(1), method: 'zzz' }, NOV_2026), TypeError, 'เรียก calcItem ตรง ๆ ยัง throw');
});
