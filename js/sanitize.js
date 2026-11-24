// sanitize.js — ทำให้ข้อมูลที่อ่านจาก store อยู่ในรูปที่ถูกต้องก่อนถึงลอจิก/UI
// (ข้อมูลใน localStorage/Firestore อาจเสียหรือมาจากโค้ดเวอร์ชันเก่า)
// ไม่แตะ DOM/Firebase

import { toSafeInt, resolveBase } from './calc.js';
import { normalizeWeekdays, parseMonthKey, DEFAULT_WEEKDAYS } from './dates.js';
import { newId } from './months.js';

const KINDS = new Set(['income', 'deduct']);
const METHODS = new Set(['fixed', 'daily']);

/**
 * รายการเดียว → item ที่ถูกต้อง หรือ null ถ้าใช้ไม่ได้ (ไม่ใช่อ็อบเจกต์ / kind หรือ method ไม่รู้จัก)
 * ตัวเลขเงิน/bp/วัน เป็น integer ≥ 0 เสมอ
 */
export function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!KINDS.has(raw.kind) || !METHODS.has(raw.method)) return null;

  const item = {
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('itm'),
    name: String(raw.name ?? ''),
    templateId: typeof raw.templateId === 'string' && raw.templateId ? raw.templateId : null,
  };
  if (raw.paid === true && raw.kind === 'deduct') item.paid = true;
  else delete item.paid;

  if (raw.method === 'daily') {
    item.rateSatang = toSafeInt(raw.rateSatang);
    item.weekdays = Array.isArray(raw.weekdays)
      ? normalizeWeekdays(raw.weekdays.map(Number))
      : [...DEFAULT_WEEKDAYS];
    item.offDays = toSafeInt(Math.trunc(Number(raw.offDays ?? 0)));
  } else {
    item.anchor = raw.anchor === 'percent' ? 'percent' : 'amount';
    item.amountSatang = toSafeInt(raw.amountSatang, null);
    item.bp = toSafeInt(raw.bp, null);
    item.base = resolveBase(raw);
    item.capSatang = toSafeInt(raw.capSatang, null);
  }
  return item;
}

/** เอกสารเดือน → { salarySatang, items, updatedAt } หรือ null ถ้าไม่ใช่อ็อบเจกต์ */
export function sanitizeMonthDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const items = Array.isArray(raw.items) ? raw.items.map(sanitizeItem).filter(Boolean) : [];
  return {
    salarySatang: toSafeInt(raw.salarySatang),
    items,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : null,
  };
}

/** template → template ที่ถูกต้อง หรือ null (ต้องมี id และ startMonth ที่ถูกต้อง) */
export function sanitizeTemplate(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || !parseMonthKey(raw.startMonth ?? '')) return null;
  const item = sanitizeItem(raw);
  if (!item) return null;
  delete item.offDays;
  delete item.templateId;
  delete item.paid;
  return {
    ...item,
    id: raw.id,
    startMonth: raw.startMonth,
    endMonth: parseMonthKey(raw.endMonth ?? '') ? raw.endMonth : null,
  };
}
