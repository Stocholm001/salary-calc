// tests/applock.test.js — ล็อกแอปด้วย PIN เมื่อไม่ได้ใช้งานเกิน 5 นาที
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { markActive, lastActive, shouldLock, LOCK_AFTER_MS } from '../js/applock.js';
import { createMemoryStorage } from '../js/store/local.js';

test('ไม่เคยบันทึกเวลาใช้งาน (เปิดแอปด้วย session เดิมครั้งแรก) → ต้องล็อก', () => {
  const s = createMemoryStorage();
  assert.equal(lastActive(s, 'u1'), null);
  assert.equal(shouldLock(s, 'u1', 1_000_000), true);
});

test('ไม่ได้ใช้งานไม่ถึง 5 นาที → ไม่ล็อก, ครบ 5 นาที → ล็อก', () => {
  const s = createMemoryStorage();
  const t0 = 1_700_000_000_000;
  markActive(s, 'u1', t0);
  assert.equal(LOCK_AFTER_MS, 5 * 60 * 1000);
  assert.equal(shouldLock(s, 'u1', t0), false);
  assert.equal(shouldLock(s, 'u1', t0 + LOCK_AFTER_MS - 1), false);
  assert.equal(shouldLock(s, 'u1', t0 + LOCK_AFTER_MS), true);
  markActive(s, 'u1', t0 + LOCK_AFTER_MS - 1000); // ใช้งานต่อ → นับใหม่
  assert.equal(shouldLock(s, 'u1', t0 + LOCK_AFTER_MS + 1000), false);
});

test('นับแยกตามผู้ใช้', () => {
  const s = createMemoryStorage();
  markActive(s, 'u1', 1000);
  assert.equal(shouldLock(s, 'u1', 2000), false);
  assert.equal(shouldLock(s, 'u2', 2000), true);
});

test('นาฬิกาเครื่องถอยหลังเกิน 1 นาที → ล็อก, คลาดเล็กน้อย → ไม่ล็อก', () => {
  const s = createMemoryStorage();
  const t0 = 1_700_000_000_000;
  markActive(s, 'u1', t0);
  assert.equal(shouldLock(s, 'u1', t0 - 30 * 1000), false);
  assert.equal(shouldLock(s, 'u1', t0 - 2 * 60 * 1000), true);
});

test('ข้อมูลใน storage เสีย → ถือว่าไม่เคยบันทึก (ล็อก) และบันทึกใหม่ได้', () => {
  const s = createMemoryStorage();
  s.setItem('salary-calc:last-active', '{bad');
  assert.equal(shouldLock(s, 'u1', 5000), true);
  markActive(s, 'u1', 5000);
  assert.equal(shouldLock(s, 'u1', 5000), false);
  s.setItem('salary-calc:last-active', JSON.stringify({ u1: 'x' }));
  assert.equal(lastActive(s, 'u1'), null);
});
