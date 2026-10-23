// MSROAD — 편집 · 인쇄 (악보를 용지에 배치하고 인쇄하거나 PDF 로 저장)
// 용지 A4 · A3, 세로 · 가로, 틀(1곡 · 2곡 나란히 · 3곡 나란히 · 자유 배치), 자르기, 확대 · 축소, 세트(저장해 두고 다시 열기)
// 원본 악보 파일은 바꾸지 않아요. 배치는 세트로 저장하고, 인쇄할 때 PDF 를 새로 만들어요.
// made by. Nevertheless_D
import {
  S, $, $$, esc, api, on, toast, thumbURL, fileURL, plate, parseQuery, matchSheet, confirmBox, clamp, ROADS, versionsOf,
} from './core.js';
import { loadDoc } from './viewer.js';

// ── 상수 ──
const PAPER = { A4: [210, 297], A3: [297, 420] };
const GAP = 6;          // 칸 사이 (mm)
const BAND = 8;         // 곡 제목 자리 (mm)
const TITLE_MM = 4.2;   // 곡 제목 글자 크기 (mm)
const PAGENO_MM = 3.2;  // 페이지 번호 글자 크기 (mm)
const NOCROP = { l: 0, t: 0, r: 0, b: 0 };
const MARGINS = [[5, '좁게'], [10, '보통'], [15, '넓게']];
const FRAMES = [[1, '1곡'], [2, '2곡'], [3, '3곡'], [0, '자유']];
const DEFAULT_PRESETS = [
  { paper: 'A3', orient: 'landscape', frame: 2, margin: 10 },
  { paper: 'A4', orient: 'landscape', frame: 2, margin: 10 },
  { paper: 'A3', orient: 'landscape', frame: 3, margin: 10 },
  { paper: 'A4', orient: 'portrait', frame: 1, margin: 10 },
];
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const bridge = () => window.webkit?.messageHandlers?.msroad;

// ── 상태 ──
const E = {
  active: false,
  loaded: false,
  set: null,         // 지금 편집 중인 세트
  sets: [],          // 저장된 세트 목록
  presets: null,     // 자주 쓰는 틀
  page: 0,
  sel: null,         // 고른 악보(item id)
  zoom: 1,           // 화면 확대 (맞춤 기준)
  hist: [], fut: [], // 실행 취소 · 다시 실행
  saveT: null, saving: false, saveErr: '',
  layer: '',         // '' | sets | crop | preview
  q: '', road: 'ALL',
  print: { copies: 1, range: 'all', duplex: false, name: '' },
  pv: 0,             // 미리보기 쪽
  crop: null,        // 자르기 중인 상태
  busy: false,
};
export const studioActive = () => E.active;

const rid = (n = 12) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const fmtDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const timeStr = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const isToday = (t) => new Date(t).toDateString() === new Date().toDateString();

// ── 아이콘 ──
const I = {
  eye: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></g></svg>',
  down: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M4.8 6.8L8 10l3.2-3.2M2.5 11v2.5h11V11"/></g></svg>',
  print: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6V1.8h8V6"/><rect x="1.8" y="6" width="12.4" height="5.6" rx="1.4"/><path d="M4 9.5h8v4.7H4z"/></g></svg>',
  set: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M5 2.5v11"/></g></svg>',
  chev: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  crop: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 1v11h11"/><path d="M1 4h11v11"/></g></svg>',
  fit: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></g></svg>',
  swap: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h10l-3-3M14 11H4l3 3"/></g></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  back: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v11M2.5 8h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  port: '<svg width="10" height="13" viewBox="0 0 10 13" aria-hidden="true"><rect x="1" y="1" width="8" height="11" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  land: '<svg width="13" height="10" viewBox="0 0 13 10" aria-hidden="true"><rect x="1" y="1" width="11" height="8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
};
const frameIcon = (n) => `<span class="fi">${n === 0 ? '<i style="flex:1.4"></i><i></i>' : '<i></i>'.repeat(n)}</span>`;

// ══════════════════════════════════════════════════════ 모양 계산 (mm)
function paperOf(set) {
  const [a, b] = PAPER[set.paper] || PAPER.A4;
  return set.orient === 'landscape' ? { W: b, H: a } : { W: a, H: b };
}
function contentOf(set) {
  const { W, H } = paperOf(set);
  const m = set.margin;
  const bottom = set.pageNo ? Math.max(m, 9) : m;
  return { x: m, y: m, w: W - 2 * m, h: H - m - bottom };
}
function slotsOf(set) {
  const c = contentOf(set);
  const n = set.frame || 1;
  const w = (c.w - GAP * (n - 1)) / n;
  const band = set.title ? BAND : 0;
  return Array.from({ length: n }, (_, i) => {
    const x = c.x + i * (w + GAP);
    return { box: { x, y: c.y, w, h: c.h }, band: { x, y: c.y, w, h: band }, img: { x, y: c.y + band, w, h: c.h - band } };
  });
}
function inter(a, b) {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}
function visDims(it) {
  const W = it.ref.w || 2100, H = it.ref.h || 2970;
  const c = it.crop || NOCROP;
  return { W, H, vw: W * (1 - c.l - c.r), vh: H * (1 - c.t - c.b), c };
}
// 칸 안에서: vis = 보이는 부분(자른 뒤), box = 그림 전체, clip = 실제로 보이는 곳
// 크기 방식 (1.2.1~): fit = 칸에 맞추기(비율 그대로) · stretch = 칸 가득 늘리기 · manual = 직접 조절(mrect: 칸 안의 자리, 0~1)
// 그림은 언제나 칸 안에만 있어요 (칸 밖으로 나가 잘리지 않아요). 가로 · 세로는 따로 늘리거나 줄일 수 있어요.
function fitRect(it, area) {
  const { vw, vh } = visDims(it);
  const s = Math.min(area.w / vw, area.h / vh);
  const w = vw * s, h = vh * s;
  const x = area.x + (area.w - w) / 2;
  const y = it.align === 'center' ? area.y + (area.h - h) / 2 : it.align === 'bottom' ? area.y + area.h - h : area.y;
  return { x, y, w, h };
}
function clampM(m) {
  const w = clamp(m.w, 0.08, 1), h = clamp(m.h, 0.08, 1);
  return { w, h, x: clamp(m.x, 0, 1 - w), y: clamp(m.y, 0, 1 - h) };
}
function boxFor(it, vis) {
  const { W, H, vw, vh, c } = visDims(it);
  const sx = vis.w / vw, sy = vis.h / vh;
  return { x: vis.x - c.l * W * sx, y: vis.y - c.t * H * sy, w: W * sx, h: H * sy, sx, sy };
}
function placeIn(it, area) {
  let vis;
  if (it.fit === 'stretch') vis = { ...area };
  else if (it.fit === 'manual' && it.mrect) {
    const m = clampM(it.mrect);
    vis = { x: area.x + m.x * area.w, y: area.y + m.y * area.h, w: m.w * area.w, h: m.h * area.h };
  } else vis = fitRect(it, area);
  const b = boxFor(it, vis);
  const fr = fitRect(it, area);
  return { vis, box: { x: b.x, y: b.y, w: b.w, h: b.h }, clip: inter(vis, area) || vis, area, px: vis.w / fr.w, py: vis.h / fr.h, fit: fr };
}
function placeFree(it, set) {
  const r = it.rect;
  const b = boxFor(it, r);
  const { W: PW, H: PH } = paperOf(set);
  return { vis: r, box: { x: b.x, y: b.y, w: b.w, h: b.h }, clip: inter(r, { x: 0, y: 0, w: PW, h: PH }), area: null };
}
function placeOf(set, it) {
  if (!set.frame) return placeFree(it, set);
  const sl = slotsOf(set)[it.slot];
  return sl ? placeIn(it, sl.img) : null;
}
// 지금 보이는 자리를 '직접 조절' 자리로 (칸 안의 비율)
function toManual(it, area) {
  if (it.fit === 'manual' && it.mrect) return;
  const v = placeIn(it, area).vis;
  it.mrect = clampM({ x: (v.x - area.x) / area.w, y: (v.y - area.y) / area.h, w: v.w / area.w, h: v.h / area.h });
  it.fit = 'manual';
}
// 비율이 원본과 얼마나 다른지 (1 = 원본 비율)
function stretchOf(it, vis) {
  const { vw, vh } = visDims(it);
  return (vis.h / vis.w) / (vh / vw);
}
// 자유 배치: 자르기를 바꾸면 늘린 정도는 그대로 두고 높이를 맞춰요
function fixFreeAspect(it, keep = 1) {
  if (!it.rect) return;
  const { vw, vh } = visDims(it);
  it.rect.h = it.rect.w * vh / vw * keep;
}
// 1.2.0 의 '칸 채우기' · 확대(칸 밖은 가림)를 같은 모습의 '자르기 + 직접 조절'로 바꿔요
function migrateItem(it, area) {
  if (!area || it.fit === 'fit' || it.fit === 'stretch' || it.mrect) { delete it.zoom; delete it.ox; delete it.oy; return; }
  const { W, H, vw, vh, c } = visDims(it);
  const fitS = Math.min(area.w / vw, area.h / vh);
  const sc = it.fit === 'fill' ? Math.max(area.w / vw, area.h / vh) : fitS * (it.zoom || 1);
  const w = vw * sc, h = vh * sc;
  let x = area.x + (area.w - w) / 2 + (it.ox || 0);
  let y = (it.align === 'center' ? area.y + (area.h - h) / 2 : it.align === 'bottom' ? area.y + area.h - h : area.y) + (it.oy || 0);
  const box = { x: x - c.l * W * sc, y: y - c.t * H * sc, w: W * sc, h: H * sc };
  const clip = inter({ x, y, w, h }, area);
  delete it.zoom; delete it.ox; delete it.oy;
  if (!clip) { it.fit = 'fit'; return; }
  it.crop = { l: (clip.x - box.x) / box.w, t: (clip.y - box.y) / box.h, r: (box.x + box.w - clip.x - clip.w) / box.w, b: (box.y + box.h - clip.y - clip.h) / box.h };
  it.mrect = clampM({ x: (clip.x - area.x) / area.w, y: (clip.y - area.y) / area.h, w: clip.w / area.w, h: clip.h / area.h });
  it.fit = 'manual';
}
function migrateSet(set) {
  if (!set?.frame) return;
  const slots = slotsOf(set);
  for (const p of set.pages) for (const it of p.items) migrateItem(it, slots[it.slot]?.img);
}

// ══════════════════════════════════════════════════════ 악보 찾기
function sheetOf(ref) {
  if (!ref) return null;
  let s = S.byId.get(ref.id);
  if (s) return s;
  // 코드를 바꾸면 악보 번호가 바뀌어요 → 같은 곡 · 같은 폴더 · 같은 코드로 다시 찾아요
  s = S.sheets.find((x) => x.song === ref.song && x.chord === ref.chord && x.dir === ref.dir)
    || S.sheets.find((x) => x.song === ref.song && x.chord === ref.chord);
  if (s && s.pages[ref.file]) { ref.id = s.id; return s; }
  return null;
}
function titleOf(ref) {
  return `${ref.title}${ref.chord ? ` (${ref.chord})` : ''}${ref.parts > 1 ? `  ${ref.part}/${ref.parts}` : ''}`;
}

// ── 그림 불러오기 (PDF 쪽은 화면에서 그려요) ──
const srcCache = new Map();
function srcKey(ref, q) { const s = sheetOf(ref); return `${ref.id}|${ref.file}|${ref.pdf || 0}|${s?.pages[ref.file]?.mod || 0}|${q}`; }
async function renderPdfPage(s, file, pageNo, maxPx, type = 'blob') {
  const doc = await loadDoc(fileURL(s, file));
  const page = await doc.getPage(clamp(pageNo || 1, 1, doc.numPages));
  const vp1 = page.getViewport({ scale: 1 });
  const scale = maxPx / Math.max(vp1.width, vp1.height);
  const vp = page.getViewport({ scale });
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(vp.width)); cv.height = Math.max(1, Math.round(vp.height));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
  if (type === 'jpeg') return { data: cv.toDataURL('image/jpeg', 0.92).split(',')[1], w: cv.width, h: cv.height };
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return { url: URL.createObjectURL(blob), w: cv.width, h: cv.height };
}
function getSrc(ref, q = 'full') {
  const s = sheetOf(ref);
  if (!s || !s.pages[ref.file]) return Promise.reject(new Error('missing'));
  const key = srcKey(ref, q);
  if (!srcCache.has(key)) {
    if (srcCache.size > 160) { const k = srcCache.keys().next().value; srcCache.get(k).then((x) => x.blob && URL.revokeObjectURL(x.url)).catch(() => {}); srcCache.delete(k); }
    const pg = s.pages[ref.file];
    const p = pg.kind === 'pdf'
      ? renderPdfPage(s, ref.file, ref.pdf, q === 'thumb' ? 640 : 2200).then((x) => ({ ...x, blob: true }))
      : Promise.resolve({ url: q === 'thumb' ? thumbURL(s, ref.file) : fileURL(s, ref.file) });
    srcCache.set(key, p);
    p.catch(() => srcCache.delete(key));
  }
  return srcCache.get(key);
}
function imageSize(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => rej(new Error('그림을 열지 못했어요'));
    im.src = url;
  });
}
// 악보 한 개 → 넣을 조각들 (여러 장 · PDF 여러 쪽)
async function partsOf(s) {
  const out = [];
  for (let i = 0; i < s.pages.length; i++) {
    const pg = s.pages[i];
    if (pg.kind === 'pdf') {
      const doc = await loadDoc(fileURL(s, i));
      const n = Math.min(doc.numPages, 40);
      for (let k = 1; k <= n; k++) {
        const page = await doc.getPage(k);
        const vp = page.getViewport({ scale: 1 });
        out.push({ file: i, pdf: k, w: Math.round(vp.width * 10), h: Math.round(vp.height * 10) });
      }
    } else {
      const d = await imageSize(fileURL(s, i)).catch(() => ({ w: 2100, h: 2970 }));
      out.push({ file: i, pdf: 0, w: d.w, h: d.h });
    }
  }
  return out.map((p, k, all) => ({ ...p, part: k + 1, parts: all.length }));
}

// ══════════════════════════════════════════════════════ 세트 · 저장 · 실행 취소
function newSet(o = {}) {
  const d = new Date();
  return {
    v: 1, id: rid(), name: o.name || `새 세트 ${d.getMonth() + 1}월 ${d.getDate()}일`,
    paper: o.paper || 'A3', orient: o.orient || 'landscape', margin: o.margin ?? 10, frame: o.frame ?? 2,
    title: o.title ?? true, pageNo: o.pageNo ?? true, divider: o.divider ?? false,
    pages: [{ items: [] }], created: Date.now(), updated: Date.now(),
  };
}
function snapshot() { return JSON.stringify(E.set); }
function commit(fn, { render = true } = {}) {
  if (!E.set) return;
  E.hist.push(snapshot());
  if (E.hist.length > 80) E.hist.shift();
  E.fut = [];
  fn(E.set);
  scheduleSave();
  if (render) renderAll();
}
function undo() {
  if (!E.hist.length) return;
  E.fut.push(snapshot());
  E.set = JSON.parse(E.hist.pop());
  E.page = clamp(E.page, 0, E.set.pages.length - 1);
  if (!findItem(E.sel)) E.sel = null;
  scheduleSave(); renderAll();
}
function redo() {
  if (!E.fut.length) return;
  E.hist.push(snapshot());
  E.set = JSON.parse(E.fut.pop());
  E.page = clamp(E.page, 0, E.set.pages.length - 1);
  if (!findItem(E.sel)) E.sel = null;
  scheduleSave(); renderAll();
}
function scheduleSave() {
  clearTimeout(E.saveT);
  E.saving = true;
  renderTop();
  E.saveT = setTimeout(saveNow, 650);
}
async function saveNow() {
  clearTimeout(E.saveT);
  if (!E.set) return;
  const set = E.set;
  try {
    const j = await api('/api/sets/save', { set });
    set.updated = j.updated;
    const i = E.sets.findIndex((x) => x.id === set.id);
    const copy = JSON.parse(JSON.stringify(set));
    if (i >= 0) E.sets[i] = copy; else E.sets.unshift(copy);
    E.saveErr = '';
  } catch (e) { E.saveErr = e.message; }
  E.saving = false;
  renderTop();
}
function findItem(id) {
  if (!E.set || !id) return null;
  for (let p = 0; p < E.set.pages.length; p++) {
    const it = E.set.pages[p].items.find((x) => x.id === id);
    if (it) return { it, page: p };
  }
  return null;
}
function itemCount(set) { return set.pages.reduce((n, p) => n + p.items.length, 0); }
function songsOf(set) {
  const seen = new Set(), out = [];
  for (const p of set.pages) for (const it of [...p.items].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))) {
    const k = it.ref.title + '|' + it.ref.chord;
    if (!seen.has(k)) { seen.add(k); out.push(it.ref.title); }
  }
  return out;
}
function setMeta(set) {
  const fr = set.frame ? `${set.frame}곡` : '자유 배치';
  return `${set.paper} ${set.orient === 'landscape' ? '가로' : '세로'} · ${fr}`;
}

// ══════════════════════════════════════════════════════ 넣기 · 옮기기 · 빼기
function emptySlots(set, fromPage) {
  const out = [];
  for (let p = fromPage; p < set.pages.length; p++) {
    const used = new Set(set.pages[p].items.map((x) => x.slot));
    for (let i = 0; i < set.frame; i++) if (!used.has(i)) out.push({ page: p, slot: i });
  }
  return out;
}
function makeItem(s, part) {
  return {
    id: rid(8),
    ref: { id: s.id, file: part.file, pdf: part.pdf, w: part.w, h: part.h, title: s.title, chord: s.chord, dir: s.dir, song: s.song, part: part.part, parts: part.parts },
    fit: 'fit', align: 'top', lock: true, crop: { ...NOCROP },
  };
}
// at: { page, slot } (틀) · { page, x, y } (자유, mm) · null (빈 칸 끝에)
async function addSheet(s, at) {
  if (!E.set || !s) return;
  let parts;
  try { parts = await partsOf(s); } catch { toast('⚠️ 악보를 열지 못했어요'); return; }
  if (!parts.length) return;
  commit((set) => {
    let lastPage = E.page;
    if (set.frame) {
      const targets = [];
      if (at && at.slot !== undefined) {
        const pg = set.pages[at.page];
        pg.items = pg.items.filter((x) => x.slot !== at.slot); // 이미 있던 악보는 바꿔요
        targets.push({ page: at.page, slot: at.slot });
      }
      const from = at ? at.page : E.page;
      while (targets.length < parts.length) {
        const free = emptySlots(set, from).filter((t) => !targets.some((u) => u.page === t.page && u.slot === t.slot));
        if (free.length) { targets.push(free[0]); continue; }
        set.pages.push({ items: [] });
      }
      parts.forEach((part, k) => {
        const it = makeItem(s, part);
        it.slot = targets[k].slot;
        set.pages[targets[k].page].items.push(it);
        lastPage = targets[k].page;
        if (k === 0) E.sel = it.id;
      });
    } else {
      const c = contentOf(set);
      parts.forEach((part, k) => {
        const it = makeItem(s, part);
        const ratio = part.h / part.w;
        let w = c.w * (paperOf(set).W > paperOf(set).H ? 0.42 : 0.6);
        if (w * ratio > c.h * 0.9) w = c.h * 0.9 / ratio;
        const cx = at?.x ?? c.x + c.w / 2, cy = at?.y ?? c.y + c.h / 2;
        it.rect = { x: clamp(cx - w / 2 + k * 8, 0, paperOf(set).W - w), y: clamp(cy - w * ratio / 2 + k * 8, 0, Math.max(0, paperOf(set).H - w * ratio)), w, h: w * ratio };
        const pg = set.pages[at?.page ?? E.page];
        pg.items.push(it);
        if (k === 0) E.sel = it.id;
      });
      lastPage = at?.page ?? E.page;
    }
    E.page = lastPage;
  });
}
function removeItem(id) {
  commit((set) => { for (const p of set.pages) p.items = p.items.filter((x) => x.id !== id); });
  if (E.sel === id) E.sel = null;
  renderAll();
}
// 틀을 바꾸면 넣은 순서대로 새 칸에 다시 채워요
function reflow(set, oldFrame) {
  const all = [];
  for (const p of set.pages) {
    const items = [...p.items].sort((a, b) => oldFrame
      ? (a.slot ?? 0) - (b.slot ?? 0)
      : (Math.round((a.rect?.y || 0) / 30) - Math.round((b.rect?.y || 0) / 30)) || (a.rect?.x || 0) - (b.rect?.x || 0));
    all.push(...items);
  }
  if (!set.frame) {
    // 틀 → 자유 배치: 지금 보이는 자리 그대로
    const tmp = { ...set, frame: oldFrame };
    for (const p of set.pages) for (const it of p.items) {
      const pl = placeIn(it, slotsOf(tmp)[it.slot]?.img || contentOf(set));
      it.rect = { ...pl.vis };
      delete it.slot; delete it.mrect;
    }
    return;
  }
  set.pages = [];
  for (let i = 0; i < Math.max(1, Math.ceil(all.length / set.frame)); i++) set.pages.push({ items: [] });
  all.forEach((it, k) => {
    it.slot = k % set.frame;
    delete it.rect;
    if (!oldFrame) { it.fit = 'fit'; delete it.mrect; }
    set.pages[Math.floor(k / set.frame)].items.push(it);
  });
}
function setOption(key, val) {
  commit((set) => {
    const old = set.frame;
    set[key] = val;
    if (key === 'frame' && old !== val) {
      reflow(set, old);
      E.page = 0;
    }
  });
}

// ══════════════════════════════════════════════════════ 페이지 그리기
// k = 화면 px / mm. opts.static: 미리보기 · 작은 그림 (고르기 · 끌어 놓기 없음), opts.q: 'thumb' | 'full'
function pageDOM(set, pi, k, opts = {}) {
  const { W, H } = paperOf(set);
  const page = set.pages[pi] || { items: [] };
  const el = document.createElement('div');
  el.className = 'pg' + (opts.static ? ' static' : '');
  el.style.width = W * k + 'px';
  el.style.height = H * k + 'px';
  el.dataset.page = pi;
  const box = (r, cls) => {
    const d = document.createElement('div');
    d.className = cls;
    Object.assign(d.style, { left: r.x * k + 'px', top: r.y * k + 'px', width: r.w * k + 'px', height: r.h * k + 'px' });
    return d;
  };
  if (set.frame) {
    const slots = slotsOf(set);
    slots.forEach((sl, i) => {
      const it = page.items.find((x) => x.slot === i);
      if (!opts.static) {
        const z = box(sl.box, 'slot' + (it ? '' : ' empty'));
        z.dataset.slot = i;
        if (!it) z.innerHTML = `<span style="font-size:${Math.max(10, Math.min(14, 4 * k))}px">여기에 악보를<br>끌어 놓으세요</span>`;
        el.append(z);
      }
      if (it && set.title) {
        const t = box(sl.band, 'ttl');
        t.style.fontSize = TITLE_MM * k + 'px';
        t.textContent = titleOf(it.ref);
        el.append(t);
      }
      if (set.divider && i > 0) {
        const x = sl.box.x - GAP / 2;
        const d = box({ x, y: sl.box.y, w: 0.01, h: sl.box.h }, 'divider');
        d.style.width = Math.max(1, 0.3 * k) + 'px';
        el.append(d);
      }
    });
  }
  for (const it of page.items) {
    const pl = placeOf(set, it);
    if (!pl || !pl.clip) continue;
    const w = box(pl.clip, 'it');
    w.dataset.id = it.id;
    const s = sheetOf(it.ref);
    if (!s) {
      w.classList.add('missing');
      w.innerHTML = `<span>악보를 찾을 수 없어요<br><small>${esc(it.ref.title)}</small></span>`;
    } else {
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      Object.assign(img.style, { left: (pl.box.x - pl.clip.x) * k + 'px', top: (pl.box.y - pl.clip.y) * k + 'px', width: pl.box.w * k + 'px', height: pl.box.h * k + 'px' });
      getSrc(it.ref, opts.q || 'full').then((src) => { img.src = src.url; }).catch(() => { w.classList.add('missing'); });
      w.append(img);
    }
    el.append(w);
  }
  if (set.pageNo) {
    const c = contentOf(set);
    const y = c.y + c.h;
    const n = box({ x: 0, y, w: W, h: H - y }, 'pno');
    n.style.fontSize = PAGENO_MM * k + 'px';
    n.textContent = String(pi + 1);
    el.append(n);
  }
  return el;
}

// ══════════════════════════════════════════════════════ 화면 뼈대
const root = $('#studio');
function shell() {
  root.innerHTML = `
    <aside class="st-lib">
      <div class="st-lib-head">
        <div class="row"><b>악보</b><span class="muted" id="stLibCount"></span></div>
        <label class="st-search">${I.search}<input type="text" id="stQ" placeholder="곡 이름 · 초성 · 코드" aria-label="악보 찾기" autocomplete="off" spellcheck="false"></label>
        <div class="st-roads" id="stRoads"></div>
      </div>
      <div class="st-list" id="stList"></div>
      <div class="st-hint">끌어서 페이지 칸에 놓거나, 두 번 누르면 빈 칸에 차례로 들어가요.</div>
    </aside>
    <div class="st-center">
      <div class="st-tools" id="stTools"></div>
      <div class="st-stage" id="stStage"></div>
      <div class="st-strip" id="stStrip"></div>
    </div>
    <aside class="st-props" id="stProps"></aside>
    <div class="st-layer" id="stLayer" hidden></div>
    <div class="st-busy" id="stBusy" hidden><div><i></i><span id="stBusyMsg">PDF를 만드는 중…</span></div></div>`;
  $('#stQ').addEventListener('input', (e) => { E.q = e.target.value.trim(); renderLib(); });
  $('#stQ').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; E.q = ''; renderLib(); e.target.blur(); } });
}

// ── 위쪽 (세트 이름 · 저장 상태 · 미리보기 · PDF · 인쇄) ──
function renderTop() {
  const top = $('#stTop'), act = $('#stActions');
  if (!E.active) { top.innerHTML = ''; act.innerHTML = ''; return; }
  const st = E.saveErr ? `<span class="st-save err" title="${esc(E.saveErr)}"><i></i>저장하지 못했어요</span>`
    : E.saving ? '<span class="st-save busy"><i></i>저장 중…</span>'
      : E.set ? '<span class="st-save"><i></i>자동 저장됨</span>' : '';
  top.innerHTML = `<button class="st-setbtn" data-top="sets" title="세트 목록">${I.set}<span>${esc(E.set?.name || '세트 고르기')}</span>${I.chev}</button>${st}`;
  const dis = !E.set || !itemCount(E.set) ? 'disabled' : '';
  act.innerHTML = `<button class="st-btn" data-top="preview" ${dis} title="인쇄될 모습 미리보기">${I.eye}<span>미리보기</span></button>
    <button class="st-btn" data-top="pdf" ${dis} title="PDF 파일로 저장">${I.down}<span>PDF로 저장</span></button>
    <button class="st-btn go" data-top="print" ${dis} title="인쇄 (⌘P)">${I.print}<span>인쇄</span><kbd>⌘P</kbd></button>`;
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-top]')?.dataset.top;
  if (!t || !E.active) return;
  if (t === 'sets') openSets();
  if (t === 'preview') openPreview();
  if (t === 'pdf') savePDF();
  if (t === 'print') printNow();
});

// ── 왼쪽 악보 목록 ──
function usageMap() {
  const m = new Map();
  if (!E.set) return m;
  E.set.pages.forEach((p, i) => p.items.forEach((it) => { const id = sheetOf(it.ref)?.id; if (id && !m.has(id)) m.set(id, i + 1); }));
  return m;
}
function renderLib() {
  if (!$('#stList')) return;
  const roads = ['ALL', ...ROADS, 'X'];
  $('#stRoads').innerHTML = roads.map((r) => `<button class="${E.road === r ? 'on' : ''} ${r === 'ALL' || r === 'X' ? '' : 'r' + r}" data-road="${r}" title="${r === 'ALL' ? '전체' : r === 'X' ? '코드 없음' : r + ' ROAD'}">${r === 'ALL' ? '전체' : r === 'X' ? '—' : r}</button>`).join('');
  let list = S.sheets;
  if (E.road !== 'ALL') list = list.filter((s) => s._road === E.road);
  if (E.q) { const pq = parseQuery(E.q); list = list.filter((s) => matchSheet(s, pq)); }
  list = [...list].sort((a, b) => collator.compare(a._prep.norm, b._prep.norm) || collator.compare(a.chord, b.chord));
  $('#stLibCount').textContent = `${list.length}개`;
  const used = usageMap();
  const shown = list.slice(0, 400);
  if (!S.sheets.length) {
    $('#stList').innerHTML = `<div class="st-empty">${S.settings?.folder ? '이 폴더에는 악보가 없어요' : '먼저 <b>악보 보기</b>에서 악보 폴더를 골라 주세요'}</div>`;
    return;
  }
  $('#stList').innerHTML = shown.map((s) => {
    const pg = used.get(s.id);
    const pdf = s.pages.some((p) => p.kind === 'pdf');
    const meta = [`${s.pages.length > 1 ? s.pages.length + '장' : pdf ? 'PDF' : '1장'}`, pg ? `${pg}쪽에 들어감` : '', s.dir ? esc(s.dir) : ''].filter(Boolean).join(' · ');
    return `<div class="st-song ${pg ? 'used' : ''}" data-id="${s.id}" tabindex="0" title="끌어서 페이지에 놓기 · 두 번 눌러 넣기">
      <span class="th">${s.pages[0].kind === 'pdf' ? '<b>PDF</b>' : `<img loading="lazy" alt="" src="${thumbURL(s)}">`}</span>
      <span class="nm"><b>${esc(s._prep.norm)}</b><small>${meta}</small></span>${s.chord ? plate(s.chord) : '<span class="plate none">없음</span>'}</div>`;
  }).join('') + (list.length > shown.length ? `<div class="st-empty">앞의 ${shown.length}개만 보여 줘요. 찾기로 좁혀 보세요.</div>` : '') + (!list.length ? '<div class="st-empty">찾는 악보가 없어요</div>' : '');
  $$('#stList img').forEach((im) => { im.onerror = () => { im.replaceWith(Object.assign(document.createElement('b'), { textContent: '♪' })); }; });
}

// ── 위쪽 도구 (용지 · 방향 · 틀 · 여백 · 확대) ──
function renderTools() {
  const t = $('#stTools');
  if (!E.set) { t.innerHTML = ''; return; }
  const s = E.set;
  const seg = (key, opts) => `<div class="seg" data-opt="${key}">${opts.map(([v, label]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  t.innerHTML = `
    <div class="grp"><span>용지</span>${seg('paper', [['A4', 'A4'], ['A3', 'A3']])}</div>
    <div class="grp"><span>방향</span>${seg('orient', [['portrait', `${I.port}세로`], ['landscape', `${I.land}가로`]])}</div>
    <div class="grp"><span>틀</span>${seg('frame', FRAMES.map(([v, l]) => [v, frameIcon(v) + l]))}</div>
    <div class="grp"><span>여백</span>${seg('margin', MARGINS.map(([v, l]) => [v, l]))}</div>`;
}
$('#studio').addEventListener('click', (e) => {
  const opt = e.target.closest('[data-opt]');
  if (opt && E.set) {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (v === undefined) return;
    const key = opt.dataset.opt;
    const val = key === 'frame' || key === 'margin' ? Number(v) : v;
    if (E.set[key] !== val) setOption(key, val);
    return;
  }
  const z = e.target.closest('[data-zoom]')?.dataset.zoom;
  if (z) {
    E.zoom = z === 'fit' ? 1 : clamp(E.zoom * (z === '+' ? 1.2 : 1 / 1.2), 0.4, 4);
    renderStage();
  }
});

// ── 가운데 페이지 ──
let K = 1; // 지금 화면 배율 (px/mm)
function renderStage() {
  const st = $('#stStage');
  if (!st) return;
  if (!E.set) { st.innerHTML = ''; return; }
  const s = E.set;
  E.page = clamp(E.page, 0, s.pages.length - 1);
  const { W, H } = paperOf(s);
  const availW = Math.max(200, st.clientWidth - 60), availH = Math.max(200, st.clientHeight - 64);
  K = Math.min(availW / W, availH / H) * E.zoom;
  const fr = s.frame ? `${s.frame}곡${s.frame > 1 ? ' 나란히' : ''}` : '자유 배치';
  const keep = st.querySelector('.st-scroll');
  const sx = keep?.scrollLeft || 0, sy = keep?.scrollTop || 0;
  st.innerHTML = `<div class="st-scroll"><div class="st-pagewrap" style="width:${W * K}px">
      <div class="st-pagehead"><span>${E.page + 1}쪽 · ${s.paper} ${s.orient === 'landscape' ? '가로' : '세로'} · ${fr}</span><span>${W} × ${H} mm</span></div>
    </div></div>
    <div class="st-zoom"><button data-zoom="-" aria-label="축소">−</button><span id="stZoomTxt"></span><button data-zoom="+" aria-label="확대">+</button><button data-zoom="fit" class="txt" title="창에 맞추기">맞춤</button></div>`;
  const pg = pageDOM(s, E.page, K);
  st.querySelector('.st-pagewrap').append(pg);
  if (E.zoom !== 1) { st.querySelector('.st-scroll').scrollLeft = sx; st.querySelector('.st-scroll').scrollTop = sy; }
  const pct = Math.round(K / (96 / 25.4) * 100);
  const zt = $('#stZoomTxt'); if (zt) zt.textContent = pct + '%';
  drawSelection();
}
function drawSelection() {
  const pg = $('#stStage .pg');
  if (!pg) return;
  pg.querySelectorAll('.sel-box, .st-mini').forEach((x) => x.remove());
  const f = findItem(E.sel);
  if (!f || f.page !== E.page) return;
  const pl = placeOf(E.set, f.it);
  if (!pl) return;
  const r = E.set.frame ? pl.clip || pl.vis : pl.vis;
  const sel = document.createElement('div');
  sel.className = 'sel-box' + (E.set.frame ? '' : ' free');
  Object.assign(sel.style, { left: r.x * K + 'px', top: r.y * K + 'px', width: r.w * K + 'px', height: r.h * K + 'px' });
  sel.innerHTML = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].map((h) => `<i class="hd ${h}" data-h="${h}" title="${h.length === 2 ? '크기 바꾸기' : h === 'n' || h === 's' ? '세로만 늘리기 · 줄이기' : '가로만 늘리기 · 줄이기'}"></i>`).join('');
  pg.append(sel);
  const s = sheetOf(f.it.ref);
  const others = s ? versionsOf(s).filter((v) => v.id !== s.id) : [];
  const mini = document.createElement('div');
  mini.className = 'st-mini';
  mini.innerHTML = `<button data-mini="crop">${I.crop}자르기</button>
    ${E.set.frame ? `<button data-mini="fit">${I.fit}칸에 맞추기</button>` : ''}
    ${others.length ? `<button data-mini="key">${I.swap}다른 키로</button>` : ''}
    <button data-mini="remove" class="danger" aria-label="빼기" title="빼기 (delete)">${I.x}</button>`;
  pg.append(mini);
  const mw = mini.offsetWidth || 260;
  const left = clamp((r.x + r.w / 2) * K - mw / 2, -40, pg.offsetWidth - mw + 40);
  const top = r.y * K - 50 < -46 ? (r.y + r.h) * K + 10 : r.y * K - 50;
  Object.assign(mini.style, { left: left + 'px', top: top + 'px' });
}
root.addEventListener('click', (e) => {
  const m = e.target.closest('[data-mini]')?.dataset.mini;
  if (!m) return;
  const f = findItem(E.sel);
  if (!f) return;
  if (m === 'remove') removeItem(f.it.id);
  if (m === 'crop') openCrop(f.it.id);
  if (m === 'fit') commit(() => { f.it.fit = 'fit'; delete f.it.mrect; });
  if (m === 'key') keyMenu(e.target.closest('button'), f.it);
});
function keyMenu(btn, it) {
  const s = sheetOf(it.ref);
  const pop = $('#pop');
  const vs = versionsOf(s).filter((v) => v.id !== s.id);
  pop.innerHTML = `<h5>다른 키로 바꾸기 <span>${esc(s._prep.norm)}</span></h5><div class="st-keys">${vs.map((v) => `<button data-key="${v.id}">${v.chord ? plate(v.chord) : plate('')}<small>${v.dir ? esc(v.dir) : `${v.pages.length}장`}</small></button>`).join('')}</div>`;
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.min(r.left, innerWidth - pop.offsetWidth - 10) + 'px';
  pop.style.top = (r.bottom + 8) + 'px';
  pop.onclick = async (e) => {
    const id = e.target.closest('[data-key]')?.dataset.key;
    if (!id) return;
    pop.hidden = true;
    const v = S.byId.get(id);
    let parts;
    try { parts = await partsOf(v); } catch { return; }
    const part = parts[Math.min(parts.length - 1, (it.ref.part || 1) - 1)];
    const keep = it.rect ? stretchOf(it, it.rect) : 1;
    commit(() => {
      Object.assign(it.ref, { id: v.id, file: part.file, pdf: part.pdf, w: part.w, h: part.h, title: v.title, chord: v.chord, dir: v.dir, song: v.song, part: part.part, parts: part.parts });
      fixFreeAspect(it, keep);
    });
    toast(`${esc(v._prep.norm)} ${v.chord ? plate(v.chord) : ''} 로 바꿨어요`);
  };
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#pop') && !e.target.closest('[data-mini="key"]')) $('#pop').hidden = true; });

// ── 아래 페이지 줄 ──
function renderStrip() {
  const el = $('#stStrip');
  if (!el) return;
  if (!E.set) { el.innerHTML = ''; return; }
  const s = E.set;
  const { W, H } = paperOf(s);
  const k = Math.min(78 / W, 56 / H);
  el.innerHTML = '<span class="lbl">페이지</span><div class="st-thumbs" id="stThumbs"></div>';
  const wrap = $('#stThumbs');
  s.pages.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'st-thumb' + (i === E.page ? ' on' : '');
    d.dataset.goto = i;
    d.title = `${i + 1}쪽`;
    d.append(pageDOM(s, i, k, { static: true, q: 'thumb' }));
    d.insertAdjacentHTML('beforeend', `<span>${i + 1}쪽</span>${s.pages.length > 1 ? `<button class="del" data-delpage="${i}" aria-label="${i + 1}쪽 지우기" title="이 쪽 지우기">${I.x}</button>` : ''}`);
    wrap.append(d);
  });
  wrap.insertAdjacentHTML('beforeend', `<button class="st-addpage" data-addpage style="width:${W * k}px;height:${H * k}px">+ 페이지</button>`);
  const n = itemCount(s);
  el.insertAdjacentHTML('beforeend', `<span class="spacer"></span><span class="muted info">${s.pages.length}쪽 · 악보 ${n}개 · 인쇄하면 ${s.paper} ${s.pages.length}장</span>`);
}
root.addEventListener('click', (e) => {
  const del = e.target.closest('[data-delpage]');
  if (del) {
    const i = Number(del.dataset.delpage);
    commit((set) => { set.pages.splice(i, 1); if (!set.pages.length) set.pages.push({ items: [] }); });
    E.page = clamp(E.page >= i ? E.page - 1 : E.page, 0, E.set.pages.length - 1);
    renderAll();
    toast(`${i + 1}쪽을 지웠어요`, { action: '되돌리기', onAction: undo });
    return;
  }
  const g = e.target.closest('[data-goto]');
  if (g && !E.layer) { E.page = Number(g.dataset.goto); E.sel = null; renderAll(); return; }
  if (e.target.closest('[data-addpage]')) {
    commit((set) => { set.pages.push({ items: [] }); });
    E.page = E.set.pages.length - 1;
    renderAll();
  }
});

// ── 오른쪽 설정 ──
function renderProps() {
  const el = $('#stProps');
  if (!el) return;
  if (!E.set) { el.innerHTML = ''; return; }
  const s = E.set;
  const f = findItem(E.sel);
  let h = '';
  if (f) {
    const it = f.it, sh = sheetOf(it.ref);
    const pg = sh?.pages[it.ref.file];
    const c = it.crop || NOCROP;
    const cropped = c.l + c.t + c.r + c.b > 0.001;
    const pl = placeOf(s, it);
    h += `<div class="pp-sec"><span class="pp-lbl">고른 악보</span>
        <div class="pp-title"><b>${esc(it.ref.title)}</b>${it.ref.chord ? plate(it.ref.chord) : ''}</div>
        <span class="muted small">${pg ? esc(pg.name) : '파일을 찾을 수 없어요'}${it.ref.parts > 1 ? ` · ${it.ref.parts}장 중 ${it.ref.part}장` : ''}${it.ref.pdf ? ` · ${it.ref.pdf}쪽` : ''}</span></div>`;
    const lock = it.lock !== false;
    const bent = pl ? Math.abs(stretchOf(it, pl.vis) - 1) > 0.01 : false;
    const sizeRow = (ax, label, val, min, max, unit) => `<div class="pp-size"><span>${label}</span><button data-isz="${ax}-" aria-label="${label} 줄이기">−</button><input type="range" min="${min}" max="${max}" step="1" value="${clamp(val, min, max)}" data-szr="${ax}" aria-label="${label} 크기"><button data-isz="${ax}+" aria-label="${label} 늘리기">+</button><b data-szt="${ax}">${val}${unit}</b></div>`;
    const lockRow = `<div class="pp-lock"><button class="lk ${lock ? 'on' : ''}" data-lock aria-pressed="${lock}">${lock ? '🔗 비율 유지' : '↔︎ 가로 · 세로 따로'}</button>${bent ? '<button class="btn ghost small-btn" data-pp="ratio">원래 비율로</button>' : ''}</div>`;
    if (s.frame && pl) {
      const a = pl.area, fr = pl.fit;
      const pw = Math.round(pl.px * 100), ph = Math.round(pl.py * 100);
      h += `<div class="pp-sec"><span class="pp-h">크기 <small class="muted">칸은 그대로, 악보만 커지거나 작아져요</small></span>
          <div class="seg full" data-item="fit"><button data-v="fit" class="${it.fit === 'fit' ? 'on' : ''}">칸에 맞추기</button><button data-v="stretch" class="${it.fit === 'stretch' ? 'on' : ''}">칸 가득 늘리기</button><button data-v="manual" class="${it.fit === 'manual' ? 'on' : ''}">직접 조절</button></div>
          ${sizeRow('w', '가로', pw, 15, Math.max(100, Math.ceil(a.w / fr.w * 100)), '%')}
          ${sizeRow('h', '세로', ph, 15, Math.max(100, Math.ceil(a.h / fr.h * 100)), '%')}
          ${lockRow}
          <span class="muted small">칸 밖으로는 나가지 않아요. 모서리를 끌면 크기, 가장자리를 끌면 가로나 세로만 바뀌어요. ${it.fit === 'manual' ? '악보를 끌어 칸 안에서 옮겨요.' : '악보를 끌어 다른 칸으로 옮길 수 있어요.'}</span></div>`;
    } else if (pl) {
      const { W: PW, H: PH } = paperOf(s);
      h += `<div class="pp-sec"><span class="pp-h">크기 <small class="muted">mm</small></span>
          ${sizeRow('w', '가로', Math.round(it.rect.w), 20, Math.round(PW), '')}
          ${sizeRow('h', '세로', Math.round(it.rect.h), 20, Math.round(PH), '')}
          ${lockRow}
          <span class="muted small">모서리를 끌면 크기, 가장자리를 끌면 가로나 세로만 바뀌어요. 가운데를 끌어 옮겨요.</span></div>`;
    }
    h += `<div class="pp-sec"><span class="pp-h">자르기</span>
        <button class="btn wide" data-pp="crop">${I.crop}자르기 열기</button>
        <span class="muted small">${cropped ? `위 ${Math.round(c.t * 100)}% · 아래 ${Math.round(c.b * 100)}% · 왼쪽 ${Math.round(c.l * 100)}% · 오른쪽 ${Math.round(c.r * 100)}% 잘라냄` : '잘라내면 남은 부분이 칸에 맞게 커져요'} · 원본 파일은 그대로예요</span>
        ${cropped ? '<button class="btn ghost small-btn" data-pp="uncrop">원래대로 펼치기</button>' : ''}</div>`;
    if (s.frame) {
      h += `<div class="pp-sec"><span class="pp-h">칸 안에서 위치</span>
          <div class="seg full" data-item="align"><button data-v="top" class="${it.align === 'top' ? 'on' : ''}">위</button><button data-v="center" class="${it.align === 'center' ? 'on' : ''}">가운데</button><button data-v="bottom" class="${it.align === 'bottom' ? 'on' : ''}">아래</button></div></div>`;
    }
    h += '<div class="pp-rule"></div>';
  } else {
    h += `<div class="pp-sec"><span class="pp-lbl">악보를 고르면</span><span class="muted small">자르기 · 크기 · 위치를 여기에서 바꿀 수 있어요. 왼쪽 목록에서 악보를 끌어 페이지에 놓아 보세요.</span></div><div class="pp-rule"></div>`;
  }
  const tg = (key, label, disabled, note) => `<div class="pp-tg ${disabled ? 'dis' : ''}"><span>${label}${note ? `<small>${note}</small>` : ''}</span><button class="tg ${s[key] && !disabled ? 'on' : ''}" data-tg="${key}" aria-pressed="${!!s[key] && !disabled}" aria-label="${label}" ${disabled ? 'disabled' : ''}><i></i></button></div>`;
  h += `<div class="pp-sec"><span class="pp-h">페이지에 넣을 것</span>
      ${tg('title', '곡 제목', !s.frame, !s.frame ? '자유 배치에서는 안 써요' : '')}
      ${tg('pageNo', '페이지 번호')}
      ${tg('divider', '칸 사이 구분선', !(s.frame > 1))}</div>
    <span class="spacer"></span>
    <div class="pp-card"><label class="pp-name"><span>세트 이름</span><input type="text" id="ppName" value="${esc(s.name)}" maxlength="60"></label>
      <span class="muted small">${setMeta(s)} · ${s.pages.length}쪽 · 악보 ${itemCount(s)}개${s.updated ? ` · ${isToday(s.updated) ? '오늘 ' + timeStr(s.updated) : fmtDate(s.updated)} 저장` : ''}</span></div>`;
  el.innerHTML = h;
  const nm = $('#ppName');
  nm.addEventListener('change', () => { const v = nm.value.trim() || s.name; commit((set) => { set.name = v; }); });
  nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') nm.blur(); });
  if (f) {
    let started = false;
    $$('#stProps [data-szr]').forEach((r) => {
      r.addEventListener('input', () => {
        if (!started) { started = true; E.hist.push(snapshot()); E.fut = []; }
        setSize(f.it, r.dataset.szr, Number(r.value));
        renderStage();
        scheduleSave();
        syncSizeUI(f.it);
      });
      r.addEventListener('change', () => { started = false; renderAll(); });
    });
  }
}
// 슬라이더 숫자만 새로 (다시 그리면 끌던 슬라이더가 끊겨요)
function syncSizeUI(it) {
  const pl = placeOf(E.set, it);
  if (!pl) return;
  const vals = E.set.frame ? { w: Math.round(pl.px * 100), h: Math.round(pl.py * 100) } : { w: Math.round(it.rect.w), h: Math.round(it.rect.h) };
  const unit = E.set.frame ? '%' : '';
  for (const ax of ['w', 'h']) {
    const t = $(`#stProps [data-szt="${ax}"]`); if (t) t.textContent = vals[ax] + unit;
    const r = $(`#stProps [data-szr="${ax}"]`); if (r && document.activeElement !== r) r.value = vals[ax];
  }
  $$('#stProps [data-item="fit"] button').forEach((b) => b.classList.toggle('on', b.dataset.v === it.fit));
}
// 가로(w) · 세로(h) 크기를 바꿔요. 틀: 맞춤 크기 대비 %, 자유 배치: mm. 비율 유지면 둘 다 같이, 늘 칸 · 용지 안에서.
function setSize(it, ax, val) {
  const lock = it.lock !== false;
  if (E.set.frame) {
    const area = slotsOf(E.set)[it.slot].img;
    toManual(it, area);
    const fr = fitRect(it, area);
    const m = it.mrect;
    const cur = ax === 'w' ? m.w : m.h;
    const want = ax === 'w' ? val / 100 * fr.w / area.w : val / 100 * fr.h / area.h;
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    if (lock) {
      const r = Math.min(want / cur, 1 / m.w, 1 / m.h);
      m.w *= r; m.h *= r;
    } else if (ax === 'w') m.w = Math.min(1, want); else m.h = Math.min(1, want);
    it.mrect = clampM({ ...m, x: cx - m.w / 2, y: cy - m.h / 2 });
    return;
  }
  const r0 = it.rect;
  const cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2;
  let w = r0.w, h = r0.h;
  if (lock) { const f = val / (ax === 'w' ? r0.w : r0.h); w *= f; h *= f; } else if (ax === 'w') w = val; else h = val;
  w = Math.max(10, w); h = Math.max(10, h);
  it.rect = { x: cx - w / 2, y: cy - h / 2, w, h };
}
// 비율 그대로 몇 배로 (−/+ 버튼 · 트랙패드 오므리기)
function scaleSel(it, f) {
  if (E.set.frame) {
    const area = slotsOf(E.set)[it.slot].img;
    toManual(it, area);
    const m = it.mrect;
    const r = Math.min(f, 1 / m.w, 1 / m.h);
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    it.mrect = clampM({ w: m.w * r, h: m.h * r, x: cx - m.w * r / 2, y: cy - m.h * r / 2 });
  } else {
    const r = it.rect;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const w = Math.max(10, r.w * f), h = Math.max(10, r.h * f);
    it.rect = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
}
root.addEventListener('click', (e) => {
  const it = findItem(E.sel)?.it;
  const item = e.target.closest('[data-item]');
  if (item && it) {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (!v) return;
    commit(() => {
      if (item.dataset.item === 'fit') {
        const area = slotsOf(E.set)[it.slot].img;
        if (v === 'manual') toManual(it, area); // 지금 크기에서 이어서 조절
        else { it.fit = v; delete it.mrect; }
      } else if (item.dataset.item === 'align') {
        it.align = v;
        if (it.fit === 'manual' && it.mrect) it.mrect.y = v === 'top' ? 0 : v === 'bottom' ? 1 - it.mrect.h : (1 - it.mrect.h) / 2;
      } else it[item.dataset.item] = v;
    });
    return;
  }
  const isz = e.target.closest('[data-isz]')?.dataset.isz;
  if (isz && it) {
    const ax = isz[0], up = isz[1] === '+';
    const pl = placeOf(E.set, it);
    const cur = E.set.frame ? Math.round((ax === 'w' ? pl.px : pl.py) * 100) : Math.round(ax === 'w' ? it.rect.w : it.rect.h);
    const step = E.set.frame ? 5 : 5;
    commit(() => setSize(it, ax, Math.max(E.set.frame ? 15 : 10, cur + (up ? step : -step))));
    return;
  }
  if (e.target.closest('[data-lock]') && it) { commit(() => { it.lock = it.lock === false; }); return; }
  const pp = e.target.closest('[data-pp]')?.dataset.pp;
  if (pp === 'crop' && it) openCrop(it.id);
  if (pp === 'uncrop' && it) commit(() => { const keep = it.rect ? stretchOf(it, it.rect) : 1; it.crop = { ...NOCROP }; fixFreeAspect(it, keep); if (it.fit === 'manual') { it.fit = 'fit'; delete it.mrect; } });
  if (pp === 'ratio' && it) commit(() => restoreRatio(it));
  const tg = e.target.closest('[data-tg]');
  if (tg && !tg.disabled) commit((set) => { set[tg.dataset.tg] = !set[tg.dataset.tg]; });
});
// 원래 비율로 (가로는 두고 세로를 맞춰요. 칸을 넘치면 둘 다 줄여요)
function restoreRatio(it) {
  const { vw, vh } = visDims(it);
  if (E.set.frame) {
    const area = slotsOf(E.set)[it.slot].img;
    toManual(it, area);
    const m = it.mrect;
    let w = m.w, h = m.w * area.w * vh / vw / area.h;
    if (h > 1) { w = w / h; h = 1; }
    it.mrect = clampM({ x: m.x, y: m.y, w, h });
  } else fixFreeAspect(it);
}
let propsT;
function renderPropsSoon() { clearTimeout(propsT); propsT = setTimeout(renderProps, 120); }

function renderAll() {
  if (!E.active) return;
  renderTop(); renderTools(); renderStage(); renderStrip(); renderProps(); renderLib();
  if (E.layer === 'preview') renderPreview();
}

// ══════════════════════════════════════════════════════ 끌기 (목록 → 페이지, 칸 옮기기, 이동 · 크기)
function pagePoint(pg, x, y) {
  const r = pg.getBoundingClientRect();
  return { x: (x - r.left) / K, y: (y - r.top) / K };
}
function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !E.set) return null;
  const pg = el.closest('#stStage .pg');
  if (E.set.frame) {
    const sl = el.closest('#stStage .slot') || (pg && slotAtPoint(pg, x, y));
    if (sl) return { page: E.page, slot: Number(sl.dataset.slot), el: sl };
  } else if (pg) {
    const p = pagePoint(pg, x, y);
    return { page: E.page, x: p.x, y: p.y, el: pg };
  }
  const th = el.closest('[data-goto]');
  if (th) return { gotoPage: Number(th.dataset.goto), el: th };
  if (el.closest('[data-addpage]')) return { newPage: true, el: el.closest('[data-addpage]') };
  return null;
}
function slotAtPoint(pg, x, y) {
  return [...pg.querySelectorAll('.slot')].find((s) => { const r = s.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
}
function dragGhost(html) {
  const g = document.createElement('div');
  g.className = 'st-ghost';
  g.innerHTML = html;
  document.body.append(g);
  return g;
}
function trackPointer(e, { onMove, onEnd, threshold = 4 }) {
  const sx = e.clientX, sy = e.clientY;
  let started = false;
  const move = (ev) => {
    if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < threshold) return;
    started = true;
    onMove(ev, ev.clientX - sx, ev.clientY - sy);
  };
  const up = (ev) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    onEnd(ev, started);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}
let lastHover = null;
function hover(t) {
  if (lastHover && lastHover !== t?.el) lastHover.classList.remove('drop');
  lastHover = t?.el || null;
  lastHover?.classList.add('drop');
}
// 목록에서 끌기
root.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.st-song');
  if (!row || e.button !== 0 || !E.set) return;
  const s = S.byId.get(row.dataset.id);
  let ghost = null;
  trackPointer(e, {
    onMove: (ev) => {
      if (!ghost) ghost = dragGhost(`${row.querySelector('.th').outerHTML}<b>${esc(s._prep.norm)}</b>${s.chord ? plate(s.chord) : ''}`);
      ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
      hover(dropTarget(ev.clientX, ev.clientY));
    },
    onEnd: async (ev, moved) => {
      ghost?.remove();
      hover(null);
      if (!moved) return;
      const t = dropTarget(ev.clientX, ev.clientY);
      if (!t) return;
      if (t.gotoPage !== undefined) { E.page = t.gotoPage; await addSheet(s, null); return; }
      if (t.newPage) { commit((set) => set.pages.push({ items: [] }), { render: false }); E.page = E.set.pages.length - 1; await addSheet(s, E.set.frame ? { page: E.page, slot: 0 } : null); return; }
      await addSheet(s, t);
    },
  });
});
root.addEventListener('dblclick', (e) => {
  const row = e.target.closest('.st-song');
  if (row && E.set) addSheet(S.byId.get(row.dataset.id), null);
});
root.addEventListener('keydown', (e) => {
  const row = e.target.closest?.('.st-song');
  if (row && e.key === 'Enter' && E.set) { e.preventDefault(); addSheet(S.byId.get(row.dataset.id), null); }
});

// 페이지 안의 악보: 고르기 · 칸 옮기기 · 위치 옮기기 · 크기 바꾸기
root.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !E.set || E.layer) return;
  const pg = e.target.closest('#stStage .pg');
  if (!pg) {
    if (e.target.closest('#stStage') && !e.target.closest('.st-mini')) { E.sel = null; renderStage(); renderProps(); }
    return;
  }
  if (e.target.closest('.st-mini')) return;
  const hd = e.target.closest('.hd');
  const itEl = e.target.closest('.it') || (e.target.closest('.sel-box') && pg.querySelector(`.it[data-id="${E.sel}"]`));
  if (!itEl && !hd) { E.sel = null; drawSelection(); renderProps(); return; }
  const f = findItem(hd ? E.sel : itEl.dataset.id);
  if (!f) return;
  const it = f.it;
  if (E.sel !== it.id) { E.sel = it.id; drawSelection(); renderProps(); }
  e.preventDefault();
  const before = snapshot();
  const pushOnce = () => { if (E.hist[E.hist.length - 1] !== before) { E.hist.push(before); E.fut = []; } };
  if (!E.set.frame) {
    // 자유 배치: 옮기기 · 모서리(비율 유지 켜면 비율 그대로) · 가장자리(가로나 세로만)
    const r0 = { ...it.rect };
    trackPointer(e, {
      threshold: 2,
      onMove: (ev, dx, dy) => {
        pushOnce();
        const mx = dx / K, my = dy / K;
        if (hd) it.rect = resizeRect(r0, hd.dataset.h, mx, my, it.lock !== false, null);
        else {
          const { W, H } = paperOf(E.set);
          it.rect = { ...r0, x: clamp(r0.x + mx, -r0.w * 0.8, W - r0.w * 0.2), y: clamp(r0.y + my, -r0.h * 0.8, H - r0.h * 0.2) };
        }
        renderStage();
        syncSizeUI(it);
      },
      onEnd: (ev, moved) => { if (moved) { scheduleSave(); renderAll(); } },
    });
    return;
  }
  const area = slotsOf(E.set)[it.slot].img;
  if (hd || it.fit === 'manual') {
    // 틀: 칸 안에서만 크기 · 위치 바꾸기 (칸 밖으로는 나가지 않아요)
    let r0f = null;
    trackPointer(e, {
      threshold: 2,
      onMove: (ev, dx, dy) => {
        pushOnce();
        toManual(it, area);
        if (!r0f) r0f = placeIn(it, area).vis;
        const mx = dx / K, my = dy / K;
        const r = hd ? resizeRect(r0f, hd.dataset.h, mx, my, it.lock !== false, area)
          : { ...r0f, x: clamp(r0f.x + mx, area.x, area.x + area.w - r0f.w), y: clamp(r0f.y + my, area.y, area.y + area.h - r0f.h) };
        it.mrect = clampM({ x: (r.x - area.x) / area.w, y: (r.y - area.y) / area.h, w: r.w / area.w, h: r.h / area.h });
        renderStage();
        syncSizeUI(it);
      },
      onEnd: (ev, moved) => { if (moved) { scheduleSave(); renderAll(); } },
    });
    return;
  }
  if (it.fit === 'fit' && !hd) {
    // 틀: 다른 칸으로 옮기기 (있던 악보와 자리 바꾸기)
    let ghost = null;
    trackPointer(e, {
      onMove: (ev) => {
        if (!ghost) { ghost = dragGhost(`<b>${esc(it.ref.title)}</b>${it.ref.chord ? plate(it.ref.chord) : ''}<small>다른 칸에 놓으면 자리를 바꿔요</small>`); itEl.classList.add('lifted'); }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        hover(dropTarget(ev.clientX, ev.clientY));
      },
      onEnd: (ev, moved) => {
        ghost?.remove(); hover(null); itEl.classList.remove('lifted');
        if (!moved) return;
        const t = dropTarget(ev.clientX, ev.clientY);
        if (!t) return;
        commit((set) => {
          const from = set.pages[f.page];
          const me = from.items.find((x) => x.id === it.id);
          let toPage = t.page, toSlot = t.slot;
          if (t.gotoPage !== undefined || t.newPage) {
            if (t.newPage) set.pages.push({ items: [] });
            toPage = t.newPage ? set.pages.length - 1 : t.gotoPage;
            const used = new Set(set.pages[toPage].items.map((x) => x.slot));
            toSlot = [...Array(set.frame).keys()].find((i) => !used.has(i));
            if (toSlot === undefined) { toast('그 쪽에는 빈 칸이 없어요'); return; }
          }
          if (toSlot === undefined) return;
          const other = set.pages[toPage].items.find((x) => x.slot === toSlot && x.id !== me.id);
          if (other) { other.slot = me.slot; if (toPage !== f.page) { set.pages[toPage].items = set.pages[toPage].items.filter((x) => x !== other); from.items.push(other); } }
          if (toPage !== f.page) { from.items = from.items.filter((x) => x !== me); set.pages[toPage].items.push(me); }
          me.slot = toSlot;
          E.page = toPage;
        });
      },
    });
    return;
  }
});
// 손잡이로 크기 바꾸기: 반대쪽을 고정하고, 모서리는 (비율 유지면) 비율 그대로, 가장자리는 한 방향만. B = 넘지 못하는 칸
function resizeRect(r0, h, dx, dy, lock, B) {
  const MIN = 8;
  if (lock && h.length === 2) {
    const ax = h.includes('w') ? r0.x + r0.w : r0.x, ay = h.includes('n') ? r0.y + r0.h : r0.y;
    let sc = ((r0.w + (h.includes('e') ? dx : -dx)) / r0.w + (r0.h + (h.includes('s') ? dy : -dy)) / r0.h) / 2;
    sc = Math.max(sc, MIN / Math.min(r0.w, r0.h));
    if (B) {
      const aw = h.includes('e') ? B.x + B.w - ax : ax - B.x, ah = h.includes('s') ? B.y + B.h - ay : ay - B.y;
      sc = Math.min(sc, aw / r0.w, ah / r0.h);
    }
    const w = r0.w * sc, hh = r0.h * sc;
    return { x: h.includes('w') ? ax - w : ax, y: h.includes('n') ? ay - hh : ay, w, h: hh };
  }
  let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
  if (h.includes('w')) x0 = Math.min(x1 - MIN, x0 + dx);
  if (h.includes('e')) x1 = Math.max(x0 + MIN, x1 + dx);
  if (h.includes('n')) y0 = Math.min(y1 - MIN, y0 + dy);
  if (h.includes('s')) y1 = Math.max(y0 + MIN, y1 + dy);
  if (B) { x0 = Math.max(B.x, x0); y0 = Math.max(B.y, y0); x1 = Math.min(B.x + B.w, x1); y1 = Math.min(B.y + B.h, y1); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// 트랙패드 오므리기 · 벌리기 (⌘ · ctrl + 휠) 로 고른 악보 확대 · 축소
let wheelPush = 0;
root.addEventListener('wheel', (e) => {
  if (!E.set || E.layer || !(e.ctrlKey || e.metaKey)) return;
  const f = findItem(E.sel);
  if (!f || !e.target.closest('#stStage')) return;
  e.preventDefault();
  if (Date.now() - wheelPush > 800) { E.hist.push(snapshot()); E.fut = []; }
  wheelPush = Date.now();
  scaleSel(f.it, clamp(Math.exp(-e.deltaY * 0.01), 0.85, 1.18));
  renderStage(); scheduleSave(); syncSizeUI(f.it);
}, { passive: false });
addEventListener('resize', () => { if (E.active) { renderStage(); renderStrip(); if (E.layer === 'preview') renderPreview(); if (E.layer === 'crop') drawCrop(); } });

// ══════════════════════════════════════════════════════ 세트 목록 · 새 세트(틀 고르기)
function openSets() {
  E.layer = 'sets';
  E.sel = null;
  const L = $('#stLayer');
  L.hidden = false;
  L.className = 'st-layer sets';
  renderSets();
}
function closeLayer() {
  E.layer = '';
  E.crop = null;
  $('#stLayer').hidden = true;
  $('#stLayer').innerHTML = '';
  renderAll();
}
function presets() { return E.presets?.length ? E.presets : DEFAULT_PRESETS; }
function presetName(p) { return `${p.paper} ${p.orient === 'landscape' ? '가로' : '세로'} · ${p.frame ? p.frame + '곡' : '자유'}`; }
function renderSets() {
  const L = $('#stLayer');
  const list = E.sets;
  L.innerHTML = `<div class="sets-wrap">
    <div class="sets-head"><div><h2>세트</h2><span class="muted">악보 배치를 저장해 두고 다시 열어 고치거나 바로 인쇄해요</span></div>
      <span class="spacer"></span>${E.set ? `<button class="btn" data-sets="close">${I.back}지금 세트로 돌아가기</button>` : ''}
      <button class="btn go" data-sets="new">${I.plus}새 세트</button></div>
    <div class="sets-sec"><span class="sets-h">자주 쓰는 틀 <small>누르면 그 틀로 새 세트를 만들어요</small></span>
      <div class="presets">${presets().map((p, i) => `<span class="preset"><button data-preset="${i}"><span class="pi ${p.orient}">${p.frame ? '<i></i>'.repeat(p.frame) : '<i style="flex:1.4"></i><i></i>'}</span>${presetName(p)}</button><button class="px" data-delpreset="${i}" aria-label="${presetName(p)} 틀 지우기" title="이 틀 지우기">${I.x}</button></span>`).join('')}
      ${E.set ? `<button class="preset-add" data-sets="savepreset">+ 지금 틀 저장 <small>${presetName(E.set)}</small></button>` : ''}</div></div>
    <div class="sets-sec"><span class="sets-h">저장한 세트 · ${list.length}개</span>
      ${list.length ? `<div class="set-grid" id="setGrid"></div>` : '<div class="st-empty big">아직 저장한 세트가 없어요. <b>새 세트</b>를 눌러 시작해 보세요.</div>'}</div>
    </div>`;
  const grid = $('#setGrid');
  if (!grid) return;
  for (const set of list) {
    const card = document.createElement('div');
    card.className = 'set-card' + (E.set?.id === set.id ? ' on' : '');
    card.dataset.set = set.id;
    const { W, H } = paperOf(set);
    const k = Math.min(200 / W, 150 / H);
    const th = document.createElement('div');
    th.className = 'sc-th';
    const view = JSON.parse(JSON.stringify(set));
    migrateSet(view);
    th.append(pageDOM(view, 0, k, { static: true, q: 'thumb' }));
    th.insertAdjacentHTML('beforeend', `<span class="sc-pages">${set.pages.length}쪽</span>`);
    card.append(th);
    const songs = songsOf(set);
    card.insertAdjacentHTML('beforeend', `<div class="sc-body"><div class="sc-row"><b>${esc(set.name)}</b><button class="icon-btn sc-more" data-setmenu="${set.id}" aria-label="${esc(set.name)} 더 보기">⋯</button></div>
      <span class="muted">${setMeta(set)} · ${set.updated ? (isToday(set.updated) ? '오늘 ' + timeStr(set.updated) : fmtDate(set.updated)) : ''}</span>
      <span class="muted ell">${songs.length ? esc(songs.slice(0, 4).join(' · ')) + (songs.length > 4 ? ' …' : '') : '아직 악보가 없어요'}</span>
      <div class="sc-btns"><button class="btn go" data-open="${set.id}">열기</button><button class="btn" data-quickprint="${set.id}" ${itemCount(set) ? '' : 'disabled'}>바로 인쇄</button></div></div>`);
    grid.append(card);
  }
}
$('#studio').addEventListener('click', async (e) => {
  if (E.layer !== 'sets') return;
  const a = e.target.closest('[data-sets]')?.dataset.sets;
  if (a === 'close') return closeLayer();
  if (a === 'new') return openFrames();
  if (a === 'savepreset' && E.set) {
    const p = { paper: E.set.paper, orient: E.set.orient, frame: E.set.frame, margin: E.set.margin };
    const list = presets().filter((x) => presetName(x) !== presetName(p));
    E.presets = [p, ...list].slice(0, 8);
    api('/api/presets', { presets: E.presets }).catch(() => {});
    renderSets();
    return toast(`'${presetName(p)}' 틀을 저장했어요`);
  }
  const pi = e.target.closest('[data-preset]')?.dataset.preset;
  if (pi !== undefined) return createSet({ ...presets()[Number(pi)] });
  const dp = e.target.closest('[data-delpreset]')?.dataset.delpreset;
  if (dp !== undefined) {
    E.presets = presets().filter((_, i) => i !== Number(dp));
    api('/api/presets', { presets: E.presets }).catch(() => {});
    return renderSets();
  }
  const open = e.target.closest('[data-open]')?.dataset.open;
  if (open) return openSet(open);
  const qp = e.target.closest('[data-quickprint]')?.dataset.quickprint;
  if (qp) { openSet(qp); return printNow(); }
  const menu = e.target.closest('[data-setmenu]');
  if (menu) return setMenu(menu, menu.dataset.setmenu);
});
function setMenu(btn, id) {
  const el = $('#ctx');
  el.innerHTML = '<button data-sm="rename">이름 바꾸기…</button><button data-sm="dup">복제</button><hr><button data-sm="del" class="danger">지우기</button>';
  el.hidden = false;
  const r = btn.getBoundingClientRect();
  el.style.left = Math.min(r.left, innerWidth - el.offsetWidth - 8) + 'px';
  el.style.top = (r.bottom + 6) + 'px';
  el.onclick = async (e) => {
    const m = e.target.closest('[data-sm]')?.dataset.sm;
    el.hidden = true;
    const set = E.sets.find((x) => x.id === id);
    if (!set || !m) return;
    if (m === 'rename') {
      const name = await promptBox('세트 이름 바꾸기', set.name);
      if (!name) return;
      set.name = name;
      if (E.set?.id === id) E.set.name = name;
      await api('/api/sets/save', { set }).catch(() => {});
      renderSets(); renderTop();
    }
    if (m === 'dup') {
      const copy = JSON.parse(JSON.stringify(set));
      copy.id = rid(); copy.name = set.name + ' 복사본'; copy.created = Date.now();
      const j = await api('/api/sets/save', { set: copy }).catch(() => null);
      if (j) { copy.updated = j.updated; E.sets.unshift(copy); renderSets(); toast('세트를 복제했어요'); }
    }
    if (m === 'del') {
      if (!(await confirmBox('세트 지우기', `<b>${esc(set.name)}</b> 세트를 지울까요?<br><span class="muted">악보 파일은 지워지지 않아요.</span>`, '지우기'))) return;
      await api('/api/sets/delete', { id }).catch(() => {});
      E.sets = E.sets.filter((x) => x.id !== id);
      if (E.set?.id === id) { E.set = null; E.hist = []; E.fut = []; }
      renderSets(); renderTop();
    }
  };
}
function promptBox(title, value) {
  return new Promise((res) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-label="${esc(title)}" style="width:420px"><div class="modal-head"><b>${esc(title)}</b></div><div class="modal-body"><input type="text" class="st-input" maxlength="60" value="${esc(value)}" aria-label="이름"><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-a="no">취소</button><button class="btn go" data-a="yes">바꾸기</button></div></div></div>`;
    $('#modalRoot').append(back);
    const inp = back.querySelector('input');
    inp.focus(); inp.select();
    const done = (v) => { back.remove(); res(v); };
    back.addEventListener('click', (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a) done(a === 'yes' ? inp.value.trim() : ''); if (e.target === back) done(''); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(''); });
  });
}
function openSet(id) {
  const set = E.sets.find((x) => x.id === id);
  if (!set) return;
  if (E.set && E.saving) saveNow();
  E.set = JSON.parse(JSON.stringify(set));
  migrateSet(E.set);
  E.page = 0; E.sel = null; E.hist = []; E.fut = []; E.zoom = 1;
  E.print.name = '';
  resolveRefs();
  closeLayer();
}
function createSet(o) {
  if (E.set && E.saving) saveNow();
  E.set = newSet(o);
  E.page = 0; E.sel = null; E.hist = []; E.fut = []; E.zoom = 1;
  E.print.name = '';
  closeLayer();
  saveNow();
}
// 악보 번호가 바뀐 것(코드를 바꾼 경우)을 다시 찾아 이어 줘요
function resolveRefs() {
  if (!E.set) return;
  let changed = false;
  for (const p of E.set.pages) for (const it of p.items) {
    const before = it.ref.id;
    sheetOf(it.ref);
    if (it.ref.id !== before) changed = true;
  }
  if (changed) scheduleSave();
}

// ── 틀 고르기 (새 세트) ──
function openFrames() {
  const o = { ...(presets()[0] || DEFAULT_PRESETS[0]) };
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = '<div class="modal fr-modal" role="dialog" aria-label="새 페이지 틀 고르기"></div>';
  $('#modalRoot').append(back);
  const m = back.querySelector('.fr-modal');
  const scale = (paper, orient, n) => {
    const [a, b] = PAPER[paper];
    const [W, H] = orient === 'landscape' ? [b, a] : [a, b];
    const s = Math.min(((W - 20 - GAP * (n - 1)) / n) / 210, (H - 20) / 297);
    return Math.round(s * 100);
  };
  const draw = () => {
    const card = (n, name, desc, rec) => `<button class="fr-card ${o.frame === n ? 'on' : ''}" data-fr="${n}">
        <div class="fr-art"><div class="fr-page ${o.orient}">${n ? Array.from({ length: n }, () => '<div class="fr-col"><i class="t"></i><i></i><i></i><i></i><i></i><i></i></div>').join('') : '<div class="fr-free a"></div><div class="fr-free b"></div><div class="fr-free c"></div>'}</div></div>
        <div class="fr-name"><b>${name}</b>${rec ? '<span class="rec">추천</span>' : ''}</div><span class="muted">${desc}</span></button>`;
    const pct = (n) => (n ? scale(o.paper, o.orient, n) : null);
    m.innerHTML = `<div class="modal-head"><div><b>새 페이지 틀 고르기</b><div class="muted small">용지와 방향을 고르고, 한 페이지에 몇 곡을 나란히 넣을지 정해요. 나중에 언제든 바꿀 수 있어요.</div></div><span class="spacer"></span><button class="icon-btn" data-fr-a="close" aria-label="닫기">✕</button></div>
      <div class="fr-body">
        <div class="fr-row">
          <div class="fr-grp"><span>용지</span><div class="fr-opts">${['A4', 'A3'].map((p) => `<button class="fr-opt ${o.paper === p ? 'on' : ''}" data-paper="${p}"><i class="pp ${p}"></i><span><b>${p}</b><small>${PAPER[p][0]} × ${PAPER[p][1]} mm</small></span></button>`).join('')}</div></div>
          <div class="fr-grp"><span>방향</span><div class="fr-opts">${[['portrait', '세로'], ['landscape', '가로']].map(([v, l]) => `<button class="fr-opt col ${o.orient === v ? 'on' : ''}" data-orient="${v}"><i class="po ${v}"></i><b>${l}</b></button>`).join('')}</div></div>
          <div class="fr-grp grow"><span>여백</span><div class="fr-margins">${MARGINS.map(([v, l]) => `<button class="${o.margin === v ? 'on' : ''}" data-margin="${v}">${l}<small>${v}mm</small></button>`).join('')}</div></div>
        </div>
        <span class="fr-h">한 페이지에 · ${o.paper} ${o.orient === 'landscape' ? '가로' : '세로'}</span>
        <div class="fr-cards">
          ${card(1, '1곡', `한 곡을 페이지 가득. 원본 대비 ${pct(1)}%.`)}
          ${card(2, '2곡 나란히', `두 곡을 좌우로. 원본 대비 ${pct(2)}%.`, o.orient === 'landscape')}
          ${card(3, '3곡 나란히', `세 곡을 좌우로. 원본 대비 ${pct(3)}%.`)}
          ${card(0, '자유 배치', '칸 없이 원하는 곳에 놓고 크기를 직접 조절해요.')}
        </div>
        <div class="fr-note"><b>악보가 인쇄될 크기</b><span class="muted">원본 A4 악보 기준 · ${o.paper} ${o.orient === 'landscape' ? '가로' : '세로'}에 1곡 ${pct(1)}% · 2곡 ${pct(2)}% · 3곡 ${pct(3)}%${o.paper === 'A3' && o.orient === 'landscape' ? ' — A3 가로에 2곡이면 곡마다 A4 크기 그대로예요' : ''}</span></div>
      </div>
      <div class="fr-foot"><label class="fr-namein"><span>세트 이름</span><input type="text" class="st-input" id="frName" maxlength="60" placeholder="예: 이번 주 예배"></label><span class="spacer"></span><button class="btn" data-fr-a="close">취소</button><button class="btn go" data-fr-a="ok">이 틀로 시작</button></div>`;
  };
  draw();
  const close = () => back.remove();
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  m.addEventListener('click', (e) => {
    const t = e.target;
    const name = $('#frName')?.value || '';
    if (t.closest('[data-paper]')) o.paper = t.closest('[data-paper]').dataset.paper;
    else if (t.closest('[data-orient]')) o.orient = t.closest('[data-orient]').dataset.orient;
    else if (t.closest('[data-margin]')) o.margin = Number(t.closest('[data-margin]').dataset.margin);
    else if (t.closest('[data-fr]')) o.frame = Number(t.closest('[data-fr]').dataset.fr);
    else if (t.closest('[data-fr-a="close"]')) return close();
    else if (t.closest('[data-fr-a="ok"]')) { close(); return createSet({ ...o, name: name.trim() || undefined }); }
    else return;
    draw();
    $('#frName').value = name;
  });
  m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'frName') { close(); createSet({ ...o, name: e.target.value.trim() || undefined }); } if (e.key === 'Escape') close(); });
}

// ══════════════════════════════════════════════════════ 자르기
function openCrop(id) {
  const f = findItem(id);
  if (!f || !sheetOf(f.it.ref)) return;
  E.layer = 'crop';
  E.crop = { id, c: { ...(f.it.crop || NOCROP) }, orig: { ...(f.it.crop || NOCROP) }, url: '', R: null };
  const L = $('#stLayer');
  L.hidden = false;
  L.className = 'st-layer crop';
  const r = f.it.ref;
  L.innerHTML = `<div class="cr-head"><button class="icon-btn" data-cr="cancel" aria-label="편집으로 돌아가기">${I.back}</button><b>자르기</b><span class="muted">${esc(r.title)}</span>${r.chord ? plate(r.chord) : ''}
      <span class="spacer"></span><button class="btn" data-cr="reset">원래대로</button><button class="btn" data-cr="cancel">취소</button><button class="btn go" data-cr="apply">적용 <span class="kbd">↩</span></button></div>
    <div class="cr-body"><div class="cr-stage" id="crStage"><div class="cr-img" id="crImg"><img alt="" id="crPic" draggable="false"><div class="cr-shade" id="crShade"></div><div class="cr-box" id="crBox">${['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].map((h) => `<i class="ch ${h}" data-ch="${h}"></i>`).join('')}<span class="g1"></span><span class="g2"></span><span class="g3"></span><span class="g4"></span></div></div></div>
      <aside class="cr-side">
        <div class="pp-sec"><span class="pp-h">빠르게 고르기</span><div class="cr-quick">
          <button data-q="top"><i class="qi"><b style="top:0;bottom:50%"></b></i>위쪽만</button><button data-q="bottom"><i class="qi"><b style="top:50%;bottom:0"></b></i>아래쪽만</button>
          <button data-q="auto"><i class="qi"><b style="top:8%;bottom:8%;left:8%;right:8%"></b></i>빈 여백 자동</button><button data-q="all"><i class="qi"><b style="top:0;bottom:0"></b></i>전체</button></div></div>
        <div class="pp-sec"><span class="pp-h">잘라낸 양</span><div class="cr-amts" id="crAmts"></div></div>
        <div class="pp-sec"><span class="pp-h">칸에 들어갈 모습</span><div class="cr-prev" id="crPrev"></div></div>
        <span class="spacer"></span>
        <div class="cr-tip">테두리나 모서리를 끌어 필요한 부분만 남기세요. 원본 파일은 그대로이고, 언제든 <b>원래대로</b>를 누르면 다시 펼쳐져요.</div>
      </aside></div>`;
  getSrc(r, 'full').then((src) => {
    const pic = $('#crPic');
    if (!pic) return;
    pic.onload = () => drawCrop();
    pic.src = src.url;
  }).catch(() => toast('⚠️ 악보를 열지 못했어요'));
  drawCrop();
}
function drawCrop() {
  if (E.layer !== 'crop' || !E.crop) return;
  const f = findItem(E.crop.id);
  const st = $('#crStage'), wrap = $('#crImg');
  if (!f || !st || !wrap) return;
  const { W, H } = visDims({ ...f.it, crop: NOCROP });
  const aw = st.clientWidth - 80, ah = st.clientHeight - 80;
  const s = Math.min(aw / W, ah / H);
  const w = W * s, h = H * s;
  Object.assign(wrap.style, { width: w + 'px', height: h + 'px' });
  E.crop.R = { w, h };
  const c = E.crop.c;
  const bx = c.l * w, by = c.t * h, bw = w * (1 - c.l - c.r), bh = h * (1 - c.t - c.b);
  Object.assign($('#crBox').style, { left: bx + 'px', top: by + 'px', width: bw + 'px', height: bh + 'px' });
  $('#crShade').style.clipPath = `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${bx}px ${by}px, ${bx}px ${by + bh}px, ${bx + bw}px ${by + bh}px, ${bx + bw}px ${by}px, ${bx}px ${by}px)`;
  $('#crAmts').innerHTML = [['위', c.t], ['아래', c.b], ['왼쪽', c.l], ['오른쪽', c.r]].map(([n, v]) => `<div><span class="muted">${n}</span><b>${Math.round(v * 100)}%</b></div>`).join('');
  // 칸에 들어갈 모습 (지금 페이지를 작게)
  const tmp = JSON.parse(JSON.stringify(E.set));
  const t = tmp.pages[f.page].items.find((x) => x.id === f.it.id);
  const keep = t.rect ? stretchOf(f.it, f.it.rect) : 1;
  t.crop = { ...c };
  if (t.fit === 'manual') { t.fit = 'fit'; delete t.mrect; }
  fixFreeAspect(t, keep);
  const { W: PW, H: PH } = paperOf(tmp);
  const k = Math.min(250 / PW, 150 / PH);
  const prev = $('#crPrev');
  prev.innerHTML = '';
  const pg = pageDOM(tmp, f.page, k, { static: true, q: 'thumb' });
  const mine = pg.querySelector(`.it[data-id="${f.it.id}"]`);
  mine?.classList.add('hl');
  prev.append(pg);
}
function applyCrop() {
  const f = findItem(E.crop?.id);
  if (!f) return closeLayer();
  const c = E.crop.c;
  commit(() => {
    const keep = f.it.rect ? stretchOf(f.it, f.it.rect) : 1;
    f.it.crop = { ...c };
    if (E.set.frame && f.it.fit === 'manual') { f.it.fit = 'fit'; delete f.it.mrect; }
    fixFreeAspect(f.it, keep);
  }, { render: false });
  closeLayer();
}
$('#studio').addEventListener('click', (e) => {
  if (E.layer !== 'crop') return;
  const a = e.target.closest('[data-cr]')?.dataset.cr;
  if (a === 'cancel') return closeLayer();
  if (a === 'apply') return applyCrop();
  if (a === 'reset') { E.crop.c = { ...NOCROP }; return drawCrop(); }
  const q = e.target.closest('[data-q]')?.dataset.q;
  if (!q) return;
  if (q === 'top') E.crop.c = { l: 0, r: 0, t: 0, b: 0.5 };
  if (q === 'bottom') E.crop.c = { l: 0, r: 0, t: 0.5, b: 0 };
  if (q === 'all') E.crop.c = { ...NOCROP };
  if (q === 'auto') return autoTrim();
  drawCrop();
});
// 빈 여백 자동: 글자 · 오선이 있는 곳만 남겨요
function autoTrim() {
  const pic = $('#crPic');
  if (!pic?.naturalWidth) return;
  const s = Math.min(1, 900 / Math.max(pic.naturalWidth, pic.naturalHeight));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(pic.naturalWidth * s)); cv.height = Math.max(1, Math.round(pic.naturalHeight * s));
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(pic, 0, 0, cv.width, cv.height);
  let d;
  try { d = ctx.getImageData(0, 0, cv.width, cv.height).data; } catch { return toast('이 악보는 자동으로 찾지 못했어요'); }
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  // 가장자리의 얇은 테두리 · 그림자는 빼고 찾아요
  const edge = Math.round(Math.min(cv.width, cv.height) * 0.01);
  for (let y = edge; y < cv.height - edge; y++) {
    let ink = 0;
    for (let x = edge; x < cv.width - edge; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 < 200) { ink++; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
    if (ink) { if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) return toast('빈 여백을 찾지 못했어요');
  const pad = 0.015;
  E.crop.c = {
    l: clamp(x0 / cv.width - pad, 0, 0.45), r: clamp(1 - x1 / cv.width - pad, 0, 0.45),
    t: clamp(y0 / cv.height - pad, 0, 0.45), b: clamp(1 - y1 / cv.height - pad, 0, 0.45),
  };
  drawCrop();
}
root.addEventListener('pointerdown', (e) => {
  if (E.layer !== 'crop' || !E.crop?.R) return;
  const h = e.target.closest('[data-ch]')?.dataset.ch || (e.target.closest('#crBox') ? 'move' : null);
  if (!h) return;
  e.preventDefault();
  const c0 = { ...E.crop.c };
  const { w, h: H } = E.crop.R;
  const MIN = 0.06;
  trackPointer(e, {
    threshold: 1,
    onMove: (ev, dx, dy) => {
      const fx = dx / w, fy = dy / H;
      const c = { ...c0 };
      if (h === 'move') {
        const mx = clamp(fx, -c0.l, c0.r), my = clamp(fy, -c0.t, c0.b);
        c.l = c0.l + mx; c.r = c0.r - mx; c.t = c0.t + my; c.b = c0.b - my;
      } else {
        if (h.includes('w')) c.l = clamp(c0.l + fx, 0, 1 - c0.r - MIN);
        if (h.includes('e')) c.r = clamp(c0.r - fx, 0, 1 - c0.l - MIN);
        if (h.includes('n')) c.t = clamp(c0.t + fy, 0, 1 - c0.b - MIN);
        if (h.includes('s')) c.b = clamp(c0.b - fy, 0, 1 - c0.t - MIN);
      }
      E.crop.c = c;
      drawCrop();
    },
    onEnd: () => {},
  });
});

// ══════════════════════════════════════════════════════ 미리보기 · 인쇄 · PDF
function defaultPdfName() { return E.print.name || `${E.set.name} ${today()}`; }
function openPreview() {
  if (!E.set || !itemCount(E.set)) return;
  E.layer = 'preview';
  E.pv = E.page;
  const L = $('#stLayer');
  L.hidden = false;
  L.className = 'st-layer preview';
  renderPreview(true);
}
function renderPreview(full) {
  const L = $('#stLayer');
  const s = E.set;
  E.pv = clamp(E.pv, 0, s.pages.length - 1);
  if (full || !$('#pvMain')) {
    L.innerHTML = `<div class="pv-head"><button class="btn" data-pv="close">${I.back}편집</button><b>미리보기</b><span class="muted">${esc(s.name)} · ${s.paper} ${s.orient === 'landscape' ? '가로' : '세로'} · ${s.pages.length}쪽 · 악보 ${itemCount(s)}개</span>
        <span class="spacer"></span><button class="btn" data-pv="pdf">${I.down}PDF로 저장</button><button class="btn go" data-pv="print">${I.print}인쇄 <span class="kbd">⌘P</span></button></div>
      <div class="pv-body"><nav class="pv-nav" id="pvNav"></nav>
        <div class="pv-main" id="pvMain"></div>
        <aside class="pv-side" id="pvSide"></aside></div>`;
  }
  const { W, H } = paperOf(s);
  const nav = $('#pvNav');
  nav.innerHTML = '';
  const kn = Math.min(100 / W, 100 / H);
  s.pages.forEach((p, i) => {
    const d = document.createElement('button');
    d.className = 'pv-th' + (i === E.pv ? ' on' : '');
    d.dataset.pvgo = i;
    d.append(pageDOM(s, i, kn, { static: true, q: 'thumb' }));
    d.insertAdjacentHTML('beforeend', `<span>${i + 1}쪽</span>`);
    nav.append(d);
  });
  const main = $('#pvMain');
  const aw = main.clientWidth - 140, ah = main.clientHeight - 80;
  const k = Math.max(0.5, Math.min(aw / W, ah / H));
  main.innerHTML = `<div class="pv-row"><button class="pv-arrow" data-pvstep="-1" aria-label="이전 쪽" ${E.pv ? '' : 'disabled'}>${I.back}</button><div class="pv-paper" id="pvPaper"></div><button class="pv-arrow" data-pvstep="1" aria-label="다음 쪽" ${E.pv < s.pages.length - 1 ? '' : 'disabled'}>${I.next}</button></div>
    <span class="muted pv-cap">${E.pv + 1} / ${s.pages.length}쪽 · 인쇄될 모습 그대로예요</span>`;
  $('#pvPaper').append(pageDOM(s, E.pv, k, { static: true }));
  const P = E.print;
  $('#pvSide').innerHTML = `<b class="pv-title">인쇄 · 내보내기</b>
    <div class="pp-sec"><span class="pp-h">매수</span><div class="pv-copies"><button data-copies="-1" aria-label="한 부 줄이기">−</button><b>${P.copies}부</b><button data-copies="1" aria-label="한 부 늘리기">+</button></div></div>
    <div class="pp-sec"><span class="pp-h">페이지</span><div class="seg full" data-range><button data-v="all" class="${P.range === 'all' ? 'on' : ''}">전체 ${s.pages.length}쪽</button><button data-v="current" class="${P.range === 'current' ? 'on' : ''}">지금 쪽만 (${E.pv + 1}쪽)</button></div></div>
    <div class="pp-tg"><span>양면 인쇄</span><button class="tg ${P.duplex ? 'on' : ''}" data-duplex aria-pressed="${P.duplex}" aria-label="양면 인쇄"><i></i></button></div>
    <div class="pp-sec"><span class="pp-h">PDF 파일 이름</span><input type="text" class="st-input" id="pvName" value="${esc(defaultPdfName())}" maxlength="80" aria-label="PDF 파일 이름"></div>
    <div class="pv-note"><b>인쇄</b>를 누르면 맥 인쇄 창이 열려요. 프린터와 용지를 그곳에서 고르면 돼요.</div>
    ${s.paper === 'A3' ? '<div class="pv-note warn"><b>A3 용지</b>를 쓸 수 있는 프린터인지 확인하세요. 안 되면 인쇄 창에서 <b>\'용지에 맞추기\'</b>로 A4에 줄여 인쇄할 수 있어요.</div>' : ''}
`;
  $('#pvName').addEventListener('input', (e) => { E.print.name = e.target.value; });
}
$('#studio').addEventListener('click', (e) => {
  if (E.layer !== 'preview') return;
  const a = e.target.closest('[data-pv]')?.dataset.pv;
  if (a === 'close') return closeLayer();
  if (a === 'pdf') return savePDF();
  if (a === 'print') return printNow();
  const go = e.target.closest('[data-pvgo]')?.dataset.pvgo;
  if (go !== undefined) { E.pv = Number(go); return renderPreview(); }
  const st = e.target.closest('[data-pvstep]')?.dataset.pvstep;
  if (st) { E.pv += Number(st); return renderPreview(); }
  const cp = e.target.closest('[data-copies]')?.dataset.copies;
  if (cp) { E.print.copies = clamp(E.print.copies + Number(cp), 1, 99); return renderPreview(); }
  const rg = e.target.closest('[data-range] [data-v]')?.dataset.v;
  if (rg) { E.print.range = rg; return renderPreview(); }
  if (e.target.closest('[data-duplex]')) { E.print.duplex = !E.print.duplex; return renderPreview(); }
});

// ── PDF 만들기: 화면에서 '무엇을 어디에'를 계산해서 엔진에 보내요 ──
async function textPNG(text, wMM, hMM, sizeMM, { weight = 700, color = '#1b1a2b' } = {}) {
  try { await document.fonts.load(`${weight} 40px Pretendard`); } catch { /* 기본 글꼴로 */ }
  const px = (mm) => Math.max(1, Math.round(mm / 25.4 * 300));
  const cv = document.createElement('canvas');
  cv.width = px(wMM); cv.height = px(hMM);
  const ctx = cv.getContext('2d');
  ctx.font = `${weight} ${px(sizeMM)}px Pretendard, "Apple SD Gothic Neo", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > cv.width * 0.96) t = t.slice(0, -2) + '…';
  ctx.fillText(t, cv.width / 2, cv.height / 2);
  return cv.toDataURL('image/png').split(',')[1];
}
async function buildSpec(set, pageIdx, progress) {
  const { W, H } = paperOf(set);
  const pages = [];
  const missing = [];
  let done = 0;
  const total = pageIdx.reduce((n, i) => n + set.pages[i].items.length, 0) || 1;
  for (const pi of pageIdx) {
    const page = set.pages[pi];
    const ops = [];
    const slots = set.frame ? slotsOf(set) : null;
    const items = set.frame ? [...page.items].sort((a, b) => a.slot - b.slot) : page.items;
    for (const it of items) {
      progress?.(++done, total);
      const pl = placeOf(set, it);
      if (!pl || !pl.clip) continue;
      const s = sheetOf(it.ref);
      if (!s || !s.pages[it.ref.file]) { missing.push(it.ref.title); continue; }
      const box = [pl.box.x, pl.box.y, pl.box.w, pl.box.h], clip = [pl.clip.x, pl.clip.y, pl.clip.w, pl.clip.h];
      if (s.pages[it.ref.file].kind === 'pdf') {
        const px = clamp(Math.max(pl.box.w, pl.box.h) / 25.4 * 300, 800, 5200);
        const r = await renderPdfPage(s, it.ref.file, it.ref.pdf, px, 'jpeg');
        ops.push({ type: 'image', data: r.data, box, clip });
      } else ops.push({ type: 'image', id: s.id, p: it.ref.file, box, clip });
      if (slots && set.title) {
        const b = slots[it.slot].band;
        ops.push({ type: 'image', data: await textPNG(titleOf(it.ref), b.w, b.h, TITLE_MM), box: [b.x, b.y, b.w, b.h] });
      }
    }
    if (slots && set.divider) for (let i = 1; i < slots.length; i++) {
      const x = slots[i].box.x - GAP / 2;
      ops.push({ type: 'line', line: [x, slots[i].box.y, x, slots[i].box.y + slots[i].box.h], width: 0.25, gray: 0.62 });
    }
    if (set.pageNo) {
      const c = contentOf(set);
      const y = c.y + c.h;
      ops.push({ type: 'image', data: await textPNG(String(pi + 1), 20, H - y, PAGENO_MM, { weight: 500, color: '#77758c' }), box: [W / 2 - 10, y, 20, H - y] });
    }
    pages.push({ ops });
  }
  return { spec: { name: (E.print.name || `${set.name} ${today()}`), w: W, h: H, pages }, missing };
}
function busy(on, msg) {
  E.busy = on;
  $('#stBusy').hidden = !on;
  if (msg) $('#stBusyMsg').textContent = msg;
}
async function makePDF(range = 'all') {
  const set = E.set;
  const idx = range === 'current' ? [E.layer === 'preview' ? E.pv : E.page] : set.pages.map((_, i) => i);
  busy(true, 'PDF를 만드는 중…');
  try {
    const { spec, missing } = await buildSpec(set, idx, (d, t) => { $('#stBusyMsg').textContent = `PDF를 만드는 중… ${d}/${t}`; });
    if (missing.length) toast(`⚠️ 찾을 수 없는 악보 ${missing.length}개는 빼고 만들었어요`);
    $('#stBusyMsg').textContent = 'PDF를 마무리하는 중…';
    return await api('/api/print/pdf', spec);
  } finally { busy(false); }
}
export async function printNow() {
  if (!E.set || !itemCount(E.set) || E.busy) return;
  let j;
  try { j = await makePDF(E.print.range); } catch (e) { return toast('⚠️ ' + esc(e.message)); }
  const b = bridge();
  if (b) {
    try {
      const r = await b.postMessage({ type: 'print', path: j.path, name: j.name, paper: E.set.paper, landscape: E.set.orient === 'landscape', copies: E.print.copies, duplex: E.print.duplex });
      if (r?.error) toast('⚠️ ' + esc(r.error));
    } catch (e) { toast('⚠️ 인쇄 창을 열지 못했어요: ' + esc(e.message || e)); }
  } else {
    await api('/api/print/open', { path: j.path }).catch(() => {});
    toast('PDF를 <b>미리보기</b> 앱으로 열었어요. 거기에서 인쇄해 주세요 (⌘P)', { ms: 6000 });
  }
}
export async function savePDF() {
  if (!E.set || !itemCount(E.set) || E.busy) return;
  let j;
  try { j = await makePDF(E.layer === 'preview' ? E.print.range : 'all'); } catch (e) { return toast('⚠️ ' + esc(e.message)); }
  let dest = '';
  const b = bridge();
  try {
    if (b) {
      const r = await b.postMessage({ type: 'savePDF', path: j.path, name: j.name });
      if (r?.error) return toast('⚠️ ' + esc(r.error));
      if (!r || r.canceled) return;
      dest = r.dest;
    } else {
      const r = await api('/api/print/save', { path: j.path, name: j.name });
      if (r.canceled) return;
      dest = r.dest;
    }
  } catch (e) { return toast('⚠️ ' + esc(e.message || e)); }
  toast(`PDF를 저장했어요 · ${esc(dest.split('/').pop())}`, { action: 'Finder에서 보기', onAction: () => api('/api/reveal-file', { path: dest }).catch(() => {}) });
}

// ══════════════════════════════════════════════════════ 모드 전환 · 단축키
async function loadSets() {
  const j = await api('/api/sets');
  E.sets = j.sets || [];
  E.presets = Array.isArray(j.presets) ? j.presets : null;
  E.loaded = true;
}
export async function setMode(mode) {
  const edit = mode === 'edit';
  if (edit === E.active) return;
  E.active = edit;
  document.body.classList.toggle('mode-edit', edit);
  $$('#modeSeg [data-mode]').forEach((b) => { const on = (b.dataset.mode === 'edit') === edit; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  root.hidden = !edit;
  if (!edit) {
    if (E.saving) saveNow();
    $('#pop').hidden = true;
    renderTop();
    return;
  }
  if (!root.firstChild) shell();
  try { if (!E.loaded) await loadSets(); } catch (e) { toast('⚠️ ' + esc(e.message)); }
  if (!E.set && E.sets.length) { E.set = JSON.parse(JSON.stringify(E.sets[0])); migrateSet(E.set); resolveRefs(); }
  renderAll();
  if (!E.set) { openSets(); if (!E.sets.length) openFrames(); }
}
$('#modeSeg').addEventListener('click', (e) => {
  const m = e.target.closest('[data-mode]')?.dataset.mode;
  if (m) setMode(m);
});
on('library', () => { if (E.active) { resolveRefs(); renderAll(); } });

document.addEventListener('keydown', (e) => {
  if (!E.active || $('#modalRoot').children.length) return;
  const typing = e.target.matches?.('input, textarea');
  const cmd = e.metaKey || e.ctrlKey;
  if (E.layer === 'crop') {
    if (e.key === 'Enter') { e.preventDefault(); applyCrop(); }
    if (e.key === 'Escape') { e.preventDefault(); closeLayer(); }
    return;
  }
  if (cmd && e.key.toLowerCase() === 'p') { e.preventDefault(); printNow(); return; }
  if (E.layer === 'preview') {
    if (e.key === 'Escape') closeLayer();
    if (!typing && e.key === 'ArrowLeft') { E.pv--; renderPreview(); }
    if (!typing && e.key === 'ArrowRight') { E.pv++; renderPreview(); }
    return;
  }
  if (E.layer === 'sets') { if (e.key === 'Escape' && E.set) closeLayer(); return; }
  if (typing) return;
  if (cmd && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (cmd && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#stQ')?.focus(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && E.sel) { e.preventDefault(); removeItem(E.sel); return; }
  if (e.key === 'Escape' && E.sel) { E.sel = null; drawSelection(); renderProps(); return; }
  if (!E.sel && e.key === 'ArrowLeft' && E.set && E.page > 0) { E.page--; renderAll(); }
  if (!E.sel && e.key === 'ArrowRight' && E.set && E.page < E.set.pages.length - 1) { E.page++; renderAll(); }
});
// 다른 화면으로 가기 전에 저장해요
addEventListener('beforeunload', () => { if (E.saving) saveNow(); });

// 시험용 (화면 자동 시험에서 상태를 확인해요)
window.__studio = { E, paperOf, slotsOf, placeOf, buildSpec };
