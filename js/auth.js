// auth.js — ล็อกอินชื่อ + PIN 6 หลัก ผ่าน Firebase Authentication (ข้อ 7 ของ SPEC)
// PIN ไม่ถูกเก็บใน Firestore เลย Firebase Auth เป็นคนดูแลในฐานะรหัสผ่าน

import { firebaseConfig, AUTH_EMAIL_DOMAIN } from '../firebase-config.js';
import { usernameToEmail } from './username.js';
import { DEFAULT_SETTINGS } from './store/local.js';
import { t } from './i18n.js';

export const SDK_VERSION = '13.4.0';
const SDK = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

export const isConfigured = () => Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId);

/** ตรวจว่าค่าใน firebase-config.js ดูเป็นค่าจริง คืนข้อความปัญหา หรือ null ถ้าดูถูกต้อง */
export function configProblem() {
  const c = firebaseConfig ?? {};
  const bad = [];
  if (!/^AIza[\w-]{30,}$/.test(c.apiKey ?? '')) bad.push('apiKey');
  if (!/^[a-z0-9-]{4,}$/.test(c.projectId ?? '')) bad.push('projectId');
  if (!/^[\w.-]+$/.test(c.authDomain ?? '')) bad.push('authDomain');
  if (!/^\d+:\d+:web:[0-9a-f]+$/.test(c.appId ?? '')) bad.push('appId');
  return bad.length ? t('config.bad', { fields: bad.join(', ') }) : null;
}

let fb = null;

/** โหลด SDK จาก CDN แล้ว init (เรียกซ้ำได้ คืนตัวเดิม) */
export async function initFirebase() {
  if (fb) return fb;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.initializeAuth(app, { persistence: authMod.browserLocalPersistence });
  const db = fsMod.getFirestore(app);
  fb = { app, auth, db, A: authMod, F: fsMod };
  return fb;
}

/** ผู้ใช้ปัจจุบันหลัง Firebase อ่าน session เสร็จ (null ถ้ายังไม่ล็อกอิน) */
export function currentUser() {
  const { auth, A } = fb;
  return new Promise((resolve) => {
    const off = A.onAuthStateChanged(auth, (user) => { off(); resolve(user); });
  });
}

/** ชื่อนี้มีบัญชีแล้วหรือยัง */
export async function usernameExists(username) {
  const { db, F } = fb;
  const snap = await F.getDoc(F.doc(db, 'usernames', username));
  return snap.exists();
}

export async function signIn(username, pin) {
  const { auth, A } = fb;
  const cred = await A.signInWithEmailAndPassword(auth, usernameToEmail(username, AUTH_EMAIL_DOMAIN), pin);
  await ensureUserDocs(cred.user.uid, username, username);
  return cred.user;
}

/**
 * ผู้ใช้ใหม่: สร้างบัญชี แล้วสร้าง usernames/{username} และ users/{uid}
 * ถ้าบัญชีมีอยู่แล้วแต่เอกสารยังไม่ครบ (เช่น เน็ตหลุดตอนสมัครครั้งก่อน) จะลองล็อกอินด้วย PIN นี้แล้วซ่อมเอกสารให้
 */
export async function signUp(username, displayName, pin) {
  const { auth, A } = fb;
  const email = usernameToEmail(username, AUTH_EMAIL_DOMAIN);
  let user;
  try {
    user = (await A.createUserWithEmailAndPassword(auth, email, pin)).user;
  } catch (err) {
    if (err?.code !== 'auth/email-already-in-use') throw err;
    user = (await A.signInWithEmailAndPassword(auth, email, pin)).user;
  }
  await ensureUserDocs(user.uid, username, displayName);
  return user;
}

/** สร้าง usernames/{username} และ users/{uid} ถ้ายังไม่มี */
async function ensureUserDocs(uid, username, displayName) {
  const { db, F } = fb;
  const nameRef = F.doc(db, 'usernames', username);
  const userRef = F.doc(db, 'users', uid);
  const [nameSnap, userSnap] = await Promise.all([F.getDoc(nameRef), F.getDoc(userRef)]);
  if (!nameSnap.exists()) await F.setDoc(nameRef, { uid });
  if (!userSnap.exists()) {
    await F.setDoc(userRef, {
      displayName: String(displayName).trim() || username,
      username,
      createdAt: F.serverTimestamp(),
      settings: { ...DEFAULT_SETTINGS },
    });
  }
}

/** ตรวจ PIN เดิม (reauthenticate) */
export async function verifyPin(pin) {
  const { auth, A } = fb;
  const user = auth.currentUser;
  await A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(user.email, pin));
}

/** เปลี่ยน PIN (ต้อง verifyPin ก่อน) */
export async function changePin(newPin) {
  const { auth, A } = fb;
  await A.updatePassword(auth.currentUser, newPin);
}

export async function signOut() {
  const { auth, A } = fb;
  await A.signOut(auth);
}

/** แปลง error ของ Firebase เป็นข้อความภาษาไทย */
export function authErrorMessage(err) {
  switch (err?.code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
      return t('err.pin');
    case 'auth/too-many-requests':
      return t('err.tooMany');
    case 'auth/network-request-failed':
    case 'unavailable':
      return t('err.network');
    case 'auth/operation-not-allowed':
      return t('err.notAllowed');
    case 'auth/requires-recent-login':
      return t('err.recentLogin');
    case 'permission-denied':
      return t('err.permission');
    default:
      return t('err.generic');
  }
}

/** error นี้คือ PIN ผิดหรือไม่ (ให้จุดสั่นแล้วล้างค่า) */
export const isWrongPin = (err) =>
  ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found'].includes(err?.code);
