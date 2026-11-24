// tests/firestore-store.test.js — store/firestore.js กับ Firestore จำลองในหน่วยความจำ
// ตรวจว่า interface ตรงกับ store/local.js และใช้ได้กับลอจิกใน months.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFirestoreStore } from '../js/store/firestore.js';
import { loadMonth, enableRecurring, stopRecurring, loadYear } from '../js/months.js';

const TS = Symbol('serverTimestamp');

/** Firestore modular API แบบย่อ: path → data */
function fakeFirestore() {
  const docs = new Map();
  const join = (...p) => p.join('/');
  // เก็บ timestamp เป็น { __ts } แล้วแปลงเป็นอ็อบเจกต์ที่มี toMillis() ตอนอ่าน
  const out = (d) => Object.fromEntries(Object.entries(structuredClone(d))
    .map(([k, v]) => [k, v && v.__ts ? { toMillis: () => v.__ts } : v]));
  const F = {
    doc: (base, ...p) => ({ path: base.path ? join(base.path, ...p) : join(...p) }),
    collection: (_db, ...p) => ({ path: join(...p) }),
    serverTimestamp: () => TS,
    async getDoc(ref) {
      const d = docs.get(ref.path);
      return { exists: () => d !== undefined, data: () => (d === undefined ? undefined : out(d)) };
    },
    async setDoc(ref, data, opts) {
      for (const v of Object.values(data)) if (v === undefined) throw new Error('undefined field');
      const json = JSON.stringify(data, (_k, v) => (v === TS ? { __ts: 1700000000000 } : v));
      if (/"[^"]+":undefined/.test(json)) throw new Error('undefined field');
      const prev = opts?.merge ? docs.get(ref.path) ?? {} : {};
      docs.set(ref.path, { ...prev, ...JSON.parse(json) });
    },
    async deleteDoc(ref) { docs.delete(ref.path); },
    async getDocs(col) {
      const prefix = col.path + '/';
      const list = [...docs.entries()]
        .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map(([p, d]) => ({ id: p.slice(prefix.length), data: () => out(d) }));
      return { docs: list };
    },
  };
  return { fb: { db: {}, F }, docs };
}

test('firestore store: settings, months, templates และใช้กับ months.js ได้', async () => {
  const { fb, docs } = fakeFirestore();
  docs.set('users/u1', { displayName: 'มะลิ', username: 'มะลิ', settings: { hideOnOpen: true } });
  const s = createFirestoreStore(fb, 'u1');

  assert.deepEqual(await s.getProfile(), {
    displayName: 'มะลิ', username: 'มะลิ', photo: null, firstName: '', lastName: '', birthDate: null,
  });
  await s.saveProfile({ firstName: 'มะลิ', lastName: 'ใจดี', birthDate: '1997-03-05', displayName: 'มะลิ ใจดี' });
  assert.deepEqual(await s.getProfile(), {
    displayName: 'มะลิ ใจดี', username: 'มะลิ', photo: null, firstName: 'มะลิ', lastName: 'ใจดี', birthDate: '1997-03-05',
  });
  assert.equal(docs.get('users/u1').username, 'มะลิ', 'แก้โปรไฟล์ต้องไม่ลบ username');
  await s.saveProfilePhoto('data:image/jpeg;base64,AAAA');
  assert.equal((await s.getProfile()).photo, 'data:image/jpeg;base64,AAAA');
  assert.equal(docs.get('users/u1').settings.hideOnOpen, true, 'บันทึกรูปต้องไม่ลบ settings');
  await s.saveProfilePhoto(null);
  assert.equal((await s.getProfile()).photo, null);
  assert.deepEqual(await s.getSettings(), { hideOnOpen: true, weekStartsMonday: true });
  await s.saveSettings({ hideOnOpen: false, weekStartsMonday: false });
  assert.equal(docs.get('users/u1').displayName, 'มะลิ ใจดี', 'merge ต้องไม่ลบฟิลด์อื่น');
  assert.equal(docs.get('users/u1').settings.weekStartsMonday, false);

  // item ที่มี undefined ต้องบันทึกได้ (Firestore ไม่รับ undefined)
  await s.saveMonth('2026-10', { salarySatang: 3000000, items: [{ id: 'a', name: 'ภาษี', kind: 'deduct', method: 'fixed', anchor: 'amount', amountSatang: 120000, bp: undefined, base: 'salary' }] });
  const m = await s.getMonth('2026-10');
  assert.equal(m.salarySatang, 3000000);
  assert.equal(m.items[0].name, 'ภาษี');
  assert.equal(m.updatedAt, 1700000000000);
  assert.equal(await s.getMonth('2026-11'), null);

  const item = await enableRecurring(s, '2026-10', { id: 'p', name: 'ค่าจอดรถ', kind: 'deduct', method: 'daily', rateSatang: 5000, weekdays: [1, 2, 3, 4, 5], offDays: 2 });
  const draft = await loadMonth(s, '2026-11');
  assert.equal(draft.salarySatang, 3000000);
  assert.equal(draft.items[0].templateId, item.templateId);
  assert.equal(draft.items[0].offDays, 0);
  await s.saveMonth('2026-11', draft);
  assert.deepEqual(await s.listMonthKeys(), ['2026-10', '2026-11']);

  await stopRecurring(s, item.templateId, '2026-09');
  assert.equal((await s.listTemplates()).length, 0);
  assert.equal((await s.getMonth('2026-11')).items.length, 0);

  const y = await loadYear(s, 2026);
  assert.equal(y.savedCount, 2);
});

// ---------- เพิ่มจากรีวิว ----------

import { commitWithin } from '../js/store/firestore.js';

test('commitWithin: สำเร็จทัน / error ทัน / เกินเวลา (ออฟไลน์) / error มาทีหลัง', async () => {
  assert.deepEqual(await commitWithin(Promise.resolve(), 50), { queued: false });
  await assert.rejects(commitWithin(Promise.reject(new Error('permission-denied')), 50), /permission-denied/);

  let rejectLate;
  const late = [];
  const pending = new Promise((_, rej) => { rejectLate = rej; });
  assert.deepEqual(await commitWithin(pending, 10, (e) => late.push(e.message)), { queued: true });
  rejectLate(new Error('late'));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(late, ['late']);
});

test('firestore store ออฟไลน์: setDoc ไม่ resolve → saveMonth คืน queued และอ่านต่อจาก cache ได้', async () => {
  const { fb } = fakeFirestore();
  fb.F.setDoc = () => new Promise(() => {}); // ไม่มีวันได้คำตอบจากเซิร์ฟเวอร์
  const s = createFirestoreStore(fb, 'u1', { writeWaitMs: 10 });
  assert.deepEqual(await s.listMonthKeys(), []);
  assert.deepEqual(await s.saveMonth('2026-11', { salarySatang: 100, items: [] }), { queued: true });
  assert.equal((await s.getMonth('2026-11')).salarySatang, 100);
  assert.deepEqual(await s.listMonthKeys(), ['2026-11']);
});

test('firestore store: อ่าน collection ครั้งเดียวต่อหน้าจอ, invalidate แล้วอ่านใหม่, เขียนไม่สำเร็จแล้วล้าง cache', async () => {
  const { fb, docs } = fakeFirestore();
  let reads = 0;
  const getDocs = fb.F.getDocs;
  fb.F.getDocs = (col) => { reads++; return getDocs(col); };
  docs.set('users/u1/months/2026-10', { salarySatang: 3000000, items: [] });
  docs.set('users/u1/months/2026-11', { salarySatang: '3100000', items: [{ id: 'a', kind: 'deduct', method: 'fixed', anchor: 'amount', amountSatang: '900' }, { kind: 'x' }] });
  const s = createFirestoreStore(fb, 'u1');

  await loadMonth(s, '2026-12');
  await s.getMonth('2026-10');
  await s.listMonthKeys();
  await loadYear(s, 2026);
  assert.equal(reads, 2, 'months 1 ครั้ง + templates 1 ครั้ง');

  const nov = await s.getMonth('2026-11');
  assert.equal(nov.salarySatang, 3100000, 'ผ่าน sanitize');
  assert.equal(nov.items.length, 1);
  assert.equal(nov.items[0].amountSatang, 900);
  nov.salarySatang = 1;
  assert.equal((await s.getMonth('2026-11')).salarySatang, 3100000, 'แก้ค่าที่ได้ไปต้องไม่กระทบ cache');

  docs.set('users/u1/months/2027-01', { salarySatang: 1, items: [] }); // เครื่องอื่นเขียน
  assert.deepEqual(await s.listMonthKeys(), ['2026-10', '2026-11']);
  s.invalidate();
  assert.deepEqual(await s.listMonthKeys(), ['2026-10', '2026-11', '2027-01']);

  fb.F.setDoc = async () => { throw new Error('permission-denied'); };
  await assert.rejects(s.saveMonth('2026-10', { salarySatang: 5, items: [] }));
  assert.equal((await s.getMonth('2026-10')).salarySatang, 3000000, 'เขียนไม่สำเร็จ → อ่านค่าจริงใหม่');
});
