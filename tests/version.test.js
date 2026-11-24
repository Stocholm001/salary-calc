// tests/version.test.js — เลขเวอร์ชันจาก Last-Modified ของหน้า (เวลาที่ deploy)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { versionFromLastModified } from '../js/version.js';

test('รูปแบบ document.lastModified → YYYY.MM.DD-HHMM (เวลาเครื่อง)', () => {
  const loadedAt = new Date(2026, 10, 25, 9, 0, 0).getTime();
  assert.equal(versionFromLastModified('11/24/2026 23:39:30', loadedAt), '2026.11.24-2339');
  assert.equal(versionFromLastModified('01/05/2027 08:07:00', loadedAt), '2027.01.05-0807');
});

test('อ่านไม่ได้ หรือเท่ากับเวลาที่โหลด (ไม่มี header) → dev', () => {
  const loadedAt = new Date(2026, 10, 24, 23, 39, 30).getTime();
  assert.equal(versionFromLastModified('', loadedAt), 'dev');
  assert.equal(versionFromLastModified('not a date', loadedAt), 'dev');
  assert.equal(versionFromLastModified('11/24/2026 23:39:32', loadedAt), 'dev');
});
