// MSROAD — 폴더 고르기, 설정, 버전 · 업데이트
// made by. Nevertheless_D
import { S, $, esc, api, emit, toast, openModal, closeModal, confirmBox, shortPath, sleep, ROADS, logoSVG } from './core.js';

// ── 폴더 ──
export async function chooseFolder(path) {
  try {
    if (!path) {
      const j = await api('/api/choose-folder', { start: S.settings?.folder || '', prompt: '악보가 들어 있는 폴더를 골라 주세요' });
      if (!j.path) return;
      path = j.path;
    }
    const st = await api('/api/folder', { path });
    S.settings = { ...S.settings, ...st };
    S.road = 'ALL'; S.lane = ''; S.query = '';
    $('#q').value = '';
    await S.reload();
    closeModal();
    toast(`📁 ${esc(S.lib.rootName)} 폴더에서 악보 ${S.sheets.length}개를 찾았어요`);
  } catch (e) { toast('⚠️ ' + esc(e.message), { ms: 6000 }); }
}

// ── 버전 배지 · 배너 ──
export function renderVersion() {
  const u = S.update;
  if (!u) return;
  const b = $('#verBtn');
  b.className = 'ver ' + ({ available: 'available', ready: 'ready', downloading: 'busy', installing: 'busy', checking: 'busy', error: 'error' }[u.status] || '');
  $('#verText').textContent = 'v' + u.current;
  b.title = { available: `새 버전 v${u.latest?.version}이 있어요`, ready: `v${u.installed} 설치 완료 · 다시 시작하면 적용돼요`, downloading: '업데이트를 내려받는 중', installing: '업데이트 설치 중', uptodate: '최신 버전이에요' }[u.status] || '버전 · 업데이트';
  renderBanner();
  if (updEl?.isConnected) fillUpdate();
}

let bannerHidden = '';
function renderBanner() {
  const u = S.update;
  const el = $('#banner');
  const key = u?.status + (u?.installed || u?.latest?.version || '');
  if (bannerHidden === key) { el.hidden = true; return; }
  if (u?.status === 'ready' && u.installed) {
    el.hidden = false;
    el.innerHTML = `<span style="font-size:18px">✨</span><div style="flex:1"><b>MSROAD v${esc(u.installed)}을(를) 설치했어요.</b> <span class="muted">다시 시작하면 새 버전이 적용돼요.</span></div>
      <button class="btn go" data-up="restart">지금 다시 시작</button><button class="btn ghost" data-up="later">나중에</button>`;
  } else if (u?.status === 'available' && !u.autoUpdate) {
    el.hidden = false;
    el.innerHTML = `<span style="font-size:18px">🎁</span><div style="flex:1"><b>새 버전 v${esc(u.latest.version)}이 나왔어요.</b></div>
      <button class="btn go" data-up="install">업데이트</button><button class="btn ghost" data-up="later">나중에</button>`;
  } else el.hidden = true;
}
$('#banner').addEventListener('click', (e) => {
  const a = e.target.closest('[data-up]')?.dataset.up;
  if (a === 'restart') restartApp();
  if (a === 'install') api('/api/update/install', {}).then(() => toast('업데이트를 내려받기 시작했어요'));
  if (a === 'later') { const u = S.update; bannerHidden = u?.status + (u?.installed || u?.latest?.version || ''); $('#banner').hidden = true; }
});

export async function restartApp() {
  try {
    await api('/api/update/restart', {});
    showEnded('새 버전으로 다시 시작하는 중이에요…');
    const old = S.build;
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      try { const j = await api('/api/ping'); if ((j.build && j.build !== old) || i > 8) { location.reload(); return; } } catch { /* 시작하는 중 */ }
    }
    showEnded('다시 시작하지 못했어요. MSROAD 앱을 직접 실행해 주세요.');
  } catch (err) { toast('⚠️ ' + esc(err.message), { ms: 6000 }); }
}

let updEl = null;
export function openUpdate() {
  updEl = document.createElement('div');
  updEl.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  openModal('버전 · 업데이트', updEl, { onClose: () => { updEl = null; } });
  fillUpdate();
  api('/api/update/check').then((u) => { S.update = u; renderVersion(); }).catch(() => {});
}
function fillUpdate() {
  const u = S.update;
  if (!u || !updEl) return;
  const pct = Math.round((u.progress || 0) * 100);
  const st = {
    checking: '확인하는 중…', uptodate: '최신 버전을 쓰고 있어요 ✓', available: `새 버전 v${u.latest?.version}이 있어요`,
    downloading: `내려받는 중 ${pct}%`, installing: '설치하는 중…', ready: `v${u.installed} 설치 완료 · 다시 시작하면 적용돼요`,
    error: u.error || '확인하지 못했어요', idle: '아직 확인하지 않았어요',
  }[u.status];
  const last = u.lastCheck ? new Date(u.lastCheck).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const notes = u.latest?.notes?.length ? `<div class="box" style="gap:6px"><h4>v${esc(u.latest.version)}에서 바뀐 점 <span class="muted" style="font-weight:500">${esc(u.latest.date || '')}</span></h4><ul class="notes">${u.latest.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
  updEl.innerHTML = `
    <div class="box">
      <div class="kv"><span>지금 버전</span><b class="disp">v${esc(u.current)}</b></div>
      <div class="kv"><span>최신 버전</span><b class="disp">${u.latest ? 'v' + esc(u.latest.version) : '—'}</b></div>
      <div class="kv"><span>상태</span><b>${esc(st)}</b></div>
      <div class="kv"><span>마지막 확인</span><span>${esc(last)}</span></div>
      ${u.status === 'downloading' ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-u="check" ${['checking', 'downloading', 'installing'].includes(u.status) ? 'disabled' : ''}>업데이트 확인</button>
        ${u.status === 'available' ? '<button class="btn go" data-u="install">지금 업데이트</button>' : ''}
        ${u.status === 'ready' ? '<button class="btn go" data-u="restart">다시 시작해서 적용</button>' : ''}
      </div>
    </div>
    ${notes}
    <div class="box">
      <label class="switch-row"><input type="checkbox" data-u="auto" ${u.autoUpdate ? 'checked' : ''}><span class="switch"></span>자동 업데이트</label>
      <div class="note">켜 두면 앱을 켤 때와 6시간마다 새 버전을 확인해서 알아서 설치해요. 새 버전은 다시 시작할 때 적용돼요.</div>
      ${u.canRollback ? `<div class="kv"><span>문제가 생기면 이전 버전으로 돌아갈 수 있어요.</span><button class="link" data-u="rollback">v${esc(u.backupVersion)}으로 되돌리기</button></div>` : ''}
    </div>`;
}
document.addEventListener('click', async (e) => {
  const a = e.target.closest('#modalRoot [data-u]')?.dataset.u;
  if (!a || a === 'auto') return;
  try {
    if (a === 'check') { S.update.status = 'checking'; fillUpdate(); S.update = await api('/api/update/check'); renderVersion(); }
    if (a === 'install') { await api('/api/update/install', {}); toast('업데이트를 내려받기 시작했어요'); }
    if (a === 'restart') { closeModal(); return restartApp(); }
    if (a === 'rollback') {
      if (!(await confirmBox('이전 버전으로 되돌리기', `v${esc(S.update.backupVersion)}으로 되돌릴까요? 다시 시작하면 적용돼요.`, '되돌리기'))) return;
      await api('/api/update/rollback', {});
      toast('이전 버전으로 바꿨어요. 다시 시작하면 적용돼요. 자동 업데이트는 꺼 두었어요', { ms: 6000 });
    }
  } catch (err) { toast('⚠️ ' + esc(err.message), { ms: 5000 }); }
});
document.addEventListener('change', async (e) => {
  if (e.target.matches('#modalRoot [data-u=auto]')) {
    S.settings = await api('/api/settings', { autoUpdate: e.target.checked }).catch(() => S.settings);
    S.update.autoUpdate = e.target.checked;
    renderVersion();
  }
});

// ── 설정 ──
export function openSettings(focus) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  let crash = null;
  api('/api/crash').then((j) => { crash = j.report || ''; render(); if (focus === 'crash') body.querySelector('[data-crash]')?.scrollIntoView({ block: 'center' }); }).catch(() => {});
  const render = () => {
    const st = S.settings;
    const folder = st.folder;
    const others = (st.recent || []).filter((r) => r.path !== folder);
    body.innerHTML = `
      <div class="box"><h4>화면 모드</h4>
        <div class="seg" data-s="theme">${[['system', '시스템 설정 따르기'], ['light', '라이트'], ['dark', '다크']].map(([v, l]) => `<button data-v="${v}" style="flex:1" class="${(st.appearance || 'system') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="note">‘시스템 설정 따르기’를 고르면 macOS의 라이트 · 다크 모드를 그대로 따라가요.</div></div>
      <div class="box"><h4>악보 폴더</h4>
        ${folder ? `<div class="folder"><div class="fi">📁</div><div class="ft"><b>${esc(S.lib.rootName || '')}</b><span>${esc(shortPath(folder))}</span></div><button class="mini" data-s="reveal">Finder</button><button class="mini" data-s="folder">바꾸기</button></div>`
          : '<button class="btn go" data-s="folder">악보 폴더 고르기</button>'}
        ${others.length ? `<div class="note" style="margin-bottom:-4px">최근에 연 폴더</div><div class="recent-list">${others.map((r) => `<div class="ri ${r.exists ? '' : 'gone'}" data-recent="${esc(r.path)}"><span title="${esc(shortPath(r.path))}">📁 ${esc(r.name)}</span><small>${r.exists ? '' : '찾을 수 없음'}</small><button class="link" data-forget="${esc(r.path)}">목록에서 빼기</button></div>`).join('')}</div>` : ''}
        <label class="switch-row"><input type="checkbox" data-s="sub" ${st.subfolders ? 'checked' : ''}><span class="switch"></span>하위 폴더 안의 악보도 읽기</label></div>
      <div class="box"><h4>파일 이름 규칙</h4>
        <div class="note">확장자 바로 앞의 영어 코드를 읽어요. A~G로 시작하고 b(플랫), #(샵), m(마이너)까지 읽어요.<br>
        예) 구주의십자가보혈로<b>Ab</b>.jpg · 광야를지나며<b>F#m</b>.png · Amazing Grace<b>_G</b>.jpg (영어 제목은 _ 다음에 코드)<br>
        여러 장짜리 악보는 이름 끝에 <b>_1, _2</b>를 붙여요. 예) 주의은혜라A<b>_1</b>.jpg, 주의은혜라A<b>_2</b>.jpg</div></div>
      <div class="box"><h4>ROAD 이야기</h4>
        <div class="note">악보는 코드의 첫 글자에 따라 <b>A ROAD</b>부터 <b>G ROAD</b>까지 일곱 길로 나뉘고, 길 안에서는 Ab · A · Am처럼 세부 코드별로 다시 나뉘어요. 코드를 못 찾은 악보는 어느 길로 갈지 기다리는 <b>갈림길</b>에 모여요.</div>
        <div style="display:flex;gap:5px">${ROADS.map((R) => `<span class="plate r${R}" style="flex:1">${R}</span>`).join('')}</div></div>
      <div class="box"><h4>정보</h4>
        <div class="kv"><span>버전</span><b class="disp">MSROAD v${esc(st.build)}</b></div>
        <div class="kv"><span>업데이트</span><button class="link" data-s="update">버전 · 업데이트 열기</button></div>
        <div class="kv"><span>사용한 오픈소스</span><span style="text-align:right">PDF.js (Mozilla, Apache-2.0) · Pretendard · Unbounded (OFL)</span></div>
        <button class="btn danger" data-s="quit" style="margin-top:4px">MSROAD 종료</button></div>
      <div class="box" data-crash><h4>문제 기록</h4>
        ${crash === null ? '<div class="note">확인하는 중…</div>' : crash
          ? `<div class="note">MSROAD가 갑자기 멈췄던 기록이에요. <b>복사</b>를 눌러 만든 사람에게 보내 주면 원인을 찾을 수 있어요.</div><pre class="crash">${esc(crash)}</pre><div><button class="btn" data-s="copycrash">기록 복사</button></div>`
          : '<div class="note">멈췄던 기록이 없어요 ✓</div>'}</div>
      <div style="text-align:center;font:600 10.5px Unbounded,sans-serif;letter-spacing:.05em;color:var(--muted)">made by. Nevertheless_D</div>`;
  };
  render();
  openModal('설정', body);
  body.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-s]')?.dataset.s;
    const v = e.target.closest('[data-v]')?.dataset.v;
    const forget = e.target.closest('[data-forget]')?.dataset.forget;
    const rec = e.target.closest('[data-recent]')?.dataset.recent;
    try {
      if (forget) { S.settings = await api('/api/settings', { forgetRecent: forget }); render(); }
      else if (rec) { chooseFolder(rec); }
      else if (v && e.target.closest('[data-s=theme]')) { emit('theme', v); S.settings = await api('/api/settings', { appearance: v }); render(); }
      else if (s === 'folder') chooseFolder();
      else if (s === 'reveal') api('/api/reveal', {});
      else if (s === 'update') { closeModal(); openUpdate(); }
      else if (s === 'quit') { closeModal(); quitApp(); }
      else if (s === 'copycrash') { await navigator.clipboard.writeText(`MSROAD v${S.settings.build}\n${crash}`); e.target.textContent = '복사했어요 ✓'; }
    } catch (err) { toast('⚠️ ' + esc(err.message)); }
  });
  body.addEventListener('change', async (e) => {
    if (e.target.dataset.s === 'sub') {
      S.settings = await api('/api/settings', { subfolders: e.target.checked });
      await S.reload();
    }
  });
}

export async function quitApp() {
  if (!(await confirmBox('MSROAD 종료', 'MSROAD를 끌까요? 악보 파일은 그대로 있어요.', '종료'))) return;
  try { await api('/api/quit', {}); } catch { /* 이미 꺼졌어요 */ }
  showEnded('MSROAD를 껐어요. 이 창을 닫아도 돼요.');
  setTimeout(() => window.close(), 400);
}

export function showEnded(msg) {
  S.offline = true; // 일부러 끈 거라서 '쉬고 있어요' 안내는 띄우지 않아요
  let el = $('.ended');
  if (!el) { el = document.createElement('div'); el.className = 'ended'; document.body.append(el); }
  el.innerHTML = `${logoSVG(72)}<b>${esc(msg)}</b><span>made by. Nevertheless_D</span>`;
}
