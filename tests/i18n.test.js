// tests/i18n.test.js — คำแปลครบทั้งสองภาษา และข้อความตามภาษาที่เลือก
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { t, setLang, getLang, initLang, missingKeys } from '../js/i18n.js';
import { monthLabel, weekdaysLabel, yearLabel } from '../js/dates.js';
import { describeItem, dailySummaryLines, negativeNetMessage, methodBadge } from '../js/format.js';
import { calcItem } from '../js/calc.js';
import { createMemoryStorage } from '../js/store/local.js';

afterEach(() => setLang('th', null));

test('คีย์ครบทั้งไทยและอังกฤษ', () => {
  assert.deepEqual(missingKeys(), { en: [], th: [] });
});

test('t: แทนค่า {param} และคีย์ที่ไม่มีคืนชื่อคีย์', () => {
  assert.equal(t('month.copy', { name: 'ตุลาคม' }), 'คัดลอกรายการจากเดือนก่อน (ตุลาคม)');
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('setLang / initLang จำค่าใน storage, ค่าแปลก ๆ กลับเป็นไทย', () => {
  const s = createMemoryStorage();
  setLang('en', s);
  assert.equal(getLang(), 'en');
  setLang('th', null);
  assert.equal(initLang(s), 'en');
  assert.equal(setLang('fr', s), 'th');
  assert.equal(initLang(createMemoryStorage()), 'th');
});

test('ภาษาอังกฤษ: เดือน, ปี ค.ศ., ชุดวัน, คำอธิบายรายการ', () => {
  setLang('en', null);
  assert.equal(monthLabel(2026, 11), 'November 2026');
  assert.equal(yearLabel(2026), '2026');
  assert.equal(weekdaysLabel([1, 2, 3, 4, 5]), 'Mon–Fri');
  assert.equal(weekdaysLabel([1, 3, 5]), 'Mon Wed Fri');
  assert.equal(methodBadge({ method: 'daily' }), 'Per day');

  const park = { kind: 'deduct', method: 'daily', rateSatang: 5000, weekdays: [1, 2, 3, 4, 5], offDays: 1 };
  const r = calcItem(park, { year: 2026, month: 11, salarySatang: 3000000 });
  assert.equal(describeItem(park, r), '50 × 20 days (Mon–Fri 21 \u2212 off 1)');
  assert.deepEqual(dailySummaryLines(park, r, 2026, 11), [
    'November 2026 · Mon–Fri 21 days \u2212 off 1 = 20 days',
    '50 × 20 = 1,000.00 THB',
    '= 3.33% of salary',
  ]);
  const pvd = { kind: 'deduct', method: 'fixed', anchor: 'percent', bp: 500, base: 'salary', capSatang: 87500 };
  assert.equal(describeItem(pvd, calcItem(pvd, { year: 2026, month: 11, salarySatang: 3000000 })), '5% of salary (max 875.00)');
  assert.equal(negativeNetMessage(-200000), 'Deductions exceed income by 2,000.00 THB this month');
});

test('ภาษาไทยเป็นค่าเริ่มต้น และ พ.ศ.', () => {
  assert.equal(yearLabel(2026), 'พ.ศ. 2569');
  assert.equal(monthLabel(2026, 11), 'พฤศจิกายน 2569');
});
