// ui/image-load.js — เปิดไฟล์รูปให้วาดลง canvas ได้ ไม่ว่าจะนามสกุลอะไร
//
// 1. ลองให้เบราว์เซอร์เปิดเองก่อน (JPG, PNG, WebP, GIF, BMP, ICO, AVIF และ HEIC บน Safari)
// 2. ถ้าไม่ได้ ดูไบต์หัวไฟล์ว่าเป็นอะไร แล้วโหลดตัวแปลงจาก CDN เฉพาะตอนที่ต้องใช้
//    - HEIC/HEIF (รูปจาก iPhone): heic-to (~3 MB)
//    - TIFF และไฟล์ RAW ที่ใช้โครงสร้าง TIFF (DNG ฯลฯ): UTIF (~60 KB)
//    - SVG: เปิดผ่าน <img> แล้วกำหนดขนาดให้ถ้าไฟล์ไม่ได้ระบุไว้

const HEIC_URL = 'https://cdn.jsdelivr.net/npm/heic-to@1.6.7/dist/heic-to.js';
const UTIF_URL = 'https://cdn.jsdelivr.net/npm/utif@3.1.0/+esm';

/** input[accept]: ใส่นามสกุลที่บางระบบไม่นับว่าเป็น image/* ด้วย */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif,.avif,.webp,.tif,.tiff,.dng,.bmp,.ico,.svg';

/** โหลดตัวแปลงไม่สำเร็จ (ส่วนใหญ่เพราะไม่มีอินเทอร์เน็ต) */
export class DecoderLoadError extends Error {}

const lazy = (url) => {
  let p = null;
  return () => (p ??= import(url).catch((err) => { p = null; throw new DecoderLoadError(String(err)); }));
};
const loadHeic = lazy(HEIC_URL);
const loadUtif = lazy(UTIF_URL);

/** ชนิดไฟล์จากไบต์หัวไฟล์: 'heic' | 'tiff' | 'svg' | null */
export function sniffImage(bytes) {
  const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (/^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand)) return 'heic';
  }
  if (bytes.length >= 4) {
    if (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) return 'tiff'; // II*\0
    if (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a) return 'tiff'; // MM\0*
  }
  const head = new TextDecoder().decode(bytes).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return null;
}

/**
 * เปิดไฟล์รูป → ImageBitmap (หรือ <img> สำหรับ SVG)
 * @returns {Promise<{ source: CanvasImageSource, width: number, height: number, close(): void }>}
 */
export async function openImage(file) {
  // 1) เบราว์เซอร์เปิดเอง
  try {
    const bmp = await createImageBitmap(file);
    return fromBitmap(bmp);
  } catch { /* ลองวิธีอื่นต่อ */ }

  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const kind = sniffImage(head) ?? kindFromName(file.name);

  if (kind === 'heic') {
    const { heicTo } = await loadHeic();
    return fromBitmap(await heicTo({ blob: file, type: 'bitmap' }));
  }

  if (kind === 'tiff') {
    const { default: UTIF } = await loadUtif();
    const buf = await file.arrayBuffer();
    const ifds = UTIF.decode(buf);
    // เลือกหน้าที่ใหญ่ที่สุด (ไฟล์ RAW มักมีรูปย่อเล็ก ๆ เป็นหน้าแรก)
    let best = null;
    for (const ifd of ifds) {
      try { UTIF.decodeImage(buf, ifd); } catch { continue; }
      if (ifd.width && ifd.height && (!best || ifd.width * ifd.height > best.width * best.height)) best = ifd;
    }
    if (!best) throw new Error('no decodable TIFF page');
    const rgba = new Uint8ClampedArray(UTIF.toRGBA8(best));
    return fromBitmap(await createImageBitmap(new ImageData(rgba, best.width, best.height)));
  }

  // 3) SVG หรือรูปแบบอื่นที่ <img> เปิดได้แต่ createImageBitmap เปิดไม่ได้
  const url = URL.createObjectURL(kind === 'svg' && !file.type ? new Blob([file], { type: 'image/svg+xml' }) : file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  // SVG ที่ไม่ได้ระบุ width/height จะได้ขนาด 0 → ใช้ 512
  const width = img.naturalWidth || 512;
  const height = img.naturalHeight || 512;
  return { source: img, width, height, close: () => URL.revokeObjectURL(url) };
}

function fromBitmap(bmp) {
  return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() };
}

function kindFromName(name = '') {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'heic' || ext === 'heif') return 'heic';
  if (ext === 'tif' || ext === 'tiff' || ext === 'dng') return 'tiff';
  if (ext === 'svg') return 'svg';
  return null;
}
