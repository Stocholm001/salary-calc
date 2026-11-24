// tests/dom.test.js — debounce ใน ui/dom.js (ส่วนที่ไม่ต้องใช้ DOM)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { debounce } from '../js/ui/dom.js';

test('debounce.flush: ไม่มีงานค้าง → undefined, มีงานค้าง → เรียกทันทีด้วย args ล่าสุดครั้งเดียว', async () => {
  const calls = [];
  const d = debounce((...a) => { calls.push(a); return 'ok'; }, 1000);
  assert.equal(d.flush(), undefined);
  d(1); d(2);
  assert.equal(d.flush(), 'ok');
  assert.deepEqual(calls, [[2]]);
  assert.equal(d.flush(), undefined, 'flush ซ้ำไม่เรียกอีก');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, [[2]], 'timer ถูกยกเลิกแล้ว');
});

test('debounce.flush: fn throw → ส่ง error ออกมา และไม่ค้างงานไว้', () => {
  const d = debounce(() => { throw new Error('boom'); }, 1000);
  d();
  assert.throws(() => d.flush(), /boom/);
  assert.equal(d.flush(), undefined);
});

test('debounce: เรียกตามเวลา ด้วย args ล่าสุด', async () => {
  const calls = [];
  const d = debounce((x) => calls.push(x), 5);
  d('a'); d('b');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(calls, ['b']);
});
