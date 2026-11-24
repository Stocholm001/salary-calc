// csv.js — ส่งออก CSV สรุปปี / สำรองข้อมูล (ข้อ 8 ของ SPEC)
// ฟังก์ชันล้วน ๆ ไม่แตะ DOM: สร้างข้อความ CSV (UTF-8 มี BOM, คั่นด้วย comma, ขึ้นบรรทัดด้วย CRLF)
// ตัวเลขเงิน/% เขียนแบบไม่มี comma คั่นหลัก (เช่น 29400.00) เพื่อให้ Excel อ่านเป็นตัวเลข

import { calcMonth, pctOfSalary } from './calc.js';
import { monthName, yearNumber, weekdaysLabel, parseMonthKey, DEFAULT_WEEKDAYS } from './dates.js';
import { t } from './i18n.js';

export const BOM = '﻿';

/** สตางค์ → "1234.50" / "-1234.50" */
export function csvMoney(satang) {
  const neg = satang < 0;
  const abs = BigInt(Math.abs(satang));
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** bp → "10.33", null → "" */
export function csvPct(bp) {
  if (bp == null) return '';
  const neg = bp < 0;
  const abs = Math.abs(bp);
  return `${neg ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** % แบบสั้นในข้อความ: 300 → "3", 150 → "1.5" */
const shortPct = (bp) => {
  const frac = String(Math.abs(bp) % 100).padStart(2, '0').replace(/0+$/, '');
  return `${bp < 0 ? '-' : ''}${Math.trunc(Math.abs(bp) / 100)}${frac ? '.' + frac : ''}`;
};

/**
 * ค่าในช่องเดียว: ใส่ "" ถ้ามี comma, ", ขึ้นบรรทัด
 * ข้อความที่ขึ้นต้นด้วย = + - @ (เช่น ชื่อรายการ) ใส่ ' นำหน้า กัน Excel ตีความเป็นสูตร
 * ตัวเลขที่เราสร้างเอง (ส่งมาเป็น { num }) ไม่ใส่ '
 */
export function csvCell(v) {
  if (v == null) return '';
  let s;
  if (typeof v === 'object' && 'num' in v) s = String(v.num);
  else {
    s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const num = (s) => ({ num: s });

/** แถว → ข้อความ CSV ทั้งไฟล์ (มี BOM) */
export function toCsv(rows) {
  return BOM + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---------- สรุปปี ----------

/**
 * CSV สรุปปี: เฉพาะเดือนที่บันทึกแล้ว + แถวรวมท้ายไฟล์
 * @param summary ผลจาก summarizeYear()
 */
export function yearCsv(summary) {
  const rows = [[
    t('csv.month'), t('csv.salary'), t('csv.income'), t('csv.deduct'), t('csv.net'), t('csv.deductPct'),
  ]];
  for (const m of summary.months) {
    if (!m.saved) continue;
    rows.push([
      `${monthName(m.month)} ${yearNumber(summary.year)}`,
      num(csvMoney(m.salarySatang)),
      num(csvMoney(m.incomeSatang)),
      num(csvMoney(m.deductSatang)),
      num(csvMoney(m.netSatang)),
      num(csvPct(m.deductPctBp)),
    ]);
  }
  if (summary.savedCount > 0) {
    const income = summary.grossSatang - summary.salarySatang;
    rows.push([
      t('csv.total'),
      num(csvMoney(summary.salarySatang)),
      num(csvMoney(income)),
      num(csvMoney(summary.deductSatang)),
      num(csvMoney(summary.netSatang)),
      num(csvPct(pctOfSalary(summary.deductSatang, summary.salarySatang))),
    ]);
  }
  return toCsv(rows);
}

/** ชื่อไฟล์สรุปปี: salary-2569.csv (ภาษาอังกฤษใช้ ค.ศ.) */
export const yearCsvFilename = (ceYear) => `salary-${yearNumber(ceYear)}.csv`;

// ---------- สำรองข้อมูลทั้งหมด ----------

/** ข้อความ "ค่าที่ตั้ง" ของรายการ */
export function settingText(item) {
  if (item.method === 'daily') {
    const parts = [t('csv.perDay', { rate: csvMoney(item.rateSatang ?? 0) }), weekdaysLabel(item.weekdays ?? DEFAULT_WEEKDAYS)];
    if ((item.offDays ?? 0) > 0) parts.push(t('csv.off', { n: item.offDays }));
    return parts.join(' · ');
  }
  const cap = item.capSatang != null ? ` (${t('csv.cap', { cap: csvMoney(item.capSatang) })})` : '';
  if (item.anchor === 'percent') {
    const base = t(item.kind === 'deduct' && item.base === 'gross' ? 'fmt.ofGross' : 'fmt.ofSalary');
    return `${shortPct(item.bp ?? 0)}% ${base}${cap}`;
  }
  return csvMoney(item.amountSatang ?? 0) + cap;
}

/**
 * CSV สำรองข้อมูล: แถวละ 1 รายการ เดือนที่ไม่มีรายการเลยใส่ 1 แถวที่มีแค่เงินเดือน
 * จำนวนเงิน: รายรับเป็นบวก รายหักเป็นลบ
 * @param months [{ key: "YYYY-MM", doc: { salarySatang, items } }] เรียงจากเก่าไปใหม่
 */
export function backupCsv(months) {
  const rows = [[
    t('csv.monthKey'), t('csv.salary'), t('csv.kind'), t('csv.name'), t('csv.method'),
    t('csv.setting'), t('csv.days'), t('csv.amount'), t('csv.pctOfSalary'), t('csv.recurring'), t('csv.paid'),
  ]];
  for (const { key, doc } of months) {
    const p = parseMonthKey(key);
    if (!p || !doc) continue;
    const r = calcMonth({ year: p.year, month: p.month, salarySatang: doc.salarySatang, items: doc.items ?? [] });
    const salary = num(csvMoney(r.salarySatang));
    if (!r.items.length) {
      rows.push([key, salary, '', '', '', '', '', '', '', '', '']);
      continue;
    }
    for (const { item, result } of r.items) {
      if (!result) continue; // kind ไม่รู้จัก
      const signed = item.kind === 'deduct' ? -result.amountSatang : result.amountSatang;
      rows.push([
        key,
        salary,
        t(item.kind === 'deduct' ? 'kind.deduct' : 'kind.income'),
        (item.name ?? '').trim(),
        t(item.method === 'daily' ? 'sheet.methodDaily' : 'sheet.methodFixed'),
        settingText(item),
        item.method === 'daily' ? num(String(result.effectiveDays)) : '',
        num(csvMoney(signed)),
        num(csvPct(result.pctOfSalaryBp)),
        item.templateId ? t('csv.yes') : '',
        item.kind === 'deduct' ? t(item.paid ? 'paid.yes' : 'paid.no') : '',
      ]);
    }
  }
  return toCsv(rows);
}

/** ชื่อไฟล์สำรอง: salary-backup-20261124.csv (วันที่ตามเวลาเครื่อง) */
export function backupFilename(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `salary-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}.csv`;
}
