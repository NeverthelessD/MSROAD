// MSROAD — 미리보기
// 확대 · 축소, 화살표로 넘기기, 전체 화면, 같은 곡의 다른 키로 바로 바꾸기, 여러 장 펼쳐 보기
// made by. Nevertheless_D
import { S, $, esc, api, clamp, fileURL, thumbURL, plate, roadOf, versionsOf, toast, L } from './core.js';
import { openPicker, closePicker } from './picker.js';

let V = null; // 지금 열린 미리보기 상태
const prepCache = new Map(); // sheetId+mod → Promise<pages>

export const viewerOpen = () => !!V;

// ── PDF (pdf.js 는 처음 필요할 때만 불러요) ──
let pdfjsP = null;
function pdfjs() {
  pdfjsP ||= import('/vendor/pdfjs/pdf.min.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    return m;
  });
  return pdfjsP;
}
const docCache = new Map();
export function loadDoc(url) {
  if (!docCache.has(url)) {
    if (docCache.size > 12) { const [k, d] = docCache.entries().next().value; docCache.delete(k); d.then((x) => x.destroy()).catch(() => {}); }
    docCache.set(url, pdfjs().then((m) => m.getDocument({ url, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', isEvalSupported: false }).promise));
  }
  return docCache.get(url);
}

let thumbQ = Promise.resolve();
let thumbRunning = 0;
export function renderPdfThumb(s, canvas) {
  const run = async () => {
    const doc = await loadDoc(fileURL(s, 0));
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = 360 / vp1.width;
    const vp = page.getViewport({ scale });
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  };
  // 한 번에 두 개씩만 그려요
  const p = (thumbRunning < 2 ? Promise.resolve() : thumbQ).then(async () => { thumbRunning++; try { await run(); } finally { thumbRunning--; } });
  thumbQ = p.catch(() => {});
  return p;
}

// ── 악보 한 개의 '보이는 쪽' 목록 만들기 (PDF 는 쪽마다 하나씩) ──
function prepare(s) {
  const key = s.id + ':' + s.pages.map((p) => p.mod).join(',');
  if (prepCache.has(key)) return prepCache.get(key);
  if (prepCache.size > 40) prepCache.delete(prepCache.keys().next().value);
  const p = (async () => {
    const out = [];
    for (let i = 0; i < s.pages.length; i++) {
      const pg = s.pages[i];
      const url = fileURL(s, i);
      if (pg.kind === 'pdf') {
        try {
          const doc = await loadDoc(url);
          for (let n = 1; n <= doc.numPages; n++) {
            const page = await doc.getPage(n);
            const vp = page.getViewport({ scale: 1 });
            out.push({ kind: 'pdf', url, page, w: vp.width, h: vp.height, file: i, label: `${pg.name} · ${n}/${doc.numPages}쪽` });
          }
        } catch { out.push({ kind: 'bad', w: 600, h: 800, file: i, label: pg.name }); }
      } else {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        try {
          await img.decode();
          out.push({ kind: 'img', url, img, w: img.naturalWidth, h: img.naturalHeight, file: i, label: pg.name });
        } catch { out.push({ kind: 'bad', w: 600, h: 800, file: i, label: pg.name }); }
      }
    }
    return out;
  })();
  prepCache.set(key, p);
  p.catch(() => prepCache.delete(key));
  return p;
}

// ── 열기 · 닫기 ──
export function openViewer(list, id) {
  closePicker();
  const ids = list.length ? list.slice() : [id];
  V = { list: ids, idx: Math.max(0, ids.indexOf(id)), id, page: 0, spread: !!S.settings?.ui?.spread, mode: 'fit', z: 1, pages: [], token: 0, returnTo: id };
  const el = $('#viewer');
  el.hidden = false;
  el.innerHTML = `
    <div class="vbar"></div>
    <div class="vwrap">
      <div class="vstage" tabindex="-1"><div class="vcanvas"></div></div>
      <button class="vnav prev" data-v="prev" title="이전 (←)"><svg width="22" height="22" viewBox="0 0 22 22"><path d="M14 4l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="vnav next" data-v="next" title="다음 (→)"><svg width="22" height="22" viewBox="0 0 22 22"><path d="M8 4l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="vinfo" style="opacity:0"></div>
      <div class="vhint"><span><kbd>←</kbd><kbd>→</kbd>넘기기</span><span><kbd>↑</kbd><kbd>↓</kbd>다른 키</span><span><kbd>+</kbd><kbd>−</kbd>확대 · 축소</span><span><kbd>F</kbd>전체 화면</span></div>
    </div>`;
  const stage = el.querySelector('.vstage');
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('mousedown', onDragStart);
  stage.addEventListener('dblclick', (e) => { if (e.target.closest('.vpage')) toggleZoomAt(e); });
  el.addEventListener('click', onClick);
  el.addEventListener('mousemove', onMove);
  stage.focus();
  show();
}

export function closeViewer() {
  if (!V) return;
  const back = V.id;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  closePicker();
  V = null;
  const el = $('#viewer');
  el.hidden = true;
  el.innerHTML = '';
  const card = document.querySelector(`.card[data-id="${back}"]`);
  if (card) { card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' }); }
}

// 라이브러리가 바뀌었을 때 (이름이 바뀌었거나 파일이 사라졌을 때)
export function viewerSync() {
  if (!V) return;
  if (S.byId.has(V.id)) { drawBar(); return; }
  // 이름만 바뀐 같은 악보를 찾아서 이어서 보여 줘요
  const r = V.ref;
  const same = r && S.sheets.find((x) => x.dir === r.dir && x.prefix === r.prefix && x.pages.length === r.n);
  if (same) { V.list[V.idx] = same.id; V.id = same.id; show(); return; }
  closeViewer();
}

const cur = () => V && S.byId.get(V.id);

// ── 그리기 ──
async function show(opts = {}) {
  const s = cur();
  if (!s) return closeViewer();
  const token = ++V.token;
  V.ref = { dir: s.dir, prefix: s.prefix, n: s.pages.length };
  drawBar();
  const canvas = $('#viewer .vcanvas');
  if (!V.pages.length || opts.reload) canvas.innerHTML = `<div class="vpage" style="width:${opts.w || 420}px;height:${opts.h || 560}px;opacity:.5"><div class="pl">불러오는 중…</div></div>`;
  let pages;
  try { pages = await prepare(s); } catch { pages = []; }
  if (!V || token !== V.token) return;
  V.pages = pages;
  if (opts.last) V.page = pages.length - 1;
  V.page = clamp(V.page, 0, Math.max(0, pages.length - 1));
  layout(true);
  drawBar();
  flashInfo();
  preloadNeighbors();
}

function shown() {
  if (!V.pages.length) return [];
  return V.spread ? V.pages : [V.pages[V.page]];
}

// 화면에 맞는 기본 크기 (높이 기준)
function fitHeights(stage) {
  const pages = shown();
  const W = stage.clientWidth - 44, H = stage.clientHeight - 44 - (pages.length > 1 ? 34 : 0);
  const gap = 18 * (pages.length - 1);
  const sumRatio = pages.reduce((a, p) => a + p.w / p.h, 0) || 1;
  const fit = Math.max(50, Math.min(H, (W - gap) / sumRatio));
  const width = Math.max(50, (W - gap) / sumRatio);
  return { fit, width };
}

function layout(resetScroll) {
  const stage = $('#viewer .vstage');
  const canvas = $('#viewer .vcanvas');
  if (!stage || !V) return;
  const pages = shown();
  const { fit, width } = fitHeights(stage);
  if (V.mode === 'fit') V.z = 1;
  if (V.mode === 'width') V.z = width / fit;
  const h = fit * V.z;
  V.h = h;
  const dpr = window.devicePixelRatio || 1;
  // 이미 있는 쪽 요소는 다시 쓰고, 크기만 바꿔요
  const want = pages.map((p) => p.url + '#' + (p.page?.pageNumber || 0) + p.label);
  const have = [...canvas.children].map((c) => c.dataset.key);
  if (want.join('|') !== have.join('|')) {
    canvas.innerHTML = '';
    pages.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'vpage';
      d.dataset.key = want[i];
      if (p.kind === 'img') { const im = p.img.cloneNode(); im.alt = ''; im.draggable = false; d.append(im); }
      else if (p.kind === 'pdf') { const c = document.createElement('canvas'); d.append(c); }
      else d.innerHTML = '<div class="pl">이 파일은 미리 볼 수 없어요</div>';
      if (V.spread && pages.length > 1) d.insertAdjacentHTML('beforeend', `<div class="pg">${i + 1}</div>`);
      canvas.append(d);
    });
  }
  [...canvas.children].forEach((d, i) => {
    const p = pages[i];
    const w = (p.w / p.h) * h;
    d.style.width = Math.round(w) + 'px';
    d.style.height = Math.round(h) + 'px';
    d.style.opacity = '';
    if (p.kind === 'pdf') schedulePdf(d.querySelector('canvas'), p, w * dpr, h * dpr);
  });
  canvas.style.paddingBottom = V.spread && pages.length > 1 ? '40px' : '';
  stage.classList.toggle('grab', stage.scrollWidth > stage.clientWidth + 2 || stage.scrollHeight > stage.clientHeight + 2);
  if (resetScroll) { stage.scrollTop = 0; stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2; }
  drawZoom();
}

const pdfTimers = new WeakMap();
function schedulePdf(cv, p, pw, ph) {
  clearTimeout(pdfTimers.get(cv));
  // 너무 큰 캔버스는 브라우저가 못 그려요 → 최대 크기로 제한
  const k = Math.min(1, Math.sqrt((4096 * 4096) / (pw * ph)));
  const tw = Math.round(pw * k), th = Math.round(ph * k);
  if (cv.width === tw && cv.height === th && cv.dataset.done) return;
  pdfTimers.set(cv, setTimeout(async () => {
    const tmp = document.createElement('canvas');
    tmp.width = tw; tmp.height = th;
    try {
      await p.page.render({ canvasContext: tmp.getContext('2d'), viewport: p.page.getViewport({ scale: tw / p.w }) }).promise;
      cv.width = tw; cv.height = th;
      cv.getContext('2d').drawImage(tmp, 0, 0);
      cv.dataset.done = '1';
    } catch { /* 넘어가는 중에 취소됐어요 */ }
  }, cv.dataset.done ? 160 : 0));
}

function drawZoom() {
  const zv = $('#viewer .zv');
  if (zv) zv.textContent = Math.round(V.z * 100) + '%';
  $('#viewer [data-v=fit]')?.classList.toggle('on', V.mode === 'fit');
  $('#viewer [data-v=width]')?.classList.toggle('on', V.mode === 'width');
}

function drawBar() {
  const s = cur();
  const bar = $('#viewer .vbar');
  if (!s || !bar) return;
  const vers = versionsOf(s);
  const dupChord = (c) => vers.filter((v) => v.chord === c).length > 1;
  const nPages = V.pages.length;
  const pg = V.pages[V.page];
  bar.innerHTML = `
    <button class="vbtn" data-v="close" title="닫기 (esc)"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <div class="vt">${plate(s.chord, 'lg')}<div style="min-width:0"><b title="${esc(s.title)}">${esc(s.title)}</b><br><small>${esc([s.dir, pg?.label || s.pages[0].name].filter(Boolean).join(' › '))}</small></div></div>
    ${vers.length > 1 ? `<div class="vers"><span class="lb">다른 키</span>${vers.map((v) => `<button class="${v.id === s.id ? 'on' : ''}" data-ver="${v.id}" title="${esc(v.chord || '코드 없음')}${dupChord(v.chord) && v.dir ? ' · ' + esc(v.dir) : ''}">${plate(v.chord)}</button>`).join('')}</div>` : ''}
    <span class="spacer"></span>
    ${nPages > 1 ? `<div class="grp">
        <button class="vbtn ${V.spread ? '' : 'on'}" data-v="single" title="한 장씩 (S)">한 장씩</button>
        <button class="vbtn ${V.spread ? 'on' : ''}" data-v="spread" title="모든 장 펼쳐 보기 (S)">펼쳐 보기</button></div>
      ${V.spread ? `<span class="muted num" style="font-size:12px;font-weight:700">${nPages}장</span>` : `<span class="muted num" style="font-size:12px;font-weight:700">${V.page + 1} / ${nPages}</span>`}` : ''}
    <div class="grp">
      <button class="vbtn" data-v="zout" title="축소 (−)">−</button>
      <button class="vbtn zv" data-v="z100" title="화면에 맞추기 (0)">100%</button>
      <button class="vbtn" data-v="zin" title="확대 (+)">+</button>
      <button class="vbtn" data-v="fit" title="화면에 맞추기 (0)">맞춤</button>
      <button class="vbtn" data-v="width" title="폭에 맞추기 (W)">폭</button>
    </div>
    <button class="vbtn" data-vassign title="${s.chord ? '코드 바꾸기 (C)' : '코드 정하기 (C)'}" style="border:1px solid var(--line2)">${s.chord ? '코드 바꾸기' : '코드 정하기'}</button>
    <button class="vbtn" data-v="reveal" title="${L.fm}에서 보기"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M1.5 4.2c0-.9.7-1.6 1.6-1.6h3l1.5 1.6h5.3c.9 0 1.6.7 1.6 1.6v6.1c0 .9-.7 1.6-1.6 1.6H3.1c-.9 0-1.6-.7-1.6-1.6z" fill="currentColor"/></svg></button>
    <button class="vbtn" data-v="full" title="전체 화면 (F)"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  const hasPrev = V.idx > 0 || (!V.spread && V.page > 0);
  const hasNext = V.idx < V.list.length - 1 || (!V.spread && V.page < nPages - 1);
  $('#viewer .vnav.prev').disabled = !hasPrev;
  $('#viewer .vnav.next').disabled = !hasNext;
  drawZoom();
}

let infoTimer;
function flashInfo() {
  const el = $('#viewer .vinfo');
  const s = cur();
  if (!el || !s) return;
  const R = roadOf(s.chord);
  el.textContent = `${V.idx + 1} / ${V.list.length}  ·  ${R === 'X' ? '갈림길' : R + ' ROAD'}`;
  el.style.opacity = 1;
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => { if (el.isConnected) el.style.opacity = 0; }, 1400);
}

function preloadNeighbors() {
  for (const d of [1, -1]) {
    const id = V.list[V.idx + d];
    const s = id && S.byId.get(id);
    if (s) prepare(s).catch(() => {});
  }
}

// ── 이동 ──
function goSheet(delta, toLast) {
  let i = V.idx + delta;
  while (i >= 0 && i < V.list.length && !S.byId.has(V.list[i])) i += delta;
  if (i < 0 || i >= V.list.length) return false;
  V.idx = i; V.id = V.list[i]; V.page = 0;
  if (V.mode === 'free') V.mode = 'fit';
  show({ last: toLast && !V.spread });
  return true;
}
function next() {
  if (!V.spread && V.page < V.pages.length - 1) { V.page++; layout(true); drawBar(); return; }
  if (!goSheet(1)) toast('마지막 악보예요');
}
function prev() {
  if (!V.spread && V.page > 0) { V.page--; layout(true); drawBar(); return; }
  if (!goSheet(-1, true)) toast('첫 악보예요');
}
function switchTo(id) {
  if (!id || id === V.id) return;
  const at = V.list.indexOf(id);
  if (at >= 0) V.idx = at; else V.list[V.idx] = id;
  V.id = id; V.page = 0;
  show();
}
function stepVersion(d) {
  const s = cur();
  const vers = versionsOf(s);
  if (vers.length < 2) { toast('이 곡은 다른 키 악보가 없어요'); return; }
  const i = vers.findIndex((v) => v.id === s.id);
  switchTo(vers[(i + d + vers.length) % vers.length].id);
}

// ── 확대 · 축소 ──
function zoomTo(z, cx, cy) {
  const stage = $('#viewer .vstage');
  const r = stage.getBoundingClientRect();
  if (cx === undefined) { cx = r.width / 2; cy = r.height / 2; } else { cx -= r.left; cy -= r.top; }
  const fx = (stage.scrollLeft + cx) / Math.max(1, stage.scrollWidth);
  const fy = (stage.scrollTop + cy) / Math.max(1, stage.scrollHeight);
  V.z = clamp(z, 0.25, 8);
  V.mode = Math.abs(V.z - 1) < 0.001 ? 'fit' : 'free';
  layout(false);
  stage.scrollLeft = fx * stage.scrollWidth - cx;
  stage.scrollTop = fy * stage.scrollHeight - cy;
}
const zoomStep = (dir) => zoomTo(dir > 0 ? V.z * 1.25 : V.z / 1.25);
function toggleZoomAt(e) {
  if (V.z > 1.05) { V.mode = 'fit'; layout(true); } else zoomTo(2.2, e.clientX, e.clientY);
}
function onWheel(e) {
  if (e.ctrlKey || e.metaKey) { // 트랙패드 핀치 · ⌘+휠
    e.preventDefault();
    zoomTo(V.z * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
  }
}

// 확대했을 때 끌어서 움직이기
function onDragStart(e) {
  const stage = e.currentTarget;
  if (e.button !== 0 || !stage.classList.contains('grab')) return;
  const sx = e.clientX, sy = e.clientY, sl = stage.scrollLeft, st = stage.scrollTop;
  stage.classList.add('grabbing');
  const mv = (ev) => { stage.scrollLeft = sl - (ev.clientX - sx); stage.scrollTop = st - (ev.clientY - sy); };
  const up = () => { stage.classList.remove('grabbing'); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
  addEventListener('mousemove', mv);
  addEventListener('mouseup', up);
  e.preventDefault();
}

// ── 전체 화면 ──
function toggleFull() {
  const el = $('#viewer');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else el.requestFullscreen?.().catch(() => toast('전체 화면으로 바꾸지 못했어요'));
}
document.addEventListener('fullscreenchange', () => { if (V) setTimeout(() => layout(false), 60); });
function onMove(e) {
  const el = $('#viewer');
  if (!document.fullscreenElement) return;
  el.classList.toggle('peek', e.clientY < 64);
}

// ── 버튼 ──
function onClick(e) {
  if (e.target.closest('[data-vassign]')) {
    const s = cur();
    return openPicker(s, e.target.closest('[data-vassign]'), (moved) => {
      if (!V) return;
      if (moved) { V.list[V.idx] = moved.id; V.id = moved.id; show(); }
    });
  }
  const ver = e.target.closest('[data-ver]')?.dataset.ver;
  if (ver) return switchTo(ver);
  const a = e.target.closest('[data-v]')?.dataset.v;
  if (!a) return;
  const s = cur();
  ({
    close: closeViewer, prev, next, full: toggleFull,
    zin: () => zoomStep(1), zout: () => zoomStep(-1),
    z100: () => { V.mode = 'fit'; layout(true); }, fit: () => { V.mode = 'fit'; layout(true); },
    width: () => { V.mode = 'width'; layout(true); },
    single: () => setSpread(false), spread: () => setSpread(true),
    reveal: () => api('/api/reveal', { id: s.id, page: V.pages[V.page]?.file || 0 }),
  })[a]?.();
}
function setSpread(on) {
  if (V.spread === on) return;
  V.spread = on; V.mode = 'fit';
  api('/api/settings', { ui: { spread: on } }).then((st) => { S.settings = st; }).catch(() => {});
  layout(true); drawBar();
}

// ── 키보드 ──
document.addEventListener('keydown', (e) => {
  if (!V) return;
  if ($('#pop') && !$('#pop').hidden) return; // 코드 고르는 중
  if (document.querySelector('.modal-back')) return;
  const k = e.key;
  const mod = e.metaKey || e.ctrlKey;
  if (k === 'Escape') { e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen(); else closeViewer(); return; }
  if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); next(); return; }
  if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { e.preventDefault(); prev(); return; }
  if (k === 'ArrowUp') { e.preventDefault(); stepVersion(-1); return; }
  if (k === 'ArrowDown') { e.preventDefault(); stepVersion(1); return; }
  if (k === 'Home') { e.preventDefault(); goSheet(-V.idx); return; }
  if (k === 'End') { e.preventDefault(); goSheet(V.list.length - 1 - V.idx); return; }
  if (k === '+' || k === '=') { e.preventDefault(); zoomStep(1); return; }
  if (k === '-' || k === '_') { e.preventDefault(); zoomStep(-1); return; }
  if (k === '0') { e.preventDefault(); V.mode = 'fit'; layout(true); return; }
  if (mod) return;
  const lk = k.toLowerCase();
  if (lk === 'f') { e.preventDefault(); toggleFull(); }
  if (lk === 'w') { e.preventDefault(); V.mode = 'width'; layout(true); }
  if (lk === 's' && V.pages.length > 1) { e.preventDefault(); setSpread(!V.spread); }
  if (lk === 'c') { e.preventDefault(); $('#viewer [data-vassign]')?.click(); }
});

let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => V && layout(false), 80); });

export { thumbURL };
