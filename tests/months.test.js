// tests/months.test.js — กฎของเดือนและรายการประจำ (ข้อ 6.3) + store/local.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLocalStore, createMemoryStorage } from '../js/store/local.js';
import {
  loadMonth, findPrevSaved, copyFromPrevious, enableRecurring, updateRecurring,
  stopRecurring, isTemplateActive, summarizeYear, loadYear, firstDataYear, activeTemplateIds,
} from '../js/months.js';

const fresh = () => createLocalStore(createMemoryStorage(), 'test');

const park = (extra = {}) => ({
  id: 'itm_park', name: 'ค่าจอดรถ', kind: 'deduct', method: 'daily',
  rateSatang: 5000, weekdays: [1, 2, 3, 4, 5], offDays: 1, templateId: null, ...extra,
});
const tax = (extra = {}) => ({
  id: 'itm_tax', name: 'ภาษีหัก ณ ที่จ่าย', kind: 'deduct', method: 'fixed', anchor: 'amount',
  amountSatang: 120000, bp: null, base: 'salary', capSatang: null, templateId: null, ...extra,
});

test('store: บันทึก/อ่านเดือน, เรียงคีย์, settings', async () => {
  const s = fresh();
  assert.equal(await s.getMonth('2026-11'), null);
  await s.saveMonth('2026-11', { salarySatang: 3000000, items: [tax()] });
  await s.saveMonth('2026-02', { salarySatang: 2900000, items: [] });
  assert.deepEqual(await s.listMonthKeys(), ['2026-02', '2026-11']);
  const doc = await s.getMonth('2026-11');
  assert.equal(doc.salarySatang, 3000000);
  assert.equal(doc.items[0].name, 'ภาษีหัก ณ ที่จ่าย');
  assert.ok(doc.updatedAt > 0);
  assert.deepEqual(await s.getSettings(), { hideOnOpen: false, weekStartsMonday: true });
  await s.saveSettings({ hideOnOpen: true, weekStartsMonday: true });
  assert.equal((await s.getSettings()).hideOnOpen, true);
});

test('เดือนที่ยังไม่บันทึก: ร่างใช้เงินเดือนเดือนล่าสุดก่อนหน้า + รายการประจำ (offDays 0)', async () => {
  const s = fresh();
  await s.saveMonth('2026-09', { salarySatang: 3000000, items: [] });
  await s.saveMonth('2026-12', { salarySatang: 9999900, items: [] }); // อยู่หลัง ไม่ควรถูกใช้
  await s.saveTemplate({ ...park(), id: 'tpl_a', offDays: undefined, startMonth: '2026-10', endMonth: null });
  await s.saveTemplate({ ...tax(), id: 'tpl_b', startMonth: '2027-01', endMonth: null }); // ยังไม่เริ่ม

  const m = await loadMonth(s, '2026-11');
  assert.equal(m.saved, false);
  assert.equal(m.salarySatang, 3000000);
  assert.equal(m.items.length, 1);
  assert.equal(m.items[0].templateId, 'tpl_a');
  assert.equal(m.items[0].offDays, 0);
  assert.equal(await s.getMonth('2026-11'), null, 'เปิดดูเฉย ๆ ต้องไม่สร้างเอกสาร');
});

test('เดือนแรกสุดที่ไม่มีข้อมูลก่อนหน้า: เงินเดือน 0', async () => {
  const m = await loadMonth(fresh(), '2026-11');
  assert.equal(m.salarySatang, 0);
  assert.deepEqual(m.items, []);
});

test('isTemplateActive', () => {
  const t = { startMonth: '2026-11', endMonth: '2027-02' };
  assert.equal(isTemplateActive(t, '2026-10'), false);
  assert.equal(isTemplateActive(t, '2026-11'), true);
  assert.equal(isTemplateActive(t, '2027-02'), true);
  assert.equal(isTemplateActive(t, '2027-03'), false);
  assert.equal(isTemplateActive({ startMonth: '2026-11', endMonth: null }, '2036-12'), true);
});

test('คัดลอกจากเดือนก่อน: แทนที่ / เพิ่มต่อท้าย, offDays เป็น 0, id ใหม่', async () => {
  const s = fresh();
  await s.saveMonth('2026-10', { salarySatang: 3100000, items: [park({ offDays: 3 }), tax({ templateId: 'tpl_t' })] });
  const prev = await findPrevSaved(s, '2026-11');
  assert.equal(prev.key, '2026-10');

  const cur = { salarySatang: 3000000, items: [tax({ id: 'itm_x', templateId: 'tpl_t' })] };
  const rep = copyFromPrevious(cur, prev.doc, 'replace');
  assert.equal(rep.salarySatang, 3100000);
  assert.equal(rep.items.length, 2);
  assert.equal(rep.items[0].offDays, 0);
  assert.notEqual(rep.items[0].id, 'itm_park');

  const app = copyFromPrevious(cur, prev.doc, 'append');
  assert.equal(app.items.length, 2, 'รายการประจำที่มีอยู่แล้วต้องไม่ซ้ำ');
  assert.equal(app.items[0].id, 'itm_x');
  assert.equal(app.items[1].name, 'ค่าจอดรถ');
});

test('เปิด "ใช้ทุกเดือน": สร้าง template และเพิ่มลงเดือนถัดไปที่บันทึกแล้ว', async () => {
  const s = fresh();
  await s.saveMonth('2026-10', { salarySatang: 3000000, items: [] });
  await s.saveMonth('2026-12', { salarySatang: 3000000, items: [] });
  await s.saveMonth('2027-03', { salarySatang: 3000000, items: [] });

  const item = await enableRecurring(s, '2026-11', tax(), '2027-01');
  assert.ok(item.templateId);
  const [tpl] = await s.listTemplates();
  assert.equal(tpl.startMonth, '2026-11');
  assert.equal(tpl.endMonth, '2027-01');
  assert.equal(tpl.offDays, undefined);

  assert.equal((await s.getMonth('2026-10')).items.length, 0, 'เดือนก่อนหน้าห้ามเปลี่ยน');
  assert.equal((await s.getMonth('2026-12')).items[0].templateId, item.templateId);
  assert.equal((await s.getMonth('2027-03')).items.length, 0, 'เลย endMonth แล้ว');
});

test('แก้รายการประจำ "เดือนนี้และเดือนถัดไป": แก้ template + เดือนถัดไป คง offDays/id เดิม', async () => {
  const s = fresh();
  await s.saveMonth('2026-10', { salarySatang: 3000000, items: [] });
  const item = await enableRecurring(s, '2026-10', park({ offDays: 0 }));
  await s.saveMonth('2026-10', { salarySatang: 3000000, items: [item] });
  const decItem = { ...(await loadMonth(s, '2026-12')).items[0], offDays: 2, id: 'itm_dec' };
  await s.saveMonth('2026-12', { salarySatang: 3000000, items: [decItem] });

  await updateRecurring(s, '2026-11', { ...item, rateSatang: 6000 }, undefined);
  const dec = (await s.getMonth('2026-12')).items[0];
  assert.equal(dec.rateSatang, 6000);
  assert.equal(dec.offDays, 2);
  assert.equal(dec.id, 'itm_dec');
  assert.equal((await s.getMonth('2026-10')).items[0].rateSatang, 5000, 'เดือนก่อนหน้าห้ามเปลี่ยน');
  const [tpl] = await s.listTemplates();
  assert.equal(tpl.rateSatang, 6000);
  assert.equal(tpl.startMonth, '2026-10');
});

test('แก้ endMonth ให้สั้นลง: เอารายการออกจากเดือนที่เลยไป', async () => {
  const s = fresh();
  const item = await enableRecurring(s, '2026-11', tax());
  for (const k of ['2026-12', '2027-01', '2027-02']) {
    await s.saveMonth(k, (await loadMonth(s, k)));
  }
  await updateRecurring(s, '2026-11', item, '2026-12');
  assert.equal((await s.getMonth('2026-12')).items.length, 1);
  assert.equal((await s.getMonth('2027-01')).items.length, 0);
  assert.equal((await s.getMonth('2027-02')).items.length, 0);
});

test('ลบแบบ "หยุดตั้งแต่เดือนนี้": endMonth = เดือนก่อน, ลบจากเดือนนี้และถัดไป', async () => {
  const s = fresh();
  const item = await enableRecurring(s, '2026-09', tax());
  for (const k of ['2026-09', '2026-10', '2026-11', '2026-12']) {
    const m = await loadMonth(s, k);
    if (k === '2026-09') m.items = [item];
    await s.saveMonth(k, m);
  }
  await stopRecurring(s, item.templateId, '2026-10'); // ลบตั้งแต่ 2026-11
  assert.equal((await s.getMonth('2026-10')).items.length, 1);
  assert.equal((await s.getMonth('2026-11')).items.length, 0);
  assert.equal((await s.getMonth('2026-12')).items.length, 0);
  assert.equal((await s.listTemplates())[0].endMonth, '2026-10');
  assert.equal((await loadMonth(s, '2027-01')).items.length, 0, 'เดือนใหม่ต้องไม่มีรายการนี้');
});

test('หยุดตั้งแต่เดือนแรกของ template: ลบ template ทิ้ง', async () => {
  const s = fresh();
  const item = await enableRecurring(s, '2026-11', tax());
  await stopRecurring(s, item.templateId, '2026-10');
  assert.equal((await s.listTemplates()).length, 0);
});

test('สรุปทั้งปี: นับเฉพาะเดือนที่บันทึก, รวมรายหักตามชื่อ (trim) เรียงมากไปน้อย', async () => {
  const s = fresh();
  const items = [
    { id: 'a', name: 'ค่าล่วงเวลา (OT)', kind: 'income', method: 'fixed', anchor: 'amount', amountSatang: 250000, base: 'salary' },
    park({ id: 'b' }),
    { id: 'c', name: 'กองทุนสำรองเลี้ยงชีพ', kind: 'deduct', method: 'fixed', anchor: 'percent', bp: 300, base: 'salary' },
    tax({ id: 'd' }),
  ];
  await s.saveMonth('2026-11', { salarySatang: 3000000, items });
  await s.saveMonth('2026-10', { salarySatang: 3000000, items: [tax({ name: '  ภาษีหัก ณ ที่จ่าย ' })] });
  await s.saveMonth('2025-12', { salarySatang: 3000000, items: [] }); // ปีอื่น

  const y = await loadYear(s, 2026);
  assert.equal(y.savedCount, 2);
  assert.equal(y.months.length, 12);
  assert.equal(y.months[0].saved, false);
  assert.equal(y.months[10].netSatang, 2940000);
  assert.equal(y.grossSatang, 3250000 + 3000000);
  assert.equal(y.deductSatang, 310000 + 120000);
  assert.equal(y.netSatang, 2940000 + 2880000);
  assert.deepEqual(y.deductByName.map((r) => [r.name, r.amountSatang]), [
    ['ภาษีหัก ณ ที่จ่าย', 240000],
    ['ค่าจอดรถ', 100000],
    ['กองทุนสำรองเลี้ยงชีพ', 90000],
  ]);
  assert.equal(await firstDataYear(s), 2025);
  assert.equal(summarizeYear(2030, {}).savedCount, 0);
});

test('สถานะชำระ: คัดลอกเดือนก่อนแล้วเป็น "ยังไม่ชำระ", แก้รายการประจำแล้วสถานะเดือนถัดไปไม่หาย', async () => {
  const next = copyFromPrevious({ salarySatang: 0, items: [] }, { salarySatang: 3000000, items: [tax({ paid: true })] });
  assert.equal(next.items[0].paid, undefined);

  const s = fresh();
  const item = await enableRecurring(s, '2026-11', tax());
  await s.saveMonth('2026-11', { salarySatang: 3000000, items: [item] });
  const dec = await loadMonth(s, '2026-12');
  dec.items[0].paid = true;
  await s.saveMonth('2026-12', { salarySatang: 3000000, items: dec.items });
  await updateRecurring(s, '2026-11', { ...item, amountSatang: 130000 }, null);
  const after = await s.getMonth('2026-12');
  assert.equal(after.items[0].amountSatang, 130000);
  assert.equal(after.items[0].paid, true);
});

// ---------- เพิ่มจากรีวิว ----------

test('updateRecurring: ขยาย endMonth → เดือนที่บันทึกแล้วซึ่งเคยอยู่นอกช่วงได้รายการเพิ่ม', async () => {
  const s = fresh();
  for (const k of ['2026-01', '2026-02', '2026-03', '2026-04']) await s.saveMonth(k, { salarySatang: 3000000, items: [] });
  const item = await enableRecurring(s, '2026-01', tax(), '2026-02');
  await s.saveMonth('2026-01', { salarySatang: 3000000, items: [item] });
  const count = async () => Promise.all(['2026-02', '2026-03', '2026-04'].map(async (k) => (await s.getMonth(k)).items.length));
  assert.deepEqual(await count(), [1, 0, 0]);

  await updateRecurring(s, '2026-01', item, '2026-03'); // ขยาย 1 เดือน
  assert.deepEqual(await count(), [1, 1, 0]);
  await updateRecurring(s, '2026-01', item, null); // ไม่มีวันสิ้นสุด
  assert.deepEqual(await count(), [1, 1, 1]);
  await updateRecurring(s, '2026-01', item, null); // ทำซ้ำต้องไม่เพิ่มซ้ำ
  assert.deepEqual(await count(), [1, 1, 1]);
  await updateRecurring(s, '2026-01', item, '2026-02'); // ย่อกลับ
  assert.deepEqual(await count(), [1, 0, 0]);
  assert.equal((await s.listTemplates())[0].endMonth, '2026-02');
});

test('updateRecurring: เดือนในช่วงเดิมที่ผู้ใช้ลบ "เฉพาะเดือนนี้" ไว้ ต้องไม่ได้รายการคืน', async () => {
  const s = fresh();
  for (const k of ['2026-01', '2026-02', '2026-03']) await s.saveMonth(k, { salarySatang: 3000000, items: [] });
  const item = await enableRecurring(s, '2026-01', tax(), null);
  await s.saveMonth('2026-02', { salarySatang: 3000000, items: [] }); // ลบเฉพาะเดือน 02
  await updateRecurring(s, '2026-01', { ...item, amountSatang: 130000 }, null);
  assert.equal((await s.getMonth('2026-02')).items.length, 0);
  assert.equal((await s.getMonth('2026-03')).items[0].amountSatang, 130000);
});

test('copyFromPrevious: template ที่ไม่ใช้งานในเดือนปลายทางแล้ว → กลายเป็นรายการธรรมดา', async () => {
  const s = fresh();
  const ended = await enableRecurring(s, '2026-01', tax({ id: 'e' }), '2026-02');
  const live = await enableRecurring(s, '2026-01', park({ id: 'l' }), null);
  const prev = { salarySatang: 3000000, items: [{ ...ended, paid: true }, live, tax({ id: 'gone', templateId: 'tpl_deleted' })] };

  const active = await activeTemplateIds(s, '2026-03');
  const next = copyFromPrevious({ salarySatang: 0, items: [] }, prev, 'replace', active);
  assert.deepEqual(next.items.map((i) => i.templateId), [null, live.templateId, null]);
  assert.equal(next.items[0].paid, undefined);
  assert.notEqual(next.items[0].id, ended.id);

  // append: รายการที่หมดอายุไม่ถือเป็นรายการประจำซ้ำ จึงถูกเพิ่มเป็นรายการธรรมดา
  const cur = { salarySatang: 0, items: [{ ...live, id: 'cur_l' }] };
  const app = copyFromPrevious(cur, prev, 'append', active);
  assert.deepEqual(app.items.map((i) => i.templateId), [live.templateId, null, null]);

  // ไม่ส่ง activeTplIds = คง templateId ไว้ (ใช้กับโค้ดเดิม)
  assert.equal(copyFromPrevious({ items: [] }, prev).items[0].templateId, ended.templateId);
});

test('copyFromPrevious append: รายการประจำซ้ำไม่ถูกเพิ่ม, รายการธรรมดาชื่อซ้ำยังเพิ่ม, เงินเดือนใช้ของเดือนก่อน', () => {
  const cur = { salarySatang: 2000000, items: [tax({ id: 'x1', templateId: 'tpl_t' }), park({ id: 'x2' })] };
  const prev = { salarySatang: 3000000, items: [tax({ templateId: 'tpl_t' }), park({ offDays: 4 }), tax({ templateId: 'tpl_other' })] };
  const r = copyFromPrevious(cur, prev, 'append');
  assert.equal(r.salarySatang, 3000000);
  assert.deepEqual(r.items.map((i) => i.templateId), ['tpl_t', null, null, 'tpl_other']);
  assert.equal(r.items[2].offDays, 0);
  assert.equal(new Set(r.items.map((i) => i.id)).size, 4, 'id ไม่ซ้ำ');
});

test('stopRecurring เมื่อ lastMonth อยู่หลัง endMonth เดิม: ต้องไม่ยืด endMonth ออกไป', async () => {
  const s = fresh();
  const item = await enableRecurring(s, '2026-01', tax(), '2026-03');
  await stopRecurring(s, item.templateId, '2026-06');
  assert.equal((await s.listTemplates())[0].endMonth, '2026-03');
  assert.equal((await loadMonth(s, '2026-05')).items.length, 0);
});

test('เดือนที่ข้อมูลเสีย (getMonth คืน null): enable/update/stopRecurring ข้ามไป ไม่ throw', async () => {
  const storage = createMemoryStorage();
  const s = createLocalStore(storage, 'test');
  await s.saveMonth('2026-03', { salarySatang: 3000000, items: [] });
  storage.setItem('test:months:2026-02', '{bad json');
  assert.deepEqual(await s.listMonthKeys(), ['2026-02', '2026-03']);
  assert.equal(await s.getMonth('2026-02'), null);

  const item = await enableRecurring(s, '2026-01', tax());
  assert.equal((await s.getMonth('2026-03')).items.length, 1);
  await updateRecurring(s, '2026-01', { ...item, amountSatang: 1 }, null);
  assert.equal((await s.getMonth('2026-03')).items[0].amountSatang, 1);
  await stopRecurring(s, item.templateId, '2026-01');
  assert.equal((await s.getMonth('2026-03')).items.length, 0);
  assert.equal((await findPrevSaved(s, '2026-03')), null, 'เดือนเสียไม่ถูกใช้เป็นเดือนก่อนหน้า');
});

test('loadMonth ข้ามปี: ร่าง ม.ค. ใช้เงินเดือนจาก ธ.ค. ปีก่อน / ข้ามหลายปี', async () => {
  const s = fresh();
  await s.saveMonth('2024-06', { salarySatang: 2500000, items: [] });
  await s.saveMonth('2025-12', { salarySatang: 3000000, items: [] });
  assert.equal((await loadMonth(s, '2026-01')).salarySatang, 3000000);
  assert.equal((await loadMonth(s, '2025-03')).salarySatang, 2500000);
  assert.equal((await loadMonth(s, '2024-01')).salarySatang, 0);
});

test('summarizeYear: kind ไม่รู้จักไม่ถูกนับ, ชื่อรายการ trim แล้วรวมกัน, ชื่อว่างใช้ชื่อแทน', () => {
  const y = summarizeYear(2026, {
    '2026-01': { salarySatang: 3000000, items: [tax({ name: ' ภาษี' }), { ...tax({ name: 'ลึกลับ' }), kind: 'x' }] },
    '2026-02': { salarySatang: 3000000, items: [tax({ name: 'ภาษี  ' }), tax({ name: '   ', amountSatang: 100 })] },
  });
  assert.equal(y.deductSatang, 120000 * 2 + 100);
  assert.deepEqual(y.deductByName.map((r) => r.amountSatang), [240000, 100]);
  assert.equal(y.deductByName[0].name, 'ภาษี');
  assert.ok(y.deductByName[1].name.trim().length > 0, 'ชื่อว่างต้องแสดงเป็นชื่อแทน');
  assert.ok(!y.deductByName.some((r) => r.name === 'ลึกลับ'));
});
