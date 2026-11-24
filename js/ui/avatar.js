// ui/avatar.js — รูปโปรไฟล์วงกลม (ไม่มีรูปใช้ตัวอักษรแรกของชื่อ)
import { html } from './dom.js';
import { greetName } from '../profile.js';

/** ตัวอักษรแรกของชื่อ ข้ามสระหน้า (เ แ โ ใ ไ) เช่น "ใบเฟิร์น" → "บ", "Baifern" → "B" */
export const initialOf = (profile) => {
  const name = greetName(profile).replace(/^[\u0E40-\u0E44]+/, '');
  return [...(name || '?')][0].toLocaleUpperCase();
};

/** เนื้อในวงกลม: รูป หรือ ตัวอักษรแรก */
export const avatarInner = (profile) => (profile?.photo
  ? html`<img class="avatar__img" src="${profile.photo}" alt="">`
  : html`<span>${initialOf(profile)}</span>`);
