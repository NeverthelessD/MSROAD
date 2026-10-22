// MSROAD — 코드 정하기 (갈림길 악보에 코드 붙이기 · 코드 바꾸기)
// made by. Nevertheless_D
import { S, $, esc, api, ROADS, normChord, newName, roadCls, toast, versionsOf } from './core.js';

let state = null;

export const pickerOpen = () => !!state;

export function closePicker() {
  if (!state) return;
  $('#pop').hidden = true;
  state = null;
}

function chordFromState() {
  if (!state.root) return '';
  return state.root + state.acc + (state.minor ? 'm' : '');
}

// anchor: 버튼(또는 위치를 가진 것) — 그 옆에 띄워요. onDone(newSheet) 은 이름을 바꾼 뒤 불려요.
export function openPicker(sheet, anchor, onDone) {
  const c = sheet.chord || '';
  state = {
    sheet, onDone,
    root: c ? c[0] : '',
    acc: c.includes('b') ? 'b' : c.includes('#') ? '#' : '',
    minor: c.endsWith('m'),
  };
  const el = $('#pop');
  el.hidden = false;
  draw(true);
  // 위치
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(Math.max(10, r.left + r.width / 2 - w / 2), innerWidth - w - 10);
  let top = r.bottom + 8;
  if (top + h > innerHeight - 10) top = Math.max(10, r.top - h - 8);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  setTimeout(() => el.querySelector('.pick-in')?.focus(), 30);
}

function draw(first) {
  const el = $('#pop');
  const s = state.sheet;
  const chord = chordFromState();
  const p0 = s.pages[0];
  const nn = newName(s, chord, p0);
  const others = [...new Set(versionsOf(s).filter((v) => v.chord && v.id !== s.id).map((v) => v.chord))];
  const fn = chord
    ? `${esc(nn.pre)}<span class="c ${roadCls(chord)}">${esc(chord)}</span>${esc(nn.post)}`
    : `<span class="muted">위에서 코드를 골라 주세요</span>`;
  if (first) {
    el.innerHTML = `
      <h5>${s.chord ? '코드 바꾸기' : '코드 정하기'}<span>${esc(s.title)}</span></h5>
      <input class="pick-in" type="text" placeholder="바로 입력해도 돼요 (예: Ab, F#m)" spellcheck="false" autocomplete="off">
      <div class="roots">${ROADS.map((R) => `<button class="r${R}" data-root="${R}">${R}</button>`).join('')}</div>
      <div class="pick-row">
        <div class="seg" data-g="acc"><button data-v="">♮ 없음</button><button data-v="b">♭ 플랫</button><button data-v="#">♯ 샵</button></div>
      </div>
      <div class="pick-row">
        <div class="seg" data-g="minor"><button data-v="0">장조</button><button data-v="1">단조 (m)</button></div>
      </div>
      <div class="pick-out"><div class="fn"></div></div>
      <div class="pick-hint"></div>
      <div class="pick-act">${s.chord ? '<button class="btn ghost danger" data-a="clear" style="margin-right:auto">코드 빼기</button>' : ''}<button class="btn ghost" data-a="cancel">취소</button><button class="btn go" data-a="ok">이름 바꾸기</button></div>`;
    el.onclick = onClick;
    el.querySelector('.pick-in').oninput = onType;
    el.querySelector('.pick-in').onkeydown = onKey;
    el.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePicker(); } };
  }
  el.querySelectorAll('[data-root]').forEach((b) => b.classList.toggle('on', b.dataset.root === state.root));
  el.querySelectorAll('[data-g=acc] button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.acc));
  el.querySelectorAll('[data-g=minor] button').forEach((b) => b.classList.toggle('on', b.dataset.v === (state.minor ? '1' : '0')));
  const many = s.pages.length > 1 ? ` (${s.pages.length}장 모두)` : '';
  el.querySelector('.fn').innerHTML = `<small>새 파일 이름${many}</small>${fn}`;
  el.querySelector('.pick-hint').innerHTML = others.length
    ? `같은 곡의 다른 악보: ${others.map((k) => `<b>${esc(k)}</b>`).join(', ')}`
    : '파일 이름의 확장자 바로 앞에 코드를 붙여요. 바꾼 뒤 바로 되돌릴 수 있어요.';
  const ok = el.querySelector('[data-a=ok]');
  ok.disabled = !chord || chord === s.chord;
}

function onType(e) {
  const c = normChord(e.target.value);
  if (c) {
    state.root = c[0];
    state.acc = c.includes('b') ? 'b' : c.includes('#') ? '#' : '';
    state.minor = c.endsWith('m');
    draw();
  }
}
function onKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); apply(chordFromState()); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(); }
}
function onClick(e) {
  const root = e.target.closest('[data-root]')?.dataset.root;
  if (root) { state.root = root; return sync(); }
  const g = e.target.closest('[data-g]');
  const v = e.target.closest('[data-v]')?.dataset.v;
  if (g && v !== undefined) {
    if (g.dataset.g === 'acc') state.acc = v; else state.minor = v === '1';
    return sync();
  }
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'cancel') closePicker();
  if (a === 'ok') apply(chordFromState());
  if (a === 'clear') apply('');
}
function sync() {
  const input = $('#pop .pick-in');
  input.value = chordFromState();
  draw();
}

export async function apply(chord) {
  if (!state) return;
  const { sheet, onDone } = state;
  if (chord === sheet.chord) return closePicker();
  try {
    await api('/api/assign', { id: sheet.id, chord });
    closePicker();
    await S.reload();
    const moved = S.sheets.find((x) => x.dir === sheet.dir && x.prefix === sheet.prefix && x.chord === chord && x.pages.length === sheet.pages.length);
    const msg = chord ? `‘${esc(sheet.title)}’에 ${esc(chord)}를 붙여서 ${esc(chord[0])} ROAD로 옮겼어요` : `‘${esc(sheet.title)}’의 코드를 빼서 갈림길로 옮겼어요`;
    toast(msg, {
      action: '되돌리기',
      onAction: async () => {
        try { await api('/api/undo', {}); await S.reload(); toast('원래 이름으로 되돌렸어요'); onDone?.(S.sheets.find((x) => x.dir === sheet.dir && x.prefix === sheet.prefix && x.chord === sheet.chord)); }
        catch (err) { toast('⚠️ ' + esc(err.message)); }
      },
    });
    onDone?.(moved);
  } catch (err) {
    toast('⚠️ ' + esc(err.message), { ms: 6000 });
  }
}

document.addEventListener('mousedown', (e) => {
  if (state && !e.target.closest('#pop') && !e.target.closest('[data-assign]') && !e.target.closest('[data-vassign]')) closePicker();
});
