// pwa.js — ลงทะเบียน service worker และปุ่ม "ติดตั้งลงหน้าจอ"
// beforeinstallprompt มาได้ตั้งแต่ก่อนผู้ใช้เปิดหน้าตั้งค่า จึงต้องดักไว้ตั้งแต่เริ่มแอป

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // ไม่ให้ Chrome แสดงแถบของตัวเอง ใช้ปุ่มในหน้าตั้งค่าแทน
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });

  // localhost: ไม่ลงทะเบียน เพื่อให้แก้ไฟล์แล้วเห็นผลทันทีตอนพัฒนา
  const dev = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if ('serviceWorker' in navigator && window.isSecureContext && !dev) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('service worker:', err));
    });
  }
}

/** เปิดแบบแอปอยู่แล้ว (ติดตั้งแล้ว) */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/** iPhone/iPad (iPadOS 13+ รายงานตัวเป็น Mac ที่มีจอสัมผัส) */
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 'installed' | 'prompt' | 'ios' | 'unsupported' */
export function installState() {
  if (isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return 'unsupported';
}

/** แสดงหน้าต่างติดตั้งของเบราว์เซอร์ คืน true ถ้าผู้ใช้กดติดตั้ง */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; // ใช้ได้ครั้งเดียว
  e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome === 'accepted';
}

/** ฟังการเปลี่ยนสถานะติดตั้ง คืนฟังก์ชันยกเลิก */
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
