// ui/icons.js — ไอคอน SVG แบบเส้น (ห้ามใช้อีโมจิแทนไอคอน)
import { raw } from './dom.js';

const svg = (body, size = 24) => raw(
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`,
);

export const icons = {
  eye: () => svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: () => svg('<path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.7 3.6M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>'),
  copy: () => svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 20),
  plus: () => svg('<path d="M12 5v14M5 12h14"/>'),
  minus: () => svg('<path d="M5 12h14"/>'),
  swap: () => svg('<path d="M4 9h14l-3-3M20 15H6l3 3"/>'),
  home: () => svg('<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  chart: () => svg('<path d="M4 20h16M7 20v-7M12 20V6M17 20v-10"/>'),
  gear: () => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  download: () => svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 20),
  trash: () => svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 20),
};

/** กระปุกหมู */
export const pig = (size = 120) => raw(`
<svg class="pig" width="${size}" height="${Math.round(size * 0.78)}" viewBox="0 0 120 94" aria-hidden="true" focusable="false">
  <rect x="34" y="74" width="12" height="16" rx="5" fill="#FFA8C1"/>
  <rect x="70" y="74" width="12" height="16" rx="5" fill="#FFA8C1"/>
  <path d="M30 26 L24 8 L44 20 Z" fill="#FFA8C1"/>
  <ellipse cx="58" cy="50" rx="44" ry="34" fill="#FFC2D4"/>
  <rect x="44" y="12" width="26" height="7" rx="3.5" fill="#E06C93"/>
  <circle cx="74" cy="42" r="4" fill="#4A3500"/>
  <ellipse cx="96" cy="56" rx="13" ry="11" fill="#FFA8C1"/>
  <circle cx="92" cy="56" r="2.6" fill="#B4441A" opacity=".55"/>
  <circle cx="100" cy="56" r="2.6" fill="#B4441A" opacity=".55"/>
</svg>`);
