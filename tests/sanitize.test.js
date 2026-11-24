// tests/sanitize.test.js — ข้อมูลที่อ่านจาก store ต้องอยู่ในรูปที่ถูกต้องก่อนถึงลอจิก/UI
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeItem, sanitizeMonthDoc, sanitizeTemplate } from '../js/sanitize.js';
import { calcMonth, toSafeInt } from '../js/calc.js';
import { formatMoney } from '../js/format.js';

test('toSafeInt', () => {
  assert.equal(toSafeInt(900), 900);
  assert.equal(toSafeInt('900'), 900);
  assert.equal(toSafeInt(12.5), 13);
  assert.equal(toSafeInt(-1), 0);
  assert.equal(toSafeInt(NaN), 0);
  assert.equal(toSafeInt('abc'), 0);
  assert.equal(toSafeInt(''), 0);
  assert.equal(toSafeInt(null, null), null);
  assert.equal(toSafeInt(2 ** 60, null), null, 'เกิน safe integer');
});

test('sanitizeItem: ตัวเลขเป็น integer ≥ 0, ฟิลด์ที่ขาดได้ค่าเริ่มต้น', () => {
  const d = sanitizeItem({ id: 'a', name: 'จอดรถ', kind: 'deduct', method: 'daily', rateSatang: '5000', weekdays: ['5', 1, 1, 9], offDays: 'abc' });
  assert.deepEqual(d, { id: 'a', name: 'จอดรถ', kind: 'deduct', method: 'daily', rateSatang: 5000, weekdays: [1, 5], offDays: 0, templateId: null });

  const f = sanitizeItem({ kind: 'income', method: 'fixed', anchor: 'weird', amountSatang: 12.4, bp: -5, base: 'gross', capSatang: 'x', paid: true });
  assert.match(f.id, /^itm_/);
  assert.equal(f.name, '');
  assert.equal(f.anchor, 'amount');
  assert.equal(f.amountSatang, 12);
  assert.equal(f.bp, null);
  assert.equal(f.base, 'salary', 'รายรับใช้ฐาน salary เท่านั้น');
  assert.equal(f.capSatang, null);
  assert.equal(f.paid, undefined, 'สถานะชำระมีเฉพาะรายหัก');

  assert.equal(sanitizeItem({ kind: 'deduct', method: 'daily' }).weekdays.length, 5, 'ไม่มี weekdays → จ–ศ');
});

test('sanitizeItem: ใช้ไม่ได้ → null', () => {
  assert.equal(sanitizeItem(null), null);
  assert.equal(sanitizeItem('x'), null);
  assert.equal(sanitizeItem([]), null);
  assert.equal(sanitizeItem({ kind: 'x', method: 'fixed' }), null);
  assert.equal(sanitizeItem({ kind: 'deduct', method: 'zzz' }), null);
});

test('sanitizeMonthDoc: ข้อมูลเสียแล้วยังคำนวณและจัดรูปแบบได้', () => {
  assert.equal(sanitizeMonthDoc(null), null);
  assert.equal(sanitizeMonthDoc('x'), null);
  const doc = sanitizeMonthDoc({
    salarySatang: '3000000',
    items: [
      { id: 'a', kind: 'deduct', method: 'fixed', anchor: 'amount', amountSatang: '90000' },
      { id: 'b', kind: 'deduct', method: 'daily', rateSatang: 5000, offDays: NaN },
      null, { kind: 'x' },
    ],
  });
  assert.equal(doc.salarySatang, 3000000);
  assert.equal(doc.items.length, 2);
  const r = calcMonth({ year: 2026, month: 11, ...doc });
  assert.equal(r.deductSatang, 90000 + 105000);
  assert.doesNotThrow(() => formatMoney(r.netSatang));
  assert.deepEqual(sanitizeMonthDoc({ items: 'nope' }), { salarySatang: 0, items: [], updatedAt: null });
});

test('sanitizeTemplate: ต้องมี id และ startMonth ที่ถูกต้อง, ไม่มี offDays/templateId/paid', () => {
  assert.equal(sanitizeTemplate({ kind: 'deduct', method: 'fixed', startMonth: '2026-01' }), null);
  assert.equal(sanitizeTemplate({ id: 't', kind: 'deduct', method: 'fixed', startMonth: '2026-13' }), null);
  const t = sanitizeTemplate({ id: 't', kind: 'deduct', method: 'daily', rateSatang: 5000, offDays: 3, paid: true, templateId: 'z', startMonth: '2026-01', endMonth: 'bad' });
  assert.equal(t.id, 't');
  assert.equal(t.endMonth, null);
  assert.equal(t.offDays, undefined);
  assert.equal(t.templateId, undefined);
  assert.equal(t.paid, undefined);
});
