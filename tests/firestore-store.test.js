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

  assert.deepEqual(await s.getProfile(), { displayName: 'มะลิ', username: 'มะลิ' });
  assert.deepEqual(await s.getSettings(), { hideOnOpen: true, weekStartsMonday: true });
  await s.saveSettings({ hideOnOpen: false, weekStartsMonday: false });
  assert.equal(docs.get('users/u1').displayName, 'มะลิ', 'merge ต้องไม่ลบฟิลด์อื่น');
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
