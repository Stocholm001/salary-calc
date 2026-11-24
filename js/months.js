// months.js — กฎของเดือนและรายการประจำ (ข้อ 6.3 ของ SPEC)
// ไม่แตะ DOM ทำงานผ่าน store ที่มี interface ตาม store/local.js

import { calcMonth, normalizeItem } from './calc.js';
import { parseMonthKey } from './dates.js';
import { t } from './i18n.js';

export const newId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ฟิลด์ของ item ที่เก็บใน template (ไม่รวม id, offDays, templateId)
const TEMPLATE_FIELDS = [
  'name', 'kind', 'method',
  'anchor', 'amountSatang', 'bp', 'base', 'capSatang',
  'rateSatang', 'weekdays',
];

function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/** template ใช้งานในเดือน key หรือไม่ */
export function isTemplateActive(tpl, key) {
  return tpl.startMonth <= key && (tpl.endMonth == null || key <= tpl.endMonth);
}

export function itemFromTemplate(tpl, id = newId('itm')) {
  const item = { id, ...pick(tpl, TEMPLATE_FIELDS), templateId: tpl.id };
  if (item.method === 'daily') item.offDays = 0;
  return normalizeItem(item);
}

/** ค่าฟิลด์จาก template ทับลงรายการเดิม โดยคง id, offDays และสถานะชำระของเดือนนั้นไว้ */
function applyTemplate(item, tpl) {
  const next = { id: item.id, ...pick(tpl, TEMPLATE_FIELDS), templateId: tpl.id };
  if (next.method === 'daily') next.offDays = item.method === 'daily' ? (item.offDays ?? 0) : 0;
  if (next.kind === 'deduct' && item.paid) next.paid = true;
  return normalizeItem(next);
}

/** เดือนล่าสุดก่อน key ที่บันทึกไว้ → { key, doc } | null */
export async function findPrevSaved(store, key) {
  const keys = await store.listMonthKeys();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i] < key) {
      const doc = await store.getMonth(keys[i]);
      if (doc) return { key: keys[i], doc };
    }
  }
  return null;
}

/**
 * เปิดเดือน: ถ้าบันทึกแล้วคืนข้อมูลจริง ถ้ายังให้คืนร่าง
 * ร่าง = เงินเดือนจากเดือนล่าสุดก่อนหน้า + รายการประจำที่ยังใช้งานอยู่ (offDays = 0)
 * @returns {{ key, saved: boolean, salarySatang, items }}
 */
export async function loadMonth(store, key) {
  const doc = await store.getMonth(key);
  if (doc) return { key, saved: true, salarySatang: doc.salarySatang ?? 0, items: doc.items ?? [] };

  const prev = await findPrevSaved(store, key);
  const templates = await store.listTemplates();
  return {
    key,
    saved: false,
    salarySatang: prev?.doc.salarySatang ?? 0,
    items: templates.filter((t) => isTemplateActive(t, key)).map((t) => itemFromTemplate(t)),
  };
}

/** id ของ template ที่ใช้งานอยู่ในเดือน key */
export async function activeTemplateIds(store, key) {
  return new Set((await store.listTemplates()).filter((t) => isTemplateActive(t, key)).map((t) => t.id));
}

/**
 * คัดลอกจากเดือนก่อน (pure)
 * mode "replace" = แทนที่ทั้งหมด, "append" = เพิ่มต่อท้าย (ข้ามรายการประจำที่มีอยู่แล้ว)
 * activeTplIds: Set ของ template ที่ใช้งานในเดือนปลายทาง (จาก activeTemplateIds)
 *   รายการประจำที่ template ไม่ใช้งานแล้วในเดือนนี้ (หมดอายุ/ถูกลบ) จะกลายเป็นรายการธรรมดา (templateId = null)
 *   ไม่ส่งมา = คง templateId ไว้ตามเดิม
 */
export function copyFromPrevious(current, prevDoc, mode = 'replace', activeTplIds = null) {
  const copied = (prevDoc.items ?? []).map((it) => {
    const c = { ...clone(it), id: newId('itm') };
    if (c.method === 'daily') c.offDays = 0;
    if (activeTplIds && c.templateId && !activeTplIds.has(c.templateId)) c.templateId = null;
    delete c.paid; // เดือนใหม่ยังไม่ได้ชำระ
    return c;
  });
  if (mode === 'append') {
    const tplIds = new Set(current.items.map((it) => it.templateId).filter(Boolean));
    return {
      salarySatang: prevDoc.salarySatang ?? current.salarySatang,
      items: [...current.items, ...copied.filter((c) => !c.templateId || !tplIds.has(c.templateId))],
    };
  }
  return { salarySatang: prevDoc.salarySatang ?? current.salarySatang, items: copied };
}

async function savedMonthsAfter(store, key) {
  return (await store.listMonthKeys()).filter((k) => k > key);
}

/**
 * เปิดสวิตช์ "ใช้ทุกเดือน": สร้าง template แล้วเพิ่มลงเดือนถัดไปที่บันทึกแล้ว
 * @returns item ที่มี templateId (ผู้เรียกต้องบันทึกเดือนปัจจุบันเอง)
 */
export async function enableRecurring(store, key, item, endMonth = null) {
  const tpl = { id: newId('tpl'), ...pick(item, TEMPLATE_FIELDS), startMonth: key, endMonth };
  await store.saveTemplate(tpl);
  for (const k of await savedMonthsAfter(store, key)) {
    if (!isTemplateActive(tpl, k)) continue;
    const doc = await store.getMonth(k);
    if (!doc || doc.items.some((it) => it.templateId === tpl.id)) continue;
    doc.items.push(itemFromTemplate(tpl));
    await store.saveMonth(k, doc);
  }
  return { ...item, templateId: tpl.id };
}

/**
 * แก้รายการประจำแบบ "เดือนนี้และเดือนถัดไป"
 * แก้ template และรายการที่มี templateId เดียวกันในเดือนถัดไปที่บันทึกแล้ว
 * เดือนที่เลยวันสิ้นสุดใหม่ ให้เอารายการออก, เดือนก่อนหน้าไม่เปลี่ยน
 * ถ้าขยายวันสิ้นสุด เดือนที่บันทึกแล้วซึ่งเคยอยู่นอกช่วงเดิมจะได้รายการเพิ่ม
 * (เดือนที่อยู่ในช่วงเดิมแต่ไม่มีรายการ = ผู้ใช้ลบ "เฉพาะเดือนนี้" ไว้ ไม่ใส่คืน)
 * @returns item ใหม่ของเดือนปัจจุบัน
 */
export async function updateRecurring(store, key, item, endMonth) {
  const templates = await store.listTemplates();
  const old = templates.find((t) => t.id === item.templateId);
  const tpl = {
    id: item.templateId,
    ...pick(item, TEMPLATE_FIELDS),
    startMonth: old?.startMonth ?? key,
    endMonth: endMonth === undefined ? (old?.endMonth ?? null) : endMonth,
  };
  await store.saveTemplate(tpl);
  // ไม่รู้ช่วงเดิม (template หาย) → ถือว่าเคยใช้งานทุกเดือน จะได้ไม่ใส่รายการคืนในเดือนที่ผู้ใช้ลบไว้
  const wasActive = (k) => (old ? isTemplateActive(old, k) : true);
  for (const k of await savedMonthsAfter(store, key)) {
    const doc = await store.getMonth(k);
    if (!doc) continue;
    const idx = doc.items.findIndex((it) => it.templateId === tpl.id);
    if (idx === -1) {
      if (isTemplateActive(tpl, k) && !wasActive(k)) {
        doc.items.push(itemFromTemplate(tpl));
        await store.saveMonth(k, doc);
      }
      continue;
    }
    if (isTemplateActive(tpl, k)) doc.items[idx] = applyTemplate(doc.items[idx], tpl);
    else doc.items.splice(idx, 1);
    await store.saveMonth(k, doc);
  }
  return item;
}

/**
 * หยุดรายการประจำ: ตั้ง endMonth = lastMonth แล้วเอาออกจากเดือนที่บันทึกแล้วหลัง lastMonth
 * ถ้า endMonth เดิมสิ้นสุดก่อน lastMonth อยู่แล้ว ให้คงค่าเดิม (หยุดต้องไม่ทำให้ใช้งานยาวขึ้น)
 * ถ้า endMonth < startMonth (ไม่เหลือเดือนที่ใช้) ให้ลบ template ทิ้ง
 */
export async function stopRecurring(store, templateId, lastMonth) {
  const templates = await store.listTemplates();
  const tpl = templates.find((t) => t.id === templateId);
  if (tpl) {
    const end = tpl.endMonth != null && tpl.endMonth < lastMonth ? tpl.endMonth : lastMonth;
    if (end < tpl.startMonth) await store.deleteTemplate(tpl.id);
    else if (end !== tpl.endMonth) await store.saveTemplate({ ...tpl, endMonth: end });
  }
  for (const k of await savedMonthsAfter(store, lastMonth)) {
    const doc = await store.getMonth(k);
    if (!doc) continue;
    const items = doc.items.filter((it) => it.templateId !== templateId);
    if (items.length !== doc.items.length) await store.saveMonth(k, { ...doc, items });
  }
}

export async function getTemplate(store, id) {
  return (await store.listTemplates()).find((t) => t.id === id) ?? null;
}

// ---------- สรุปทั้งปี ----------

/**
 * สรุปทั้งปีจากเอกสารเดือนที่บันทึกแล้ว (pure)
 * @param docs { "YYYY-MM": monthDoc }
 */
export function summarizeYear(year, docs) {
  const months = [];
  let gross = 0;
  let deduct = 0;
  let net = 0;
  let salary = 0;
  let savedCount = 0;
  const byName = new Map();

  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const doc = docs[key];
    if (!doc) { months.push({ month: m, key, saved: false }); continue; }
    const r = calcMonth({ year, month: m, salarySatang: doc.salarySatang, items: doc.items });
    savedCount++;
    salary += r.salarySatang;
    gross += r.grossSatang;
    deduct += r.deductSatang;
    net += r.netSatang;
    for (const { item, result } of r.items) {
      if (item.kind !== 'deduct') continue;
      const name = (item.name ?? '').trim() || t('item.noName');
      byName.set(name, (byName.get(name) ?? 0) + result.amountSatang);
    }
    months.push({
      month: m, key, saved: true,
      salarySatang: r.salarySatang, incomeSatang: r.incomeSatang,
      grossSatang: r.grossSatang, deductSatang: r.deductSatang, netSatang: r.netSatang,
      deductPctBp: r.deductPctBp,
    });
  }

  const deductByName = [...byName]
    .map(([name, amountSatang]) => ({ name, amountSatang }))
    .sort((a, b) => b.amountSatang - a.amountSatang || a.name.localeCompare(b.name, 'th'));

  return {
    year, months, savedCount,
    salarySatang: salary, grossSatang: gross, deductSatang: deduct, netSatang: net,
    deductByName,
  };
}

export async function loadYear(store, year) {
  const keys = (await store.listMonthKeys()).filter((k) => parseMonthKey(k)?.year === year);
  const docs = {};
  for (const k of keys) docs[k] = await store.getMonth(k);
  return summarizeYear(year, docs);
}

/** ปีแรกที่มีข้อมูล (ค.ศ.) หรือ null */
export async function firstDataYear(store) {
  const keys = await store.listMonthKeys();
  return keys.length ? parseMonthKey(keys[0])?.year ?? null : null;
}
