// store/firestore.js — เก็บข้อมูลใน Firestore (interface เดียวกับ store/local.js)
//
// users/{uid}                    { displayName, username, createdAt, settings }
// users/{uid}/months/{YYYY-MM}   { salarySatang, items, updatedAt }
// users/{uid}/templates/{tplId}  { ...item (ยกเว้น offDays), startMonth, endMonth }

import { DEFAULT_SETTINGS } from './local.js';

// Firestore ไม่รับค่า undefined → ตัดทิ้งก่อนเขียน
const clean = (v) => JSON.parse(JSON.stringify(v));

/** @param fb ผลจาก initFirebase() ใน auth.js */
export function createFirestoreStore(fb, uid) {
  const { db, F } = fb;
  const userRef = F.doc(db, 'users', uid);
  const monthsCol = F.collection(db, 'users', uid, 'months');
  const tplCol = F.collection(db, 'users', uid, 'templates');

  let userCache = null;
  const getUser = async () => {
    if (!userCache) userCache = (await F.getDoc(userRef)).data() ?? {};
    return userCache;
  };

  return {
    kind: 'firestore',

    async getProfile() {
      const u = await getUser();
      return { displayName: u.displayName ?? u.username ?? '', username: u.username ?? '' };
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
      const snap = await F.getDoc(F.doc(monthsCol, key));
      if (!snap.exists()) return null;
      const d = snap.data();
      return {
        salarySatang: d.salarySatang ?? 0,
        items: d.items ?? [],
        updatedAt: d.updatedAt?.toMillis?.() ?? null,
      };
    },

    async saveMonth(key, { salarySatang, items }) {
      // clean() ก่อนแล้วค่อยใส่ serverTimestamp (ถ้า clean ทีหลัง sentinel จะหาย)
      await F.setDoc(F.doc(monthsCol, key), { ...clean({ salarySatang, items }), updatedAt: F.serverTimestamp() });
    },

    async listMonthKeys() {
      const snap = await F.getDocs(monthsCol);
      return snap.docs.map((d) => d.id).sort();
    },

    async listTemplates() {
      const snap = await F.getDocs(tplCol);
      return snap.docs
        .map((d) => ({ ...d.data(), id: d.id }))
        .sort((a, b) => (a.startMonth + a.id).localeCompare(b.startMonth + b.id));
    },

    async saveTemplate(tpl) {
      await F.setDoc(F.doc(tplCol, tpl.id), clean(tpl));
    },

    async deleteTemplate(id) {
      await F.deleteDoc(F.doc(tplCol, id));
    },
  };
}
