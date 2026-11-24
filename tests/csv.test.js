// tests/csv.test.js — ส่งออก CSV สรุปปี / สำรองข้อมูล (ข้อ 8)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOM, csvMoney, csvPct, csvCell, toCsv, yearCsv, yearCsvFilename,
  backupCsv, backupFilename, settingText,
} from '../js/csv.js';
import { summarizeYear } from '../js/months.js';
import { setLang } from '../js/i18n.js';

afterEach(() => setLang('th', null));

// ข้อมูลตัวอย่างข้อ 1 ของ SPEC (พ.ย. 2569 → สุทธิ 29,400.00)
const sample = () => ({
  salarySatang: 3000000,
  items: [
    { id: 'a', name: 'ค่าล่วงเวลา (OT)', kind: 'income', method: 'fixed', anchor: 'amount', amountSatang: 250000, base: 'salary', capSatang: null },
    { id: 'b', name: 'ค่าจอดรถ', kind: 'deduct', method: 'daily', rateSatang: 5000, weekdays: [1, 2, 3, 4, 5], offDays: 1, templateId: 'tpl_park' },
    { id: 'c', name: 'กองทุนสำรองเลี้ยงชีพ', kind: 'deduct', method: 'fixed', anchor: 'percent', bp: 300, base: 'salary', capSatang: null, paid: true },
    { id: 'd', name: 'ภาษีหัก ณ ที่จ่าย', kind: 'deduct', method: 'fixed', anchor: 'amount', amountSatang: 120000, base: 'salary', capSatang: null },
  ],
});

const lines = (csv) => csv.slice(BOM.length).split('\r\n').filter(Boolean);

test('ตัวเลข: ไม่มี comma คั่นหลัก, ลบใช้ -', () => {
  assert.equal(csvMoney(2940000), '29400.00');
  assert.equal(csvMoney(-200000), '-2000.00');
  assert.equal(csvMoney(5), '0.05');
  assert.equal(csvPct(1033), '10.33');
  assert.equal(csvPct(null), '');
});

test('csvCell: escape comma/quote/ขึ้นบรรทัด และกันสูตร Excel', () => {
  assert.equal(csvCell('ค่าจอดรถ'), 'ค่าจอดรถ');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('a\nb'), '"a\nb"');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('-แปลก'), "'-แปลก");
  assert.equal(csvCell({ num: '-2000.00' }), '-2000.00');
  assert.equal(csvCell(null), '');
});

test('toCsv: ขึ้นต้นด้วย BOM และใช้ CRLF', () => {
  const s = toCsv([['ก', 'ข'], ['1', '2']]);
  assert.ok(s.startsWith('﻿'));
  assert.equal(s, '﻿ก,ข\r\n1,2\r\n');
});

test('สรุปปี: เฉพาะเดือนที่บันทึก + แถวรวม', () => {
  const summary = summarizeYear(2026, {
    '2026-11': sample(),
    '2026-12': { salarySatang: 3000000, items: [] },
  });
  const rows = lines(yearCsv(summary));
  assert.equal(rows[0], 'เดือน,เงินเดือน,รายรับเพิ่ม,รายหัก,สุทธิ,หัก % ของเงินเดือน');
  assert.equal(rows[1], 'พฤศจิกายน 2569,30000.00,2500.00,3100.00,29400.00,10.33');
  assert.equal(rows[2], 'ธันวาคม 2569,30000.00,0.00,0.00,30000.00,0.00');
  assert.equal(rows[3], 'รวมทั้งปี,60000.00,2500.00,3100.00,59400.00,5.17');
  assert.equal(rows.length, 4);
  assert.equal(yearCsvFilename(2026), 'salary-2569.csv');
});

test('สรุปปี: ยังไม่มีเดือนที่บันทึก มีแค่หัวตาราง', () => {
  assert.equal(lines(yearCsv(summarizeYear(2027, {}))).length, 1);
});

test('สรุปปี: เงินเดือน 0 → % ว่าง', () => {
  const rows = lines(yearCsv(summarizeYear(2026, { '2026-01': { salarySatang: 0, items: [] } })));
  assert.equal(rows[1], 'มกราคม 2569,0.00,0.00,0.00,0.00,');
});

test('สำรองข้อมูล: แถวละรายการ รายหักเป็นลบ และเดือนว่างยังมีเงินเดือน', () => {
  const rows = lines(backupCsv([
    { key: '2026-10', doc: { salarySatang: 2900000, items: [] } },
    { key: '2026-11', doc: sample() },
  ]));
  assert.equal(rows[0], 'เดือน(YYYY-MM),เงินเดือน,ประเภท,ชื่อ,วิธีคิด,ค่าที่ตั้ง,จำนวนวันที่คิด,จำนวนเงิน,% ของเงินเดือน,ทุกเดือน,สถานะการชำระ');
  assert.equal(rows[1], '2026-10,29000.00,,,,,,,,,');
  assert.equal(rows[2], '2026-11,30000.00,รายรับ,ค่าล่วงเวลา (OT),จำนวนเงิน / %,2500.00,,2500.00,8.33,,');
  assert.equal(rows[3], '2026-11,30000.00,รายหัก,ค่าจอดรถ,ต่อวัน,50.00 ต่อวัน · จ–ศ · หยุด 1 วัน,20,-1000.00,3.33,ใช่,ยังไม่ชำระ');
  assert.equal(rows[4], '2026-11,30000.00,รายหัก,กองทุนสำรองเลี้ยงชีพ,จำนวนเงิน / %,3% ของเงินเดือน,,-900.00,3.00,,ชำระแล้ว');
  assert.equal(rows[5], '2026-11,30000.00,รายหัก,ภาษีหัก ณ ที่จ่าย,จำนวนเงิน / %,1200.00,,-1200.00,4.00,,ยังไม่ชำระ');
  assert.equal(rows.length, 6);
});

test('ค่าที่ตั้ง: % ฐานรายรับรวมพร้อมเพดาน', () => {
  assert.equal(
    settingText({ kind: 'deduct', method: 'fixed', anchor: 'percent', bp: 500, base: 'gross', capSatang: 87500 }),
    '5% ของรายรับรวม (สูงสุด 875.00)',
  );
  assert.equal(settingText({ kind: 'deduct', method: 'fixed', anchor: 'percent', bp: 150, base: 'salary' }), '1.5% ของเงินเดือน');
});

test('ชื่อไฟล์สำรอง: salary-backup-YYYYMMDD.csv', () => {
  assert.equal(backupFilename(new Date(2026, 10, 4)), 'salary-backup-20261104.csv');
});

test('ภาษาอังกฤษ: หัวตารางและชื่อไฟล์เป็น ค.ศ.', () => {
  setLang('en', null);
  const rows = lines(yearCsv(summarizeYear(2026, { '2026-11': sample() })));
  assert.equal(rows[0], 'Month,Salary,Extra income,Deductions,Net,Deductions % of salary');
  assert.equal(rows[1], 'November 2026,30000.00,2500.00,3100.00,29400.00,10.33');
  assert.equal(yearCsvFilename(2026), 'salary-2026.csv');
});

test('ใส่ comma ระหว่างพิมพ์ และคงตำแหน่งเคอร์เซอร์', async () => {
  const { formatMoneyTyping: f } = await import('../js/format.js');
  assert.deepEqual(f('1000'), { value: '1,000', caret: 5 });
  assert.deepEqual(f('1234567.5'), { value: '1,234,567.5', caret: 11 });
  assert.deepEqual(f('1,0000'), { value: '10,000', caret: 6 });       // พิมพ์ 0 ต่อท้าย 1,000
  assert.deepEqual(f('1,00', 3), { value: '100', caret: 2 });         // ลบ 0 ตัวหนึ่ง เคอร์เซอร์อยู่หลัง "10"
  assert.deepEqual(f('15,000', 1), { value: '15,000', caret: 1 });
  assert.deepEqual(f('12a3'), { value: '123', caret: 3 });            // ตัดตัวที่ไม่ใช่ตัวเลข
  assert.deepEqual(f('1.2.3'), { value: '1.23', caret: 4 });          // จุดทศนิยมได้ตัวเดียว
  assert.deepEqual(f('007'), { value: '7', caret: 1 });
  assert.deepEqual(f('0.5'), { value: '0.5', caret: 3 });
  assert.deepEqual(f(''), { value: '', caret: 0 });
});

test('csvMoney: รับเฉพาะ integer (ข้อมูลต้องผ่าน sanitize ก่อน)', () => {
  assert.throws(() => csvMoney(1.5), RangeError);
  assert.throws(() => csvMoney(NaN), RangeError);
  assert.equal(csvMoney(-5), '-0.05');
});
