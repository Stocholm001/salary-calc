// store/firestore.js — เก็บข้อมูลใน Firestore (interface เดียวกับ store/local.js)
//
// users/{uid}                    { displayName, firstName, lastName, birthDate, username, createdAt, settings, photo }
// users/{uid}/months/{YYYY-MM}   { salarySatang, items, updatedAt }
// users/{uid}/templates/{tplId}  { ...item (ยกเว้น offDays), startMonth, endMonth }
//
// cache: อ่านเดือนทั้งหมด/template ทั้งหมดด้วย getDocs ครั้งเดียวต่อหน้าจอ แล้วตอบจาก cache
//        การเขียนอัปเดต cache ทันที, app.js เรียก invalidate() ตอนเปลี่ยนหน้าเพื่ออ่านข้อมูลล่าสุด
//        (เช่น ข้อมูลที่แก้จากเครื่องอื่น)
// เขียน: รอเซิร์ฟเวอร์ยืนยันไม่เกิน writeWaitMs ถ้าเกิน (ออฟไลน์) ให้ถือว่าเข้าคิวในเครื่องแล้ว
//        คืน { queued: true } และ Firestore จะส่งให้เองเมื่อกลับมาออนไลน์ หน้าจอจะได้ไม่ค้าง

import { DEFAULT_SETTINGS } from './local.js';
import { sanitizeMonthDoc, sanitizeTemplate } from '../sanitize.js';

// Firestore ไม่รับค่า undefined → ตัดทิ้งก่อนเขียน
const clean = (v) => JSON.parse(JSON.stringify(v));
const clone = (v) => (v == null ? v : structuredClone(v));

export const WRITE_WAIT_MS = 4000;

/**
 * รอการเขียนไม่เกิน ms
 * - สำเร็จทัน → { queued: false }
 * - error ทัน → throw (เช่น permission-denied)
 * - เกินเวลา → { queued: true } ถ้า error มาทีหลังจะ log ไว้ (onLateError)
 */
export function commitWithin(promise, ms, onLateError = (err) => console.error('เขียน Firestore ไม่สำเร็จ', err)) {
  return new Promise((resolve, reject) => {
    let late = false;
    const timer = setTimeout(() => { late = true; resolve({ queued: true }); }, ms);
    promise.then(
      () => { clearTimeout(timer); if (!late) resolve({ queued: false }); },
      (err) => { clearTimeout(timer); if (late) onLateError(err); else reject(err); },
    );
  });
}

/**
 * @param fb ผลจาก initFirebase() ใน auth.js
 * @param opts { writeWaitMs }
 */
export function createFirestoreStore(fb, uid, { writeWaitMs = WRITE_WAIT_MS } = {}) {
  const { db, F } = fb;
  const userRef = F.doc(db, 'users', uid);
  const monthsCol = F.collection(db, 'users', uid, 'months');
  const tplCol = F.collection(db, 'users', uid, 'templates');

  // ถ้าเขียนไม่สำเร็จ ให้ล้าง cache เพื่ออ่านค่าจริงใหม่รอบหน้า
  const commit = (promise, onFail) => commitWithin(promise, writeWaitMs, (err) => {
    console.error('เขียน Firestore ไม่สำเร็จ', err);
    onFail();
  }).catch((err) => { onFail(); throw err; });

  let userCache = null;
  const getUser = async () => {
    if (!userCache) userCache = (await F.getDoc(userRef)).data() ?? {};
    return userCache;
  };

  /** @type {Map<string, object>|null} key → เอกสารเดือนที่ sanitize แล้ว */
  let monthsCache = null;
  const loadMonths = async () => {
    if (!monthsCache) {
      const snap = await F.getDocs(monthsCol);
      const map = new Map();
      for (const d of snap.docs) {
        const data = d.data();
        const doc = sanitizeMonthDoc({ ...data, updatedAt: data?.updatedAt?.toMillis?.() ?? null });
        if (doc) map.set(d.id, doc);
      }
      monthsCache = map;
    }
    return monthsCache;
  };

  /** @type {Map<string, object>|null} id → template */
  let tplCache = null;
  const loadTemplates = async () => {
    if (!tplCache) {
      const snap = await F.getDocs(tplCol);
      const map = new Map();
      for (const d of snap.docs) {
        const tpl = sanitizeTemplate({ ...d.data(), id: d.id });
        if (tpl) map.set(tpl.id, tpl);
      }
      tplCache = map;
    }
    return tplCache;
  };

  return {
    kind: 'firestore',

    /** ล้าง cache เดือน/template (เรียกตอนเปลี่ยนหน้า) */
    invalidate() {
      monthsCache = null;
      tplCache = null;
    },

    async getProfile() {
      const u = await getUser();
      return {
        displayName: u.displayName ?? u.username ?? '',
        username: u.username ?? '',
        photo: u.photo ?? null,
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        birthDate: u.birthDate ?? null,
      };
    },

    async saveProfile({ firstName, lastName, birthDate, displayName }) {
      const patch = { firstName, lastName, birthDate: birthDate ?? null, displayName };
      await F.setDoc(userRef, patch, { merge: true });
      if (userCache) Object.assign(userCache, patch);
    },

    /** รูปโปรไฟล์เก็บเป็น data URL ขนาดเล็ก (~20 KB) ในเอกสารผู้ใช้ */
    async saveProfilePhoto(dataUrl) {
      await F.setDoc(userRef, { photo: dataUrl ?? null }, { merge: true });
      if (userCache) userCache.photo = dataUrl ?? null;
    },

    async getSettings() {
      return { ...DEFAULT_SETTINGS, ...(await getUser()).settings };
    },

    async saveSettings(settings) {
      const next = { ...DEFAULT_SETTINGS, ...settings };
      await F.setDoc(userRef, { settings: next }, { merge: true });
      if (userCache) userCache.settings = next;
    },

    async getMonth(key) {
      return clone((await loadMonths()).get(key) ?? null);
    },

    async saveMonth(key, { salarySatang, items }) {
      const data = clean({ salarySatang, items });
      // อัปเดต cache ก่อน เพื่อให้อ่านต่อได้ทันทีแม้ออฟไลน์
      monthsCache?.set(key, { ...structuredClone(data), updatedAt: Date.now() });
      // clean() ก่อนแล้วค่อยใส่ serverTimestamp (ถ้า clean ทีหลัง sentinel จะหาย)
      return commit(
        F.setDoc(F.doc(monthsCol, key), { ...data, updatedAt: F.serverTimestamp() }),
        () => { monthsCache = null; },
      );
    },

    async listMonthKeys() {
      return [...(await loadMonths()).keys()].sort();
    },

    async listTemplates() {
      return [...(await loadTemplates()).values()]
        .map(clone)
        .sort((a, b) => (a.startMonth + a.id).localeCompare(b.startMonth + b.id));
    },

    async saveTemplate(tpl) {
      const data = clean(tpl);
      tplCache?.set(tpl.id, structuredClone(data));
      return commit(F.setDoc(F.doc(tplCol, tpl.id), data), () => { tplCache = null; });
    },

    async deleteTemplate(id) {
      tplCache?.delete(id);
      return commit(F.deleteDoc(F.doc(tplCol, id)), () => { tplCache = null; });
    },
  };
}
