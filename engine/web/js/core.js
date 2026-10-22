// MSROAD core: API, shared state, small helpers
// made by. Nevertheless_D

export const T = new URLSearchParams(location.search).get('t') || '';
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ROADS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
export const CROSS = 'X'; // 갈림길 (코드 없음)

export const S = {
  settings: null,
  lib: { rev: -1, root: '', sheets: [] },
  sheets: [],          // 화면에서 쓰는 악보 목록 (title 정리 · 초성 포함)
  byId: new Map(),
  bySong: new Map(),   // song → [sheet] (같은 곡의 다른 키)
  update: null,
  build: '',
  road: 'ALL',         // ALL | A~G | X
  lane: '',            // '' | 'Ab' …
  query: '',
  sort: 'name',        // name | recent
  size: 'm',           // s | m | l
  visible: [],         // 지금 화면에 보이는 순서 (미리보기 화살표용)
  canUndo: false,
  offline: false,
};

const listeners = {};
export function on(ev, fn) { (listeners[ev] ||= []).push(fn); }
export function emit(ev, ...a) { (listeners[ev] || []).forEach((fn) => fn(...a)); }

export async function api(path, body) {
  const init = { method: body === undefined ? 'GET' : 'POST', headers: { 'x-token': T } };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  let r;
  try { r = await fetch(path, init); } catch {
    // 잠깐 끊긴 것일 수 있어서 한 번 더 해 봐요
    await sleep(800);
    try { r = await fetch(path, init); } catch (e2) {
      reportClient(`연결 실패: ${init.method} ${path.split('?')[0]} (${e2?.message || e2})`);
      goOffline();
      const e = new Error('MSROAD 엔진과 연결되지 않았어요');
      e.offline = true;
      throw e;
    }
  }
  let j = {};
  try { j = await r.json(); } catch { /* ignore */ }
  if (!r.ok || j.ok === false) {
    if (r.status >= 500 || r.status === 403) reportClient(`요청 오류 ${r.status}: ${init.method} ${path.split('?')[0]} ${j.error || ''}`);
    throw new Error(j.error || `요청에 실패했어요 (${r.status})`);
  }
  if (clientQueue.length && path !== '/api/clientlog') flushClient();
  return j;
}

// ── 화면에서 생긴 문제를 엔진 기록에 남겨요 (진단용) ──
const clientQueue = [];
export function reportClient(msg) {
  clientQueue.push(String(msg).slice(0, 500));
  if (clientQueue.length > 40) clientQueue.shift();
  try {
    const keep = JSON.parse(sessionStorage.getItem('msroad-client') || '[]');
    keep.push(String(msg).slice(0, 500));
    sessionStorage.setItem('msroad-client', JSON.stringify(keep.slice(-40)));
  } catch { /* 저장 못 해도 괜찮아요 */ }
}
let flushing = false;
async function flushClient() {
  if (flushing) return;
  flushing = true;
  const items = clientQueue.splice(0);
  try {
    await fetch('/api/clientlog', { method: 'POST', headers: { 'x-token': T, 'content-type': 'application/json' }, body: JSON.stringify({ items }) });
    try { sessionStorage.removeItem('msroad-client'); } catch { /* */ }
  } catch { clientQueue.unshift(...items); }
  flushing = false;
}
// 새로 고침 전에 남겨 둔 기록도 보내요
try { for (const x of JSON.parse(sessionStorage.getItem('msroad-client') || '[]')) clientQueue.push(x); sessionStorage.removeItem('msroad-client'); } catch { /* */ }
window.addEventListener('error', (e) => reportClient(`화면 오류: ${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => { if (!e.reason?.offline) reportClient(`처리 안 된 오류: ${e.reason?.message || e.reason}`); });

export const thumbURL = (s, i = 0) => `/api/thumb?id=${s.id}&p=${i}&v=${s.pages[i]?.mod || 0}&t=${T}`;
export const fileURL = (s, i = 0) => `/api/file?id=${s.id}&p=${i}&v=${s.pages[i]?.mod || 0}&t=${T}`;

let uiTimer;
export function saveUI() {
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => api('/api/settings', { ui: { sort: S.sort, size: S.size } }).catch(() => {}), 400);
}

// ── 코드 ──
export const roadOf = (chord) => (chord ? chord[0] : CROSS);
export const roadCls = (chord) => 'r' + roadOf(chord);
export const CHORD_RE = /^[A-G][b#]?m?$/;
export function normChord(s) {
  s = String(s || '').trim().replace(/♭/g, 'b').replace(/♯/g, '#');
  if (!s) return '';
  s = s[0].toUpperCase() + s.slice(1);
  if (/^[A-G]B/.test(s)) s = s[0] + 'b' + s.slice(2); // "AB" → "Ab"
  if (/M$/.test(s) && s.length > 1) s = s.slice(0, -1) + 'm';
  return CHORD_RE.test(s) ? s : null;
}
// 같은 ROAD 안의 순서: Ab, A, A#, Abm, Am, A#m
export function chordOrder(c) {
  if (!c) return 999;
  const acc = c.includes('b') ? 0 : c.includes('#') ? 2 : 1;
  return ROADS.indexOf(c[0]) * 10 + (c.endsWith('m') ? 3 : 0) + acc;
}
export function plate(chord, cls = '') {
  if (!chord) return `<span class="plate none ${cls}">코드 없음</span>`;
  return `<span class="plate ${roadCls(chord)} ${cls}">${esc(chord)}</span>`;
}

// 새 파일 이름 미리보기 (엔진의 newStemFor 와 같은 규칙)
export function newName(s, chord, page) {
  let sep = s.sep || '';
  if (!chord) sep = '';
  else if (!s.chord || !sep) sep = /[A-Za-z]$/.test(s.prefix) ? '_' : '';
  return { pre: s.prefix + sep, chord, post: (page.suffix || '') + page.ext };
}

// ── 한글 초성 검색 ──
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function choOf(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return CHO[Math.floor((c - 0xac00) / 588)];
  return ch;
}
const isCho = (ch) => CHO.includes(ch) || (ch >= 'ㄱ' && ch <= 'ㅎ');
export function prepTitle(t) {
  const norm = t.normalize('NFC');
  const flat = [];
  const idx = [];
  [...norm].forEach((ch, i) => { if (!/\s/.test(ch)) { flat.push(ch.toLowerCase()); idx.push(i); } });
  return { norm, flat, idx };
}
// q 의 한 글자: 같은 글자이거나, 초성 자음이면 그 초성으로 시작하는 글자와 맞아요
function matchAt(flat, q, start) {
  for (let k = 0; k < q.length; k++) {
    const a = flat[start + k], b = q[k];
    if (a === undefined) return false;
    if (a === b) continue;
    if (isCho(b) && choOf(a) === b) continue;
    return false;
  }
  return true;
}
export function findIn(prep, token) {
  const q = [...token.normalize('NFC').toLowerCase()];
  for (let i = 0; i + q.length <= prep.flat.length; i++) if (matchAt(prep.flat, q, i)) return [prep.idx[i], prep.idx[i + q.length - 1]];
  return null;
}
export function parseQuery(raw) {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const chords = [], words = [];
  for (const t of tokens) {
    // 대문자로 시작하는 코드 모양(Ab, F#m)이나 #·♭·♯ 이 들어간 것은 코드로 찾아요
    if (/^[A-G][b#♭♯]?m?$/.test(t) || /^[a-g][#♭♯]m?$/.test(t)) chords.push(normChord(t));
    else words.push(t);
  }
  return { chords, words };
}
export function matchSheet(s, pq) {
  if (pq.chords.length && !pq.chords.includes(s.chord)) return null;
  const hits = [];
  for (const w of pq.words) {
    const r = findIn(s._prep, w);
    if (!r) return null;
    hits.push(r);
  }
  return hits;
}
export function highlight(s, hits) {
  const chars = [...s._prep.norm];
  if (!hits?.length) return esc(s._prep.norm);
  const on = new Array(chars.length).fill(false);
  for (const [a, b] of hits) for (let i = a; i <= b; i++) on[i] = true;
  let out = '', open = false;
  chars.forEach((c, i) => {
    if (on[i] && !open) { out += '<mark>'; open = true; }
    if (!on[i] && open) { out += '</mark>'; open = false; }
    out += esc(c);
  });
  return out + (open ? '</mark>' : '');
}

// ── 작은 UI 도구 ──
let toastTimer;
export function toast(msg, opts = {}) {
  if (S.offline) return; // 연결이 끊긴 동안에는 안내 화면이 대신 설명해요
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${msg}</span>${opts.action ? `<button>${esc(opts.action)}</button>` : ''}`;
  el.classList.toggle('solo', !opts.action);
  el.hidden = false;
  if (opts.action) el.querySelector('button').onclick = () => { el.hidden = true; opts.onAction?.(); };
  toastTimer = setTimeout(() => { el.hidden = true; }, opts.ms || (opts.action ? 8000 : 3200));
}

let modalClose = null;
export function openModal(title, bodyEl, opts = {}) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-label="${esc(title)}"><div class="modal-head"><b>${esc(title)}</b><span class="spacer"></span><button class="icon-btn" data-close title="닫기 (esc)">✕</button></div><div class="modal-body"></div></div>`;
  back.querySelector('.modal-body').append(bodyEl);
  $('#modalRoot').append(back);
  const close = () => { back.remove(); modalClose = null; opts.onClose?.(); };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-close]').onclick = close;
  modalClose = close;
}
export function closeModal() { modalClose?.(); }
export const modalOpen = () => !!modalClose;

export function confirmBox(title, html, okLabel = '확인') {
  return new Promise((res) => {
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:16px';
    body.innerHTML = `<div style="font-size:13.5px;line-height:1.65">${html}</div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-a="no">취소</button><button class="btn go" data-a="yes">${esc(okLabel)}</button></div>`;
    let done = false;
    openModal(title, body, { onClose: () => { if (!done) res(false); } });
    body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      done = true; closeModal(); res(a === 'yes');
    });
  });
}

export function shortPath(p) {
  const home = S.settings?.home;
  if (home && p.startsWith(home)) p = '~' + p.slice(home.length);
  return p;
}

// 같은 곡의 다른 키 (코드 순서대로). 같은 코드가 여러 폴더에 있으면 모두 보여 줘요.
export function versionsOf(s) {
  return S.bySong.get(s.song) || [s];
}

// ── 엔진과 연결이 끊겼을 때 ──
// 엔진은 오래 쓰지 않으면 스스로 쉬어요. 앱을 다시 열면 같은 주소로 켜지니까, 이 창은 기다렸다가 저절로 이어져요.
export function goOffline() {
  if (S.offline) return;
  S.offline = true;
  $('#toast').hidden = true;
  const el = document.createElement('div');
  el.className = 'offline';
  el.innerHTML = `<div class="offline-card">
      ${logoSVG(64)}
      <h2>MSROAD가 잠시 쉬고 있어요</h2>
      <p>한동안 쓰지 않았거나 맥이 잠자기에 들어가면 엔진이 쉬어요.<br><b>Dock이나 응용 프로그램 폴더에서 MSROAD를 다시 열면</b> 이 창이 저절로 이어져요.</p>
      <div class="offline-wait"><i></i>다시 연결되기를 기다리는 중</div>
    </div>`;
  document.body.append(el);
  const tryPing = async () => {
    try {
      const r = await fetch(`/api/ping?vis=${document.visibilityState === 'visible' ? 1 : 0}`, { headers: { 'x-token': T } });
      if (r.ok) {
        // 엔진은 켜져 있는데 계속 끊긴다면 새로 고침을 되풀이하지 않고 멈춰요
        let hist = [];
        try { hist = JSON.parse(sessionStorage.getItem('msroad-reloads') || '[]').filter((t) => Date.now() - t < 60000); } catch { /* */ }
        if (hist.length >= 3) {
          reportClient('엔진은 응답하는데 화면 연결이 계속 끊김 (1분에 3번)');
          await flushClient();
          el.querySelector('h2').textContent = '연결이 자꾸 끊겨요';
          el.querySelector('p').innerHTML = '엔진은 켜져 있는데 화면과의 연결이 계속 끊기고 있어요.<br>이 창을 닫고 <b>MSROAD를 다시 열어</b> 주세요. 기록은 남겨 두었어요.';
          el.querySelector('.offline-wait').hidden = true;
          return;
        }
        try { hist.push(Date.now()); sessionStorage.setItem('msroad-reloads', JSON.stringify(hist)); } catch { /* */ }
        location.reload();
        return;
      }
    } catch { /* 아직 꺼져 있어요 */ }
    setTimeout(tryPing, 1000);
  };
  setTimeout(tryPing, 1000);
}

// 엔진이 꺼져 있어도 보이도록 로고는 그림 파일이 아니라 페이지 안에서 그려요
export function logoSVG(size) {
  const svg = document.querySelector('.brand .logo')?.cloneNode(true);
  if (!svg) return '';
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.style.borderRadius = Math.round(size * 0.24) + 'px';
  svg.querySelector('linearGradient')?.setAttribute('id', 'lg' + size);
  svg.querySelector('rect')?.setAttribute('fill', `url(#lg${size})`);
  return svg.outerHTML;
}
