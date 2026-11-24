// tests/image-load.test.js — ดูชนิดไฟล์รูปจากไบต์หัวไฟล์
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sniffImage } from '../js/ui/image-load.js';

const bytes = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

test('sniffImage: HEIC/HEIF, TIFF ทั้งสองแบบ, SVG', () => {
  assert.equal(sniffImage(bytes('\0\0\0\x18ftypheic\0\0\0\0')), 'heic');
  assert.equal(sniffImage(bytes('\0\0\0\x18ftypmif1\0\0\0\0')), 'heic');
  assert.equal(sniffImage(bytes('\0\0\0\x18ftypavif\0\0\0\0')), null); // AVIF เบราว์เซอร์เปิดเองได้
  assert.equal(sniffImage(new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0])), 'tiff');
  assert.equal(sniffImage(new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8])), 'tiff');
  assert.equal(sniffImage(bytes('  <svg xmlns="http://www.w3.org/2000/svg">')), 'svg');
  assert.equal(sniffImage(bytes('<?xml version="1.0"?><svg>')), 'svg');
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), null); // JPEG
});
