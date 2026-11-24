// tests/avatar.test.js — ตัวอักษรในวงกลมโปรไฟล์
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initialOf } from '../js/ui/avatar.js';

test('initialOf: ข้ามสระหน้าภาษาไทย, อังกฤษเป็นตัวใหญ่, ไม่มีชื่อเป็น ?', () => {
  assert.equal(initialOf({ firstName: 'ใบเฟิร์น' }), 'บ');
  assert.equal(initialOf({ firstName: 'เปา' }), 'ป');
  assert.equal(initialOf({ firstName: 'มะลิ' }), 'ม');
  assert.equal(initialOf({ displayName: 'baifern' }), 'B');
  assert.equal(initialOf({}), '?');
});
