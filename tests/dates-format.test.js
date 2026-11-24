// tests/dates-format.test.js — เทสต์ dates.js และ format.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toBE, toCE, daysInMonth, isoWeekday, weekdaysLabel, monthLabel,
  monthKey, parseMonthKey, addMonths, yearOptions, countDays,
} from '../js/dates.js';
import {
  formatMoney, formatMoneyCompact, formatPct, formatPctCompact, maskMoney, HIDDEN,
  parseMoney, parsePercent, parseSalaryInput, dailySummaryLines, negativeNetMessage, methodBadge,
} from '../js/format.js';
import { calcItem } from '../js/calc.js';

test('แปลง พ.ศ./ค.ศ.', () => {
  assert.equal(toBE(2026), 2569);
  assert.equal(toCE(2569), 2026);
});

test('daysInMonth และ isoWeekday', () => {
  assert.equal(daysInMonth(2026, 11), 30);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(isoWeekday(2026, 11, 1), 7); // 1 พ.ย. 2026 เป็นวันอาทิตย์
  assert.equal(isoWeekday(2026, 11, 2), 1);
});

test('weekdaysLabel', () => {
  assert.equal(weekdaysLabel([1, 2, 3, 4, 5]), 'จ–ศ');
  assert.equal(weekdaysLabel([7, 6, 5, 4, 3, 2, 1]), 'ทุกวัน');
  assert.equal(weekdaysLabel([6, 7]), 'ส–อา');
  assert.equal(weekdaysLabel([5, 1, 3]), 'จ พ ศ');
  assert.equal(weekdaysLabel([4]), 'พฤ');
});

test('monthLabel / monthKey / addMonths', () => {
  assert.equal(monthLabel(2026, 11), 'พฤศจิกายน 2569');
  assert.equal(monthKey(2026, 3), '2026-03');
  assert.deepEqual(parseMonthKey('2026-11'), { year: 2026, month: 11 });
  assert.equal(parseMonthKey('2026-13'), null);
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
});

test('yearOptions: min(ปีแรกที่มีข้อมูล, ปีปัจจุบัน) ถึง ปีปัจจุบัน + 10', () => {
  const y = yearOptions(2026);
  assert.equal(y[0], 2026);
  assert.equal(y.at(-1), 2036);
  assert.equal(y.length, 11);
  assert.equal(yearOptions(2026, 2024)[0], 2024);
  assert.equal(yearOptions(2026, 2030)[0], 2026);
});

test('formatMoney', () => {
  assert.equal(formatMoney(2940000), '29,400.00');
  assert.equal(formatMoney(5), '0.05');
  assert.equal(formatMoney(123456789), '1,234,567.89');
  assert.equal(formatMoney(250000, { sign: 'always' }), '+2,500.00');
  assert.equal(formatMoney(-100000, { sign: 'always' }), '−1,000.00');
  assert.equal(formatMoney(-100000, { sign: 'none' }), '1,000.00');
  assert.equal(formatMoneyCompact(5000), '50');
  assert.equal(formatMoneyCompact(5050), '50.50');
});

test('formatPct / formatPctCompact', () => {
  assert.equal(formatPct(1033), '10.33%');
  assert.equal(formatPct(5), '0.05%');
  assert.equal(formatPct(null), '—');
  assert.equal(formatPctCompact(300), '3%');
  assert.equal(formatPctCompact(150), '1.5%');
  assert.equal(formatPctCompact(325), '3.25%');
});

test('ซ่อนตัวเลข', () => {
  assert.equal(maskMoney('29,400.00', true), HIDDEN);
  assert.equal(maskMoney('29,400.00', false), '29,400.00');
  assert.equal(HIDDEN, '••••••');
});

test('parseMoney / parsePercent ไม่ผ่าน float', () => {
  assert.equal(parseMoney('30,000'), 3000000);
  assert.equal(parseMoney('1000.5'), 100050);
  assert.equal(parseMoney('0.29'), 29); // float: 0.29 * 100 = 28.999…
  assert.equal(parseMoney('.5'), 50);
  assert.equal(parseMoney('1.234'), null);
  assert.equal(parseMoney('-5'), null);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(parsePercent('3.25'), 325);
  assert.equal(parsePercent('3'), 300);
  assert.equal(parsePercent('3.255'), null);
});

test('กล่องผลคำนวณต่อวัน (F04)', () => {
  const item = { kind: 'deduct', method: 'daily', rateSatang: 5000, weekdays: [1, 2, 3, 4, 5], offDays: 1 };
  const r = calcItem(item, { year: 2026, month: 11, salarySatang: 3000000 });
  assert.deepEqual(dailySummaryLines(item, r, 2026, 11), [
    'พฤศจิกายน 2569 · จ–ศ 21 วัน − หยุด 1 = 20 วัน',
    '50 × 20 = 1,000.00 บาท',
    '= 3.33% ของเงินเดือน',
  ]);
});

test('ข้อความอื่น ๆ', () => {
  assert.equal(negativeNetMessage(-200000), 'เดือนนี้รายหักมากกว่ารายรับ 2,000.00 บาท');
  assert.equal(methodBadge({ method: 'daily' }), 'ต่อวัน');
  assert.equal(methodBadge({ method: 'fixed', anchor: 'percent' }), '%');
  assert.equal(methodBadge({ method: 'fixed', anchor: 'amount' }), 'คงที่');
});

// ---------- เพิ่มจากรีวิว ----------

test('parseMoney: comma ต้องอยู่ตำแหน่งคั่นหลักที่ถูกต้อง, ช่องว่างกลางตัวเลขไม่รับ', () => {
  assert.equal(parseMoney('1,000.50'), 100050);
  assert.equal(parseMoney('1,234,567.89'), 123456789);
  assert.equal(parseMoney('12,345.6'), 1234560);
  assert.equal(parseMoney('  1,000  '), 100000, 'ช่องว่างหัวท้ายตัดทิ้ง');
  assert.equal(parseMoney('5.'), 500);
  assert.equal(parseMoney('1,5'), null, '1,5 ไม่ใช่ 15');
  assert.equal(parseMoney('1,,0'), null);
  assert.equal(parseMoney(',100'), null);
  assert.equal(parseMoney('1000,000'), null);
  assert.equal(parseMoney('1 000'), null);
  assert.equal(parseMoney('1e3'), null);
  assert.equal(parseMoney('１２'), null, 'ตัวเลข full-width');
  assert.equal(parseMoney('๑๒'), null, 'ตัวเลขไทย');
  assert.equal(parseMoney('99999999999999999'), null, 'เกิน safe integer');
  assert.equal(parseMoney(null), null);
  assert.equal(parseMoney(1500), 150000, 'รับ number ได้');
});

test('parsePercent: ไม่รับ comma เลย', () => {
  assert.equal(parsePercent('1,5'), null);
  assert.equal(parsePercent('1,000'), null);
  assert.equal(parsePercent('1.5'), 150);
  assert.equal(parsePercent(' 3 '), 300);
});

test('formatMoney: รับเฉพาะ integer (ข้อมูลต้องผ่าน sanitize ก่อน)', () => {
  assert.throws(() => formatMoney(1.5), RangeError);
  assert.throws(() => formatMoney(NaN), RangeError);
  assert.equal(formatMoney(-5), '−0.05');
});

test('countDays: weekdays ซ้ำ / นอกช่วง 1–7 / ว่าง', () => {
  assert.equal(countDays(2026, 11, [1, 1, 2, 2, 3, 4, 5]), 21, 'ค่าซ้ำนับครั้งเดียว');
  assert.equal(countDays(2026, 11, [0, 8, -1, 1, 2, 3, 4, 5]), 21, 'ค่านอกช่วงไม่ถูกนับ');
  assert.equal(countDays(2026, 11, []), 0);
  assert.equal(countDays(2024, 2, [1, 2, 3, 4, 5, 6, 7]), 29, 'ปีอธิกสุรทิน');
  assert.equal(countDays(2100, 2, [1, 2, 3, 4, 5, 6, 7]), 28, 'หารด้วย 100 ลงตัวแต่ไม่ลงตัวด้วย 400');
  assert.equal(countDays(2000, 2, [1, 2, 3, 4, 5, 6, 7]), 29, 'หารด้วย 400 ลงตัว');
});

test('yearOptions: ปีแรกที่มีข้อมูลอยู่หลังปีปัจจุบัน → เริ่มที่ปีปัจจุบัน', () => {
  const ys = yearOptions(2026, 2030);
  assert.equal(ys[0], 2026);
  assert.equal(ys.at(-1), 2036);
  assert.equal(ys.length, 11);
});

test('parseSalaryInput: ลบจนว่าง = 0 (ยอดด้านบนต้องลดตาม), ค่าผิดรูปแบบ = error ไม่เปลี่ยนค่า', () => {
  assert.deepEqual(parseSalaryInput(''), { satang: 0, error: null });
  assert.deepEqual(parseSalaryInput('   '), { satang: 0, error: null });
  assert.deepEqual(parseSalaryInput('1'), { satang: 100, error: null });
  assert.deepEqual(parseSalaryInput('30,000.50'), { satang: 3000050, error: null });
  assert.deepEqual(parseSalaryInput('1,5'), { satang: null, error: 'err.number' });
  assert.deepEqual(parseSalaryInput('abc'), { satang: null, error: 'err.number' });
});
