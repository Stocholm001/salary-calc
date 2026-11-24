// firebase-config.js — ค่า config ของ Firebase project (ใช้ project ใหม่ แยกจาก shinchan-debt)
// ค่าพวกนี้เปิดเผยได้ ความปลอดภัยอยู่ที่ firestore.rules
//
// วิธีเอาค่า: Firebase console → Project settings → General → Your apps → Web app → SDK setup and configuration → Config
// ถ้า apiKey ยังว่าง แอปจะเปิดใน "โหมดทดสอบ" เก็บข้อมูลใน localStorage และไม่มีหน้าล็อกอิน

export const firebaseConfig = {
  apiKey: 'AIzaSyA5hDqsGTfm_tSNp4JXEX0pBTZxdkj5qpg',
  authDomain: 'kapuk-salary.firebaseapp.com',
  projectId: 'kapuk-salary',
  storageBucket: 'kapuk-salary.firebasestorage.app',
  messagingSenderId: '818351721597',
  appId: '1:818351721597:web:7947975e52f009a02cf514',
};

// โดเมนสมมติสำหรับอีเมลภายใน (ไม่มีการส่งอีเมลจริง)
// ห้ามเปลี่ยนหลังมีผู้ใช้แล้ว ไม่งั้นทุกคนจะล็อกอินไม่ได้
export const AUTH_EMAIL_DOMAIN = 'kapuk-salary.example.com';
