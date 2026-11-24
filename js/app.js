// app.js — เริ่มแอป, routing ระหว่างหน้า
//
// เส้นทาง (hash):
//   #/month/YYYY-MM   เดือนนี้ (F03)
//   #/year/YYYY       สรุปทั้งปี (F06)
//   #/settings        ตั้งค่า (F07)
// YYYY เป็น ค.ศ. เสมอ

import { createLocalStore } from './store/local.js';
import { createFirestoreStore } from './store/firestore.js';
import { isConfigured, configProblem, initFirebase, currentUser, signOut } from './auth.js';
import { renderLogin } from './ui/login.js';
import { initLang, t } from './i18n.js';
import { monthKey, parseMonthKey } from './dates.js';
import { html, mount, $ } from './ui/dom.js';
import { icons } from './ui/icons.js';
import { renderMonth } from './ui/month.js';
import { renderYear } from './ui/year.js';
import { renderSettings } from './ui/settings.js';
import { initPwa } from './pwa.js';
import { createAppLock } from './ui/lock-screen.js';
import { greetName } from './profile.js';

// โค้ดแอปโหลดครบแล้ว (index.html ใช้ตัดสินว่าจะแสดงหน้า "โหลดไม่สำเร็จ" หรือไม่)
window.__appStarted = true;

const now = new Date();
export const CURRENT = { year: now.getFullYear(), month: now.getMonth() + 1 };
const currentKey = () => monthKey(CURRENT.year, CURRENT.month);

const app = {
  store: null,
  settings: null,
  profile: null,
  hidden: false,
  current: CURRENT,
  navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },
  /** วาดหน้าปัจจุบันใหม่ (เช่น หลังเปลี่ยนภาษา) */
  rerender() {
    return route();
  },
  setHidden(v) {
    app.hidden = v;
  },
  async saveSettings(patch) {
    app.settings = { ...app.settings, ...patch };
    await app.store.saveSettings(app.settings);
  },
  async logout() {
    if (cleanup) { await cleanup(); cleanup = null; }
    await signOut();
    location.hash = '';
    location.reload();
  },
};

let cleanup = null;

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'year' && /^\d{4}$/.test(parts[1] ?? '')) return { name: 'year', year: Number(parts[1]) };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'month' && parseMonthKey(parts[1] ?? '')) return { name: 'month', key: parts[1] };
  return { name: 'month', key: lastMonthKey };
}

// เดือนที่ดูล่าสุด: ใช้กับแท็บล่าง และจำไว้ในเครื่อง (แยกตามผู้ใช้) เพื่อเปิดเดือนเดิมหลังล็อกอินใหม่
let lastMonthKey = currentKey();
const lastMonthStorageKey = () => `salary-calc:last-month:${app.store?.kind}:${app.profile?.username ?? ''}`;

function loadLastMonth() {
  try {
    const k = localStorage.getItem(lastMonthStorageKey());
    if (k && parseMonthKey(k)) lastMonthKey = k;
  } catch { /* ignore */ }
}

function saveLastMonth(key) {
  lastMonthKey = key;
  try { localStorage.setItem(lastMonthStorageKey(), key); } catch { /* ignore */ }
}

function tabbar(active) {
  const yr = parseMonthKey(lastMonthKey).year;
  const tab = (name, href, icon, label) => html`
    <a class="tabbar__item ${active === name ? 'is-active' : ''}" href="${href}"
       ${active === name ? html`aria-current="page"` : ''}>${icon}<span>${label}</span></a>`;
  return html`
    <nav class="tabbar" aria-label="${t('nav.label')}">
      ${tab('month', `#/month/${lastMonthKey}`, icons.home(), t('nav.month'))}
      ${tab('year', `#/year/${yr}`, icons.chart(), t('nav.year'))}
      ${tab('settings', '#/settings', icons.gear(), t('nav.settings'))}
    </nav>`;
}

// เลขลำดับการเปลี่ยนหน้า: ถ้าผู้ใช้เปลี่ยนหน้าซ้อนระหว่างที่หน้าก่อนยังโหลดอยู่ ให้ทิ้งผลของหน้าเก่า
let routeSeq = 0;

/** วาดหน้าตาม hash ปัจจุบัน ไม่ throw: ถ้าโหลดไม่สำเร็จจะแสดงข้อความพร้อมปุ่มลองใหม่ในหน้านั้น */
async function route() {
  const seq = ++routeSeq;
  if (cleanup) {
    const done = cleanup;
    cleanup = null;
    try { await done(); } catch (err) { console.error(err); }
  }
  if (seq !== routeSeq) return;

  const r = parseRoute();
  if (r.name === 'month') saveLastMonth(r.key);
  app.store.invalidate?.(); // อ่านข้อมูลล่าสุด (เช่น ที่แก้จากเครื่องอื่น) ทุกครั้งที่เปลี่ยนหน้า

  const root = $('#app');
  mount(root, html`<div class="view" id="view"></div>${tabbar(r.name)}`);
  const view = $('#view', root);

  try {
    let done;
    if (r.name === 'month') done = await renderMonth(view, app, r.key);
    else if (r.name === 'year') done = await renderYear(view, app, r.year);
    else done = await renderSettings(view, app);
    if (seq !== routeSeq) {
      // มีการเปลี่ยนหน้าใหม่แล้ว หน้านี้ไม่ได้แสดง: เก็บงานที่ค้างแล้วทิ้ง
      try { await done?.(); } catch (err) { console.error(err); }
      return;
    }
    cleanup = done;
  } catch (err) {
    console.error(err);
    if (seq !== routeSeq) return;
    mount(view, html`
      <div class="empty" role="alert">
        <p>${t('fatal.data')}</p>
        <button type="button" class="btn btn--primary" id="route-retry">${t('common.retry')}</button>
      </div>`);
    $('#route-retry', view).addEventListener('click', () => route());
  }

  window.scrollTo(0, 0);
}

let started = false;

/**
 * เริ่มส่วนแอปหลังรู้แล้วว่าใช้ store ไหน
 * @param opts.uid       มีเมื่อใช้ Firebase → เปิดระบบล็อกด้วย PIN เมื่อไม่ได้ใช้งาน 5 นาที
 * @param opts.restored  true = เปิดแอปด้วย session เดิม (ไม่ได้เพิ่งกรอก PIN) → ล็อกก่อนถ้าไม่ได้ใช้นานพอ
 */
async function startApp(store, { uid = null, restored = false } = {}) {
  app.store = store;
  app.settings = await store.getSettings();
  app.profile = await store.getProfile();
  app.hidden = !!app.settings.hideOnOpen;
  loadLastMonth();
  if (uid) {
    const lock = createAppLock({
      uid,
      username: app.profile.username,
      name: greetName(app.profile),
      onLogout: () => app.logout(),
    });
    // ล็อกก่อนวาดหน้าแรก ข้อมูลจะได้ไม่โผล่ให้เห็นก่อนใส่ PIN
    if (restored && lock.needsLock()) await lock.lock();
    else lock.markActive();
    lock.start();
  }
  if (!started) {
    started = true;
    window.addEventListener('hashchange', route);
    // บันทึกงานที่ค้างก่อนปิด/ซ่อนแท็บ
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && cleanup) {
        Promise.resolve(cleanup({ keepAlive: true })).catch((err) => console.error(err));
      }
    });
  }
  await route();
}

function showFatal(text) {
  mount($('#app'), html`<main class="login"><div class="login__hero"><h1 class="login__title">${t('app.name')}</h1>
    <p class="login__sub">${text}</p></div>
    <button type="button" class="btn btn--primary btn--block" id="retry">${t('common.retry')}</button></main>`);
  $('#retry').addEventListener('click', () => location.reload());
}

async function start() {
  initLang();
  initPwa();
  // ยังไม่ได้ใส่ค่าใน firebase-config.js → โหมดทดสอบ (localStorage)
  if (!isConfigured()) {
    console.info('firebase-config.js ยังว่าง: ใช้โหมดทดสอบ (localStorage)');
    await startApp(createLocalStore(window.localStorage));
    return;
  }

  const problem = configProblem();
  if (problem) {
    showFatal(problem);
    return;
  }

  mount($('#app'), html`<p class="boot" role="status">${t('common.loading')}</p>`);
  let fb;
  let user;
  try {
    fb = await initFirebase();
    user = await currentUser();
  } catch (err) {
    console.error(err);
    showFatal(t('fatal.load'));
    return;
  }

  const enter = async (restored) => {
    const uid = fb.auth.currentUser.uid;
    try {
      await startApp(createFirestoreStore(fb, uid), { uid, restored });
    } catch (err) {
      console.error(err);
      showFatal(t('fatal.data'));
    }
  };

  if (user) await enter(true);
  else renderLogin($('#app'), { onSignedIn: () => enter(false) });
}

start();
