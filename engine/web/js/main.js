// MSROAD — 로드(코드별 분류) · 검색 · 카드 목록
// made by. Nevertheless_D
import {
  S, $, $$, esc, api, on, emit, ROADS, CROSS, thumbURL, WIN_DRAG, setDownloadDrag, saveUI, roadOf, chordOrder, plate,
  prepTitle, parseQuery, matchSheet, highlight, toast, shortPath, modalOpen, versionsOf, IS_SHELL, logoSVG, L, setPlatform,
} from './core.js';
import { openViewer, viewerOpen, viewerSync, renderPdfThumb } from './viewer.js';
import { openPicker, closePicker, pickerOpen } from './picker.js';
import { openSettings, openUpdate, renderVersion, quitApp, chooseFolder } from './panels.js';
import { studioActive } from './studio.js';

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

// ── 화면 모드 ──
function applyTheme(t) {
  if (!t || t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  $$('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.theme === (t || 'system')));
}
on('theme', applyTheme);
$('#themeSeg').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-theme]')?.dataset.theme;
  if (!t) return;
  applyTheme(t);
  S.settings = await api('/api/settings', { appearance: t }).catch(() => S.settings);
});

// ── 라이브러리 ──
export async function loadLibrary() {
  const j = await api('/api/library');
  S.lib = j;
  S.sheets = (j.sheets || []).map((s) => ({ ...s, _prep: prepTitle(s.title), _road: roadOf(s.chord) }));
  S.byId = new Map(S.sheets.map((s) => [s.id, s]));
  S.bySong = new Map();
  for (const s of S.sheets) {
    if (!s.song) continue;
    if (!S.bySong.has(s.song)) S.bySong.set(s.song, []);
    S.bySong.get(s.song).push(s);
  }
  for (const list of S.bySong.values()) list.sort((a, b) => chordOrder(a.chord) - chordOrder(b.chord) || collator.compare(a.dir, b.dir));
  if (S.road === 'NEW' && !S.sheets.some((x) => x.new)) S.road = 'ALL';
  render();
  viewerSync();
  emit('library');
  if (!toldStartup && S.lib.scannedAt) startupNew();
}
S.reload = loadLibrary;
on('reload', () => loadLibrary().catch((e) => toast('⚠️ ' + esc(e.message))));


let rescanBusy = false;
async function rescan(manual) {
  if (rescanBusy || !S.settings?.folder) return;
  rescanBusy = true;
  if (manual) $('#rescanBtn').classList.add('spin');
  try {
    const j = await api('/api/rescan', {});
    if (j.rev !== S.lib.rev) await loadLibrary();
    if (j.added > 0) announceNew(j.added, '새 악보 {n}개를 찾았어요');
    else if (manual) toast(j.changed ? '폴더를 다시 읽었어요 · 바뀐 내용을 반영했어요' : '새로 들어온 악보가 없어요');
  } catch (e) { if (manual) toast('⚠️ ' + esc(e.message)); }
  finally { rescanBusy = false; setTimeout(() => $('#rescanBtn').classList.remove('spin'), 300); }
}
$('#rescanBtn').onclick = () => (S.settings?.folder ? rescan(true) : chooseFolder());

// 새 악보 알림 → '보기'를 누르면 새 악보만 모아 봐요
function announceNew(n, msg) {
  toast(`🎵 ${msg.replace('{n}', n)}`, { action: '보기', onAction: () => { if (S.query) clearSearch(false); pushNav(); S.road = 'NEW'; S.lane = ''; render(true); } });
}
let toldStartup = false;
function startupNew() {
  if (toldStartup || !S.settings?.folder) return;
  toldStartup = true;
  const n = S.sheets.filter((s) => s.new).length;
  if (n) announceNew(n, '지난번 이후 새 악보 {n}개가 들어왔어요');
}
let focusTimer;
window.addEventListener('focus', () => { clearTimeout(focusTimer); focusTimer = setTimeout(() => rescan(false), 600); });
setInterval(() => { if (document.visibilityState === 'visible') rescan(false); }, 60000);

// ── 집계 ──
function counts() {
  const road = { ALL: S.sheets.length, X: 0, NEW: S.sheets.filter((s) => s.new).length }, lanes = {};
  for (const R of ROADS) { road[R] = 0; lanes[R] = new Map(); }
  for (const s of S.sheets) {
    road[s._road]++;
    if (s.chord) lanes[s._road].set(s.chord, (lanes[s._road].get(s.chord) || 0) + 1);
  }
  for (const R of ROADS) lanes[R] = [...lanes[R].entries()].sort((a, b) => chordOrder(a[0]) - chordOrder(b[0]));
  return { road, lanes };
}

function sortList(list) {
  if (S.sort === 'recent') return list.sort((a, b) => b.mod - a.mod || collator.compare(a.title, b.title));
  return list.sort((a, b) => collator.compare(a._prep.norm, b._prep.norm) || chordOrder(a.chord) - chordOrder(b.chord) || collator.compare(a.dir, b.dir));
}

// ── 왼쪽 ROAD 목록 ──
function renderRail(c) {
  const rail = $('#rail');
  if (!S.settings?.folder) { rail.innerHTML = railIntro(); return; }
  let h = `<button class="road all ${S.road === 'ALL' && !S.query ? 'on' : ''}" data-road="ALL">
      <span class="lt"><svg width="16" height="16" viewBox="0 0 16 16"><g fill="currentColor"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.6"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.6"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.6"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.6"/></g></svg></span>
      <span class="nm">ALL<small>전체 악보</small></span><span class="ct">${c.road.ALL}</span></button>
    ${c.road.NEW ? `<button class="road fresh ${S.road === 'NEW' && !S.query ? 'on' : ''}" data-road="NEW">
      <span class="lt"><svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M8 1.2l1.8 4.1 4.4.4-3.3 2.9 1 4.4L8 10.7 4.1 13l1-4.4L1.8 5.7l4.4-.4z"/></svg></span>
      <span class="nm">NEW<small>새로 들어온 악보</small></span><span class="ct">${c.road.NEW}</span></button>` : ''}
    <div class="rail-h">코드별 ROAD</div>`;
  for (const R of ROADS) {
    const on = S.road === R && !S.query;
    const lanes = c.lanes[R];
    h += `<button class="road r${R} ${on ? 'on' : ''} ${c.road[R] ? '' : 'empty'}" data-road="${R}">
      <span class="lt">${R}</span><span class="nm">${R} ROAD<small>${lanes.length ? lanes.map(([k]) => esc(k)).join('  ') : '아직 없어요'}</small></span><span class="ct">${c.road[R]}</span></button>`;
    if (on && lanes.length > 1) {
      h += `<div class="lanes">${lanes.map(([k, n]) => `<button class="lane-btn ${S.lane === k ? 'on' : ''}" data-lane="${esc(k)}">${plate(k)}<span class="ct">${n}</span></button>`).join('')}</div>`;
    }
  }
  h += `<div class="rail-sep"></div>
    <button class="road cross ${c.road.X ? 'has' : ''} ${S.road === CROSS && !S.query ? 'on' : ''}" data-road="X">
      <span class="lt"><svg width="18" height="18" viewBox="0 0 18 18"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 16.5V9.5L4.5 5M9 9.5L13.5 5"/><path d="M2.5 6.6V3h3.6M15.5 6.6V3h-3.6"/></g></svg></span>
      <span class="nm">갈림길<small>${c.road.X ? '코드를 정해 주세요' : '모두 정리됐어요'}</small></span><span class="ct">${c.road.X}</span></button>`;
  rail.innerHTML = h;
}
function railIntro() {
  return `<div class="rail-h">코드별 ROAD</div>${ROADS.map((R) => `<div class="road r${R} empty"><span class="lt">${R}</span><span class="nm">${R} ROAD</span><span></span></div>`).join('')}`;
}
$('#rail').addEventListener('click', (e) => {
  const lane = e.target.closest('[data-lane]')?.dataset.lane;
  if (lane !== undefined) { pushNav(); S.lane = S.lane === lane ? '' : lane; render(true); return; }
  const r = e.target.closest('[data-road]')?.dataset.road;
  if (!r) return;
  if (S.query) clearSearch(false);
  pushNav();
  S.road = r; S.lane = '';
  render(true);
});

// ── 가운데 ──
function sectionsFor(c) {
  const secs = [];
  if (S.query) {
    const pq = parseQuery(S.query);
    const hitsById = new Map();
    const list = [];
    for (const s of S.sheets) { const h = matchSheet(s, pq); if (h) { hitsById.set(s.id, h); list.push(s); } }
    sortList(list);
    for (const R of [...ROADS, CROSS]) {
      const part = list.filter((s) => s._road === R);
      if (part.length) secs.push({ road: R, label: R === CROSS ? '갈림길' : `${R} ROAD`, items: part });
    }
    return { secs, hitsById, total: list.length };
  }
  if (S.road === 'NEW') {
    secs.push({ road: 'X', label: '', items: sortList(S.sheets.filter((s) => s.new)) });
  } else if (S.road === 'ALL') {
    for (const R of [...ROADS, CROSS]) {
      const part = sortList(S.sheets.filter((s) => s._road === R));
      if (part.length) secs.push({ road: R, label: R === CROSS ? '갈림길 · 코드 없음' : `${R} ROAD`, items: part });
    }
  } else if (S.road === CROSS) {
    secs.push({ road: CROSS, label: '', items: sortList(S.sheets.filter((s) => !s.chord)) });
  } else {
    const lanes = c.lanes[S.road].filter(([k]) => !S.lane || k === S.lane);
    for (const [k] of lanes) secs.push({ road: S.road, chord: k, label: k, items: sortList(S.sheets.filter((s) => s.chord === k)) });
  }
  return { secs, total: secs.reduce((n, s) => n + s.items.length, 0) };
}

function cardHTML(s, hits) {
  const p0 = s.pages[0];
  const multi = s.pages.length > 1;
  const pdf = s.pages.some((p) => p.kind === 'pdf');
  const others = [...new Set(versionsOf(s).filter((v) => v.chord && v.chord !== s.chord).map((v) => v.chord))];
  const mt = [];
  if (others.length) mt.push(`<span>다른 키</span>${others.slice(0, 4).map((k) => plate(k, 'ghost')).join('')}${others.length > 4 ? `<span>+${others.length - 4}</span>` : ''}`);
  else if (s.dir) mt.push(`<span class="dir">${esc(s.dir)}</span>`);
  return `<div class="card r${s._road} ${multi ? 'multi' : ''}" data-id="${s.id}" tabindex="0"${WIN_DRAG() ? ' draggable="true"' : ''}>
    <div class="sheet"><img loading="lazy" decoding="async" alt="" src="${thumbURL(s)}" data-kind="${p0.kind}"${IS_SHELL || WIN_DRAG() ? ' draggable="false"' : ''}>
      <div class="tl">${s.chord ? plate(s.chord) : ''}</div>${s.new ? '<span class="newtag">새 악보</span>' : ''}
      <div class="badges">${pdf ? '<span class="badge">PDF</span>' : ''}${multi ? `<span class="badge">${s.pages.length}장</span>` : ''}</div></div>
    <div class="cap"><b title="${esc(s.pages.map((p) => p.name).join('\n'))}">${highlight(s, hits)}</b><div class="mt">${mt.join('')}</div></div>
    ${s.chord ? '' : '<button class="assign" data-assign>코드 정하기</button>'}
  </div>`;
}

function headHTML(c, total) {
  const tools = `<div class="head-tools">
      <div class="seg" data-ctl="sort"><button data-v="name" class="${S.sort === 'name' ? 'on' : ''}">이름순</button><button data-v="recent" class="${S.sort === 'recent' ? 'on' : ''}">최근 바뀐 순</button></div>
      <div class="seg" data-ctl="size" title="악보 크기"><button data-v="s" class="${S.size === 's' ? 'on' : ''}">작게</button><button data-v="m" class="${S.size === 'm' ? 'on' : ''}">보통</button><button data-v="l" class="${S.size === 'l' ? 'on' : ''}">크게</button></div>
    </div>`;
  let title, sub, chips = '';
  if (S.query) {
    title = `<div class="title-big"><span class="K">‘${esc(S.query)}’ 찾기</span></div>`;
    sub = total ? `악보 ${total}개를 찾았어요` : '';
  } else if (S.road === 'ALL') {
    const songs = new Set(S.sheets.map((s) => s.song)).size;
    const multiKey = [...S.bySong.values()].filter((l) => new Set(l.map((s) => s.chord).filter(Boolean)).size > 1).length;
    title = `<div class="title-big"><span class="K">전체 악보</span></div>`;
    sub = `${esc(S.lib.rootName)} 폴더 · 악보 ${S.sheets.length}개, ${songs}곡${multiKey ? ` · 키가 여러 개인 곡 ${multiKey}곡` : ''}`;
  } else if (S.road === 'NEW') {
    title = `<div class="title-big"><span class="K">새 악보</span></div>`;
    sub = c.road.NEW ? `지난번에 앱을 쓴 뒤 폴더에 새로 들어온 악보 ${c.road.NEW}개예요. 앱을 다시 켜면 이 표시는 사라져요.` : '';
  } else if (S.road === CROSS) {
    title = `<div class="title-big"><span class="K">갈림길</span></div>`;
    sub = c.road.X ? '파일 이름에서 코드를 찾지 못한 악보예요. 코드를 정하면 파일 이름 끝에 붙이고 알맞은 ROAD로 옮겨 드려요.' : '';
  } else {
    const R = S.road;
    title = `<div class="title-big r${R}"><span class="L">${R}</span><span class="R">ROAD</span></div>`;
    sub = `${R}로 시작하는 코드의 악보 ${c.road[R]}개`;
    const lanes = c.lanes[R];
    if (lanes.length > 1) {
      chips = `<div class="chips"><button class="chip txt ${S.lane ? '' : 'on'}" data-lane="">전체 <span class="ct">${c.road[R]}</span></button>${lanes.map(([k, n]) => `<button class="chip ${S.lane === k ? 'on' : ''}" data-lane="${esc(k)}">${plate(k)}<span class="ct">${n}</span></button>`).join('')}</div>`;
    }
  }
  return `<div class="head"><div class="head-row"><div>${title}<div class="head-sub">${sub}</div></div>${tools}</div>${chips}</div>`;
}

function heroHTML() {
  const rec = (S.settings?.recent || []).filter((r) => r.exists);
  const ex = [
    ['구주의십자가보혈로', 'Ab', '', '.jpg', 'A', '한글 제목 + 코드'],
    ['광야를지나며', 'F#m', '', '.png', 'F', '샵 · 마이너도 그대로'],
    ['Amazing Grace_', 'G', '', '.jpg', 'G', '영어 제목은 _ 다음에 코드'],
    ['주의은혜라', 'A', '_1', L.win ? '.jpg' : '.heic', 'A', '여러 장이면 _1, _2 …'],
  ];
  return `<div class="hero"><div class="hero-card">
    <div class="road-art">${ROADS.map((R) => `<i class="r${R}">${R}</i>`).join('')}</div>
    <h1>악보 폴더를 골라 주세요</h1>
    <p>파일 이름 끝의 코드를 읽어서 A부터 G까지 일곱 개의 ROAD로 나눠 드려요. 원본 파일은 옮기지 않고 그 자리에서 보여 줘요.</p>
    <div class="actions"><button class="btn go big" data-act="choose">악보 폴더 고르기</button></div>
    ${rec.length ? `<div class="recent">${rec.map((r) => `<button class="chip txt" data-recent="${esc(r.path)}" title="${esc(shortPath(r.path))}">📁 ${esc(r.name)}</button>`).join('')}</div>` : ''}
    <div class="names"><div class="names-h">이렇게 이름 지은 악보를 알아봐요</div>
      ${ex.map(([t, c, p, e, R, why]) => `<div class="name-row"><div class="fname">${esc(t)}<span class="c r${R}">${esc(c)}</span><span class="p">${esc(p)}</span><span class="e">${e}</span></div><div class="why">${why}</div></div>`).join('')}
    </div>
  </div></div>`;
}

let lastKey = '';
export function render(scrollTop) {
  const c = counts();
  renderRail(c);
  document.body.dataset.road = S.query ? '' : (ROADS.includes(S.road) ? S.road : '');
  const main = $('#main');
  $('#folderName').textContent = S.settings?.folder ? S.lib.rootName || '폴더' : '폴더 고르기';
  $('#folderBtn').title = S.settings?.folder ? shortPath(S.settings.folder) + ' — 다른 폴더 고르기' : '악보 폴더 고르기';
  if (!S.settings?.folder) { main.innerHTML = heroHTML(); S.visible = []; return; }

  const { secs, hitsById, total } = sectionsFor(c);
  const keepScroll = !scrollTop && lastKey === `${S.road}|${S.lane}|${S.query}`;
  lastKey = `${S.road}|${S.lane}|${S.query}`;
  const prev = main.scrollTop;
  let body = '';
  if (S.lib.error) body += `<div class="err-box">⚠️ ${esc(S.lib.error)}</div>`;
  if (S.lib.truncated) body += `<div class="err-box">파일이 너무 많아서 앞쪽 30,000개만 읽었어요. 더 작은 폴더를 골라 보세요.</div>`;
  if (!total) {
    body += S.query
      ? `<div class="nothing"><div style="font-size:38px">🔎</div><b>찾는 악보가 없어요</b>곡 이름 일부, 초성(예: ㄱㅈㅇ), 코드(예: Ab, F#m)로 찾아보세요.</div>`
      : S.road === CROSS
        ? `<div class="nothing"><div style="font-size:38px">🎉</div><b>갈림길이 비었어요</b>모든 악보에 코드가 있어요.</div>`
        : !S.sheets.length
          ? `<div class="nothing"><div style="font-size:38px">🗂️</div><b>이 폴더에는 악보 파일이 없어요</b>${L.formats} 파일을 읽어요.${L.win ? '<br>HEIC(아이폰 사진)는 Windows 버전에서 읽지 않아요. JPG로 바꿔 넣어 주세요.' : ''}<br><button class="btn" data-act="choose" style="margin-top:16px">다른 폴더 고르기</button></div>`
          : `<div class="nothing"><div style="font-size:38px">🛣️</div><b>이 ROAD에는 아직 악보가 없어요</b></div>`;
  }
  body += secs.map((sec) => `<section class="sec r${sec.road}">
      ${sec.label ? `<div class="sec-h">${sec.chord ? plate(sec.chord) : `<b>${esc(sec.label)}</b>`}<span class="ct">${sec.items.length}개</span><span class="rule"></span></div>` : ''}
      <div class="grid ${S.size}">${sec.items.map((s) => cardHTML(s, hitsById?.get(s.id))).join('')}</div></section>`).join('');
  main.innerHTML = headHTML(c, total) + `<div class="body">${body}</div>`;
  S.visible = secs.flatMap((s) => s.items.map((x) => x.id));
  main.scrollTop = keepScroll ? prev : 0;
}

$('#main').addEventListener('scroll', (e) => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollTop > 4), { passive: true });

// 썸네일: 다 읽으면 보이고, 못 만들면 PDF 는 직접 그리고 나머지는 자리표시
$('#main').addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
$('#main').addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  const card = img.closest('.card');
  const s = card && S.byId.get(card.dataset.id);
  if (!s) return;
  if (img.dataset.kind === 'pdf') {
    const cv = document.createElement('canvas');
    img.replaceWith(cv);
    renderPdfThumb(s, cv).catch(() => cv.replaceWith(placeholder(s)));
  } else img.replaceWith(placeholder(s));
}, true);
function placeholder(s) {
  const d = document.createElement('div');
  d.className = 'ph';
  d.innerHTML = `<div style="text-align:center"><svg width="34" height="34" viewBox="0 0 24 24"><path fill="currentColor" d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V8h4.5"/></svg><br><b>${esc(s.pages[0].ext.slice(1).toUpperCase())}</b></div>`;
  return d;
}

$('#main').addEventListener('click', async (e) => {
  if (draggedOut) { draggedOut = false; return; } // 방금 다른 앱으로 끌어 놓은 거라면 미리보기를 열지 않아요
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'choose') return chooseFolder();
  const rec = e.target.closest('[data-recent]')?.dataset.recent;
  if (rec) return chooseFolder(rec);
  const ctl = e.target.closest('[data-ctl]');
  if (ctl) {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (!v) return;
    if (ctl.dataset.ctl === 'sort') S.sort = v; else S.size = v;
    saveUI(); render();
    return;
  }
  const lane = e.target.closest('[data-lane]');
  if (lane) { pushNav(); S.lane = lane.dataset.lane; render(true); return; }
  const card = e.target.closest('.card');
  if (!card) return;
  const s = S.byId.get(card.dataset.id);
  if (e.target.closest('[data-assign]')) return openPicker(s, e.target.closest('[data-assign]'));
  openViewer(S.visible, s.id);
});
$('#main').addEventListener('keydown', (e) => {
  const card = e.target.closest?.('.card');
  if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openViewer(S.visible, card.dataset.id); }
});

// ── 오른쪽 클릭 메뉴 ──
export function showMenu(x, y, s) {
  const el = $('#ctx');
  el.innerHTML = `<button data-m="view">미리보기</button>
    <button data-m="chord">${s.chord ? '코드 바꾸기…' : '코드 정하기…'}</button><hr>
    <button data-m="reveal">${L.fm}에서 보기</button>
    <button data-m="open">기본 앱으로 열기</button>`;
  el.hidden = false;
  const r = el.getBoundingClientRect();
  el.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  el.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  el.onclick = (e) => {
    const m = e.target.closest('[data-m]')?.dataset.m;
    el.hidden = true;
    if (m === 'view') openViewer(S.visible, s.id);
    if (m === 'chord') openPicker(s, { getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }) });
    if (m === 'reveal') api('/api/reveal', { id: s.id, all: true });
    if (m === 'open') api('/api/open-file', { id: s.id, all: true });
  };
}
$('#main').addEventListener('contextmenu', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  e.preventDefault();
  showMenu(e.clientX, e.clientY, S.byId.get(card.dataset.id));
});
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctx')) $('#ctx').hidden = true; });

// ── 끌어서 다른 앱에 넣기 (1.3.5, 맥 앱 창) ──
// 앱 창(WKWebView)이 그림을 그냥 끌면 화면에 보이는 작은 그림(썸네일)이 넘어가요.
// 그래서 맥 앱 창에서는 WebKit 의 끌기를 끄고(그림 draggable=false), 카드를 누른 채 움직이면
// 맥 쪽(껍데기 main.swift 'dragFiles')이 원본 파일(여러 장이면 모두)로 끌기를 시작해요
// → Finder 에서 끈 것과 똑같이, 다른 앱에 원본 해상도 그대로 들어가요.
// (WebKit 의 dragstart 를 막는 방식은 WebKit 이 끌기 보드를 비워 버려서 쓰지 않아요 — 빌드 서버 시험 K 에서 확인)
const shellBridge = () => window.webkit?.messageHandlers?.msroad;
const pathCache = new Map();
let draggedOut = false;
function pathsOf(s) {
  const key = s.id + '|' + s.pages.map((p) => p.name + ':' + p.mod).join('|');
  if (!pathCache.has(key)) {
    if (pathCache.size > 300) pathCache.clear();
    pathCache.set(key, api('/api/paths', { id: s.id }).then((j) => j.paths || []).catch(() => { pathCache.delete(key); return []; }));
  }
  return pathCache.get(key);
}
// 끌 때 손가락 밑에 보일 작은 그림 (카드에 보이는 모습 그대로)
function dragGhost(sheet, w, h) {
  try {
    const src = sheet.querySelector('img.ok, canvas');
    if (!src) return '';
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    if (sw && sh) {
      const k = Math.max(cv.width / sw, cv.height / sh); // object-fit: cover, 위쪽 맞춤
      g.drawImage(src, (cv.width - sw * k) / 2, 0, sw * k, sh * k);
    }
    return cv.toDataURL('image/png');
  } catch { return ''; }
}
function startDragOut(s, card, x, y) {
  draggedOut = true;
  const sheet = card.querySelector('.sheet') || card;
  const r = sheet.getBoundingClientRect();
  const k = Math.min(1, 200 / Math.max(r.width, r.height, 1));
  const w = r.width * k, h = r.height * k;
  const ox = Math.max(0, Math.min(w, (x - r.left) * k)), oy = Math.max(0, Math.min(h, (y - r.top) * k));
  const image = dragGhost(sheet, w, h);
  pathsOf(s).then((paths) => {
    if (!paths.length) return;
    return shellBridge().postMessage({ type: 'dragFiles', paths, image, w, h, ox, oy });
  }).catch((err) => console.warn('끌기', err));
}
if (IS_SHELL) {
  document.documentElement.classList.add('shell');
  let press = null; // 카드를 누른 곳
  $('#main').addEventListener('pointerdown', (e) => {
    draggedOut = false;
    press = null;
    const card = e.target.closest('.card');
    const s = card && S.byId.get(card.dataset.id);
    if (!s || e.button !== 0 || e.target.closest('button') || !shellBridge()) return;
    pathsOf(s); // 끌기 시작 전에 미리 경로를 받아 둬요
    press = { s, card, x: e.clientX, y: e.clientY };
  });
  addEventListener('pointermove', (e) => {
    if (!press) return;
    if (!(e.buttons & 1)) { press = null; return; }
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return;
    const p = press; press = null;
    startDragOut(p.s, p.card, p.x, p.y);
  });
  addEventListener('pointerup', () => { press = null; });
  addEventListener('pointercancel', () => { press = null; });
}

// Windows (Edge · Chrome 앱 창, 1.3.5): 그림을 그냥 끌면 썸네일이 넘어가요. 그래서 그림 대신 카드를 끌게 하고
// 'DownloadURL'(Chromium)로 원본 파일 주소를 넘겨요 → 놓는 순간 원본 파일이 만들어져 탐색기 · 바탕 화면 · 카카오톡 · 한글 등에 원본 해상도로 들어가요.
// DownloadURL 은 파일 하나만 돼서 여러 장 악보는 첫 장이 들어가요. 미리보기에서 보고 있는 장을 끌면 그 장이 들어가요(viewer.js).
$('#main').addEventListener('dragstart', (e) => {
  if (!WIN_DRAG()) return;
  const card = e.target.closest('.card');
  const s = card && S.byId.get(card.dataset.id);
  if (!s) return;
  if (!setDownloadDrag(e, s, 0)) { e.preventDefault(); return; }
  const sheet = card.querySelector('.sheet');
  if (sheet) { const r = sheet.getBoundingClientRect(); e.dataTransfer.setDragImage(sheet, e.clientX - r.left, e.clientY - r.top); }
});

// ── 검색 ──
const q = $('#q');
let qTimer;
q.addEventListener('input', () => {
  $('#qClear').hidden = !q.value;
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { S.query = q.value.trim(); render(true); }, 90);
});
q.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); clearSearch(true); }
  if (e.key === 'Enter' && S.visible.length) { e.preventDefault(); openViewer(S.visible, S.visible[0]); }
  if (e.key === 'ArrowDown') { e.preventDefault(); $('#main .card')?.focus(); }
});
function clearSearch(doRender = true) {
  q.value = ''; S.query = ''; $('#qClear').hidden = true; q.blur();
  if (doRender) render(true);
}
$('#qClear').onclick = () => clearSearch(true);

// ── 위쪽 버튼 ──
$('#folderBtn').onclick = () => chooseFolder();
$('#settingsBtn').onclick = openSettings;
$('#verBtn').onclick = openUpdate;
$('#quitBtn').onclick = quitApp;

// ── 뒤로 가기 (⌫ · ⌘[) — ROAD 앱 공통 ──
// 왼쪽 ROAD · 코드를 옮겨 다닌 기록을 두고, ⌫ 를 누르면 바로 전 화면으로 돌아가요. (찾는 중이면 찾기를 끝내요)
const navHist = [];
function pushNav() {
  const last = navHist[navHist.length - 1];
  if (last && last.road === S.road && last.lane === S.lane) return;
  navHist.push({ road: S.road, lane: S.lane });
  if (navHist.length > 50) navHist.shift();
}
function goBack() {
  if (S.query) { clearSearch(true); return true; }
  while (navHist.length) {
    const p = navHist.pop();
    if (p.road === S.road && p.lane === S.lane) continue;
    S.road = p.road; S.lane = p.lane;
    render(true);
    return true;
  }
  if (S.road !== 'ALL' || S.lane) { S.road = 'ALL'; S.lane = ''; render(true); return true; }
  return false; // 첫 화면이면 아무 일도 안 해요
}

// ── 단축키 ──
document.addEventListener('keydown', (e) => {
  if (viewerOpen() || modalOpen() || pickerOpen() || studioActive()) return;
  const typing = e.target.matches?.('input, textarea, select, [contenteditable], [contenteditable] *');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); q.focus(); q.select(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); chooseFolder(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); rescan(true); return; }
  if (typing) return;
  const back = (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey) || ((e.metaKey || e.ctrlKey) && e.key === '[');
  if (back && !e.isComposing && $('#ctx').hidden) { e.preventDefault(); goBack(); return; }
  if (e.key === '/') { e.preventDefault(); q.focus(); return; }
  if (e.key === 'Escape' && S.query) { clearSearch(true); return; }
  // 그리드 안에서 화살표로 이동
  const card = e.target.closest?.('.card');
  if (card && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const cards = $$('#main .card');
    const i = cards.indexOf(card);
    const cols = Math.max(1, Math.round(card.parentElement.clientWidth / (card.offsetWidth + 18)));
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    cards[Math.max(0, Math.min(cards.length - 1, i + d))]?.focus();
  }
});

// ── 상태 확인 (업데이트 · 폴더 변화) ──
async function poll() {
  try {
    const j = await api('/api/poll');
    S.update = j.update; S.build = j.build; S.canUndo = j.canUndo;
    if (j.shell === 'native' && !IS_SHELL) return movedNotice();
    renderVersion();
    if (j.rev !== S.lib.rev) await loadLibrary();
  } catch { /* 엔진이 다시 시작하는 중일 수 있어요 */ }
}

async function init() {
  S.settings = await api('/api/settings');
  setPlatform(S.settings.os);
  applyTheme(S.settings.appearance);
  S.sort = S.settings.ui?.sort || 'name';
  S.size = S.settings.ui?.size || 'm';
  await poll();
  if (S.lib.rev < 0) await loadLibrary();
  setInterval(poll, 2500);
  checkCrash();
}
// 창이 다시 보이면 바로 확인해요 (뒤에 있던 창은 Chrome이 잠시 멈춰 둘 수 있어요)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });

// 지난번에 엔진이 갑자기 멈췄다면 알려 줘요
async function checkCrash() {
  try {
    const j = await api('/api/crash');
    if (j.report) toast('지난번에 MSROAD가 갑자기 멈춘 기록이 있어요', { action: '기록 보기', ms: 12000, onAction: () => openSettings('crash') });
  } catch { /* 넘어가요 */ }
}
init().catch((e) => { if (!e.offline) toast('⚠️ ' + esc(e.message), { ms: 8000 }); });

export { closePicker };

// 예전 방식(Chrome 창)으로 열린 화면: 이제 MSROAD 는 Dock 에 보이는 앱으로 열려요
let moved = false;
function movedNotice() {
  if (moved) return;
  moved = true;
  const el = document.createElement('div');
  el.className = 'offline';
  el.innerHTML = `<div class="offline-card">${logoSVG(64)}<h2>MSROAD가 새 모습으로 바뀌었어요</h2>
    <p>이제 MSROAD는 <b>Dock에 아이콘이 있는 앱</b>으로 열려요.<br>이 창은 닫아도 돼요.</p></div>`;
  document.body.append(el);
  setTimeout(() => { try { window.close(); } catch { /* 닫을 수 없으면 안내만 보여 줘요 */ } }, 2500);
}
