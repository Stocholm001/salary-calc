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

async function route() {
  if (cleanup) { await cleanup(); cleanup = null; }
  const r = parseRoute();
  if (r.name === 'month') saveLastMonth(r.key);

  const root = $('#app');
  mount(root, html`<div class="view" id="view"></div>${tabbar(r.name)}`);
  const view = $('#view', root);

  if (r.name === 'month') cleanup = await renderMonth(view, app, r.key);
  else if (r.name === 'year') cleanup = await renderYear(view, app, r.year);
  else cleanup = await renderSettings(view, app);

  window.scrollTo(0, 0);
}

let started = false;

/** เริ่มส่วนแอปหลังรู้แล้วว่าใช้ store ไหน */
async function startApp(store) {
  app.store = store;
  app.settings = await store.getSettings();
  app.profile = await store.getProfile();
  app.hidden = !!app.settings.hideOnOpen;
  loadLastMonth();
  if (!started) {
    started = true;
    window.addEventListener('hashchange', route);
    // บันทึกงานที่ค้างก่อนปิด/ซ่อนแท็บ
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && cleanup) cleanup({ keepAlive: true });
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

  const enter = async () => {
    try {
      await startApp(createFirestoreStore(fb, fb.auth.currentUser.uid));
    } catch (err) {
      console.error(err);
      showFatal(t('fatal.data'));
    }
  };

  if (user) await enter();
  else renderLogin($('#app'), { onSignedIn: enter });
}

start();
