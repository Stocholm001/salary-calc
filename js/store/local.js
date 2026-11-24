// store/local.js — เก็บข้อมูลใน localStorage (ใช้ช่วงพัฒนา Phase 2)
//
// Interface เดียวกับ store/firestore.js (ทุกเมธอดเป็น async):
//   getProfile()                 → { displayName, username, photo, firstName, lastName, birthDate }
//                                  photo = data URL | null, birthDate = "YYYY-MM-DD" | null
//   saveProfile({ firstName, lastName, birthDate, displayName })
//   saveProfilePhoto(dataUrl)    ← null = ลบรูป
//   getSettings()                → { hideOnOpen, weekStartsMonday }
//   saveSettings(settings)
//   getMonth(key)                → { salarySatang, items, updatedAt } | null  (ผ่าน sanitizeMonthDoc แล้ว)
//   saveMonth(key, { salarySatang, items }) → { queued: boolean } | undefined
//                                  queued = true: บันทึกในเครื่องแล้วแต่ยังส่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จ (ออฟไลน์)
//   invalidate()                 ← (ไม่บังคับ) ล้าง cache ให้อ่านใหม่ เรียกตอนเปลี่ยนหน้า
//   listMonthKeys()              → ["YYYY-MM", ...] เรียงจากเก่าไปใหม่
//   listTemplates()              → [{ id, ...item, startMonth, endMonth }]
//   saveTemplate(tpl)
//   deleteTemplate(id)

import { sanitizeMonthDoc, sanitizeTemplate } from '../sanitize.js';

export const DEFAULT_SETTINGS = Object.freeze({ hideOnOpen: false, weekStartsMonday: true });

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * @param storage อ็อบเจกต์แบบ localStorage (getItem/setItem/removeItem/key/length)
 * @param ns      prefix ของคีย์
 */
export function createLocalStore(storage = globalThis.localStorage, ns = 'salary-calc') {
  const k = (...parts) => [ns, ...parts].join(':');

  const read = (key, fallback = null) => {
    const raw = storage.getItem(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  };
  const write = (key, value) => storage.setItem(key, JSON.stringify(value));

  const keysWithPrefix = (prefix) => {
    const out = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) out.push(key);
    }
    return out;
  };

  return {
    kind: 'local',

    async getProfile() {
      const p = read(k('profile'), {});
      return {
        displayName: p.displayName ?? 'ผู้ใช้ในเครื่องนี้',
        username: 'local',
        photo: read(k('photo')),
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? '',
        birthDate: p.birthDate ?? null,
      };
    },

    async saveProfile({ firstName, lastName, birthDate, displayName }) {
      write(k('profile'), { firstName, lastName, birthDate: birthDate ?? null, displayName });
    },

    async saveProfilePhoto(dataUrl) {
      if (dataUrl) write(k('photo'), dataUrl);
      else storage.removeItem(k('photo'));
    },

    async getSettings() {
      return { ...DEFAULT_SETTINGS, ...read(k('settings'), {}) };
    },

    async saveSettings(settings) {
      write(k('settings'), { ...DEFAULT_SETTINGS, ...settings });
    },

    async getMonth(key) {
      return sanitizeMonthDoc(read(k('months', key)));
    },

    async saveMonth(key, { salarySatang, items }) {
      write(k('months', key), { salarySatang, items: clone(items), updatedAt: Date.now() });
    },

    async listMonthKeys() {
      const prefix = k('months', '');
      return keysWithPrefix(prefix).map((key) => key.slice(prefix.length)).sort();
    },

    async listTemplates() {
      const prefix = k('templates', '');
      return keysWithPrefix(prefix)
        .map((key) => sanitizeTemplate(read(key)))
        .filter(Boolean)
        .sort((a, b) => (a.startMonth + a.id).localeCompare(b.startMonth + b.id));
    },

    async saveTemplate(tpl) {
      write(k('templates', tpl.id), clone(tpl));
    },

    async deleteTemplate(id) {
      storage.removeItem(k('templates', id));
    },
  };
}

/** storage ในหน่วยความจำ ใช้ในเทสต์ */
export function createMemoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    clear: () => map.clear(),
  };
}
