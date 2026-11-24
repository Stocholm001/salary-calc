// tests/username.test.js — ข้อ 7 ของ SPEC (normalize + อีเมลภายใน)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeUsername, validateUsername, usernameToEmail, isValidPin,
  getRecentNames, addRecentName, removeRecentName, MAX_RECENT,
} from '../js/username.js';
import { createMemoryStorage } from '../js/store/local.js';

test('normalizeUsername: trim, ตัวเล็ก, ช่องว่างเป็น _, เหลือ a-z 0-9 _ ก-๙', () => {
  assert.equal(normalizeUsername('  Mali Chan  '), 'mali_chan');
  assert.equal(normalizeUsername('มะลิ'), 'มะลิ');
  assert.equal(normalizeUsername('บ้าน เรา'), 'บ้าน_เรา');
  assert.equal(normalizeUsername('Pao-AIS!@#.99'), 'paoais99');
  assert.equal(normalizeUsername('ปี๒๕๖๙'), 'ปี๒๕๖๙');
  assert.equal(normalizeUsername('é😀'), '');
});

test('validateUsername', () => {
  assert.equal(validateUsername('มะลิ'), null);
  assert.match(validateUsername(''), /อย่างน้อย/);
  assert.match(validateUsername('___'), /อย่างน้อย/);
  assert.equal(validateUsername('a'.repeat(31)), null);
  assert.match(validateUsername('a'.repeat(32)), /ยาวเกินไป/);
  assert.equal(validateUsername('ก'.repeat(10)), null); // 30 ไบต์
  assert.match(validateUsername('ก'.repeat(11)), /ยาวเกินไป/);
});

test('usernameToEmail: u_<hex UTF-8>@domain และส่วนหน้า @ ไม่เกิน 64 ตัว', () => {
  assert.equal(usernameToEmail('mali', 'x.example.com'), 'u_6d616c69@x.example.com');
  assert.equal(usernameToEmail('มะลิ', 'x.example.com'), 'u_e0b8a1e0b8b0e0b8a5e0b8b4@x.example.com');
  const local = usernameToEmail('a'.repeat(31), 'd').split('@')[0];
  assert.ok(local.length <= 64);
});

test('isValidPin', () => {
  assert.equal(isValidPin('123456'), true);
  assert.equal(isValidPin('12345'), false);
  assert.equal(isValidPin('12345a'), false);
});

test('ชื่อที่ใช้ล่าสุด: ใหม่สุดก่อน, ไม่ซ้ำ, สูงสุด 5 ชื่อ', () => {
  const s = createMemoryStorage();
  assert.deepEqual(getRecentNames(s), []);
  for (let i = 1; i <= 7; i++) addRecentName(s, `user${i}`, `user${i}`);
  addRecentName(s, 'User3', 'user3');
  const list = getRecentNames(s);
  assert.equal(list.length, MAX_RECENT);
  assert.deepEqual(list.map((r) => r.name), ['User3', 'user7', 'user6', 'user5', 'user4']);
  removeRecentName(s, 'user7');
  assert.equal(getRecentNames(s).length, 4);
  s.setItem('salary-calc:recent-names', 'not json');
  assert.deepEqual(getRecentNames(s), []);
});
