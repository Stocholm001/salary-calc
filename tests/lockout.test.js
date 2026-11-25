// tests/lockout.test.js — ใส่ PIN ผิดครบ 3 ครั้ง → ล็อก 1 นาที
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recordFail, lockRemaining, failCount, clearFails, formatWait, LOCK_MS } from '../js/lockout.js';
import { createMemoryStorage } from '../js/store/local.js';

test('ผิด 2 ครั้งยังไม่ล็อก, ครั้งที่ 3 ล็อก 1 นาที แล้วปลดเองเมื่อครบเวลา', () => {
  const s = createMemoryStorage();
  assert.equal(LOCK_MS, 60 * 1000);
  const t0 = 1_000_000;
  assert.deepEqual(recordFail(s, 'mali', t0), { left: 2, lockedMs: 0 });
  assert.deepEqual(recordFail(s, 'mali', t0 + 1), { left: 1, lockedMs: 0 });
  assert.equal(lockRemaining(s, 'mali', t0 + 2), 0);
  assert.deepEqual(recordFail(s, 'mali', t0 + 2), { left: 0, lockedMs: LOCK_MS });
  assert.equal(lockRemaining(s, 'mali', t0 + 2), LOCK_MS);
  assert.equal(lockRemaining(s, 'mali', t0 + 2 + LOCK_MS - 1000), 1000);
  assert.equal(lockRemaining(s, 'mali', t0 + 2 + LOCK_MS), 0);
  assert.equal(failCount(s, 'mali', t0 + 2 + LOCK_MS), 0, 'หมดเวลาล็อกแล้วเริ่มนับใหม่');
});

test('นับแยกตามชื่อ และล็อกอินสำเร็จแล้วล้างตัวนับ', () => {
  const s = createMemoryStorage();
  recordFail(s, 'a', 0); recordFail(s, 'a', 0);
  assert.equal(failCount(s, 'b', 0), 0);
  clearFails(s, 'a');
  assert.equal(failCount(s, 'a', 0), 0);
  assert.deepEqual(recordFail(s, 'a', 0), { left: 2, lockedMs: 0 });
});

test('formatWait', () => {
  assert.equal(formatWait(LOCK_MS), '1:00');
  assert.equal(formatWait(299_001), '5:00');
  assert.equal(formatWait(61_000), '1:01');
  assert.equal(formatWait(1), '0:01');
});
