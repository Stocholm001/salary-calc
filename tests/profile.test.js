// tests/profile.test.js — ข้อมูลส่วนตัว: ชื่อ*, นามสกุล, วันเกิด (ไม่บังคับ)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { validateProfile, fullName, greetName, formatBirthDate, parseIsoDate } from '../js/profile.js';
import { setLang } from '../js/i18n.js';

afterEach(() => setLang('th', null));
const TODAY = '2026-11-24';

test('กรอกแค่ชื่อก็พอ นามสกุล/วันเกิดไม่บังคับ และตัดช่องว่างเกิน', () => {
  const r = validateProfile({ firstName: '  ใบเฟิร์น  ', lastName: '', birthDate: '' }, TODAY);
  assert.deepEqual(r, { ok: true, value: { firstName: 'ใบเฟิร์น', lastName: '', birthDate: null, displayName: 'ใบเฟิร์น' } });
  const r2 = validateProfile({ firstName: 'มะลิ', lastName: ' ใจ   ดี ', birthDate: '1997-03-05' }, TODAY);
  assert.equal(r2.value.displayName, 'มะลิ ใจ ดี');
  assert.equal(r2.value.birthDate, '1997-03-05');
});

test('ชื่อว่าง / ยาวเกิน / วันเกิดผิด / วันเกิดในอนาคต → error ตามช่อง', () => {
  assert.deepEqual(Object.keys(validateProfile({ firstName: ' ' }, TODAY).errors), ['firstName']);
  assert.ok(validateProfile({ firstName: 'ก'.repeat(41) }, TODAY).errors.firstName);
  assert.ok(validateProfile({ firstName: 'a', lastName: 'ข'.repeat(41) }, TODAY).errors.lastName);
  assert.ok(validateProfile({ firstName: 'a', birthDate: '2025-02-30' }, TODAY).errors.birthDate);
  assert.ok(validateProfile({ firstName: 'a', birthDate: '1899-12-31' }, TODAY).errors.birthDate);
  assert.ok(validateProfile({ firstName: 'a', birthDate: '2026-11-25' }, TODAY).errors.birthDate);
  assert.equal(validateProfile({ firstName: 'a', birthDate: '2026-11-24' }, TODAY).ok, true);
});

test('ชื่อที่แสดง: บัญชีเก่าที่ไม่มี firstName ใช้ displayName / username', () => {
  assert.equal(fullName({ firstName: 'มะลิ', lastName: 'ใจดี' }), 'มะลิ ใจดี');
  assert.equal(greetName({ firstName: 'มะลิ', lastName: 'ใจดี' }), 'มะลิ');
  assert.equal(greetName({ displayName: 'Baifern', username: 'baifern' }), 'Baifern');
  assert.equal(fullName({ username: 'pao' }), 'pao');
});

test('วันเกิดแสดงเป็น พ.ศ. (ไทย) / ค.ศ. (อังกฤษ)', () => {
  assert.equal(formatBirthDate('1997-03-05'), '5 มีนาคม 2540');
  setLang('en', null);
  assert.equal(formatBirthDate('1997-03-05'), '5 March 1997');
  assert.equal(formatBirthDate(null), '');
  assert.equal(parseIsoDate('2028-02-29')?.d, 29);
  assert.equal(parseIsoDate('2027-02-29'), null);
});
