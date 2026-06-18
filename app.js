/* ============================================================
   app.js — SpeakUp! Choicy プロトタイプ
   依存: config.js, content.js  /  描画先: #app
   ============================================================ */
const C = window.CONFIG, D = window.GAME_DATA;
const APP = document.getElementById('app');
const IMG = f => `${C.IMAGES_DIR}/${f}`;
const AUD = f => `${C.AUDIO_DIR}/${f}`;
const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- data helpers ---------- */
const scenesOf = a => D.scenes.filter(s => s.area_id === a.area_id).sort((x, y) => x.display_order - y.display_order);
const variantsOf = sid => D.variants.filter(v => v.scene_id === sid);
const phraseOf = (sid, vid, role) => D.phrases.find(p => p.scene_id === sid && p.variant_id === vid && p.role === role);
const phrasesOfVariant = (sid, vid) => D.phrases.filter(p => p.scene_id === sid && p.variant_id === vid).sort((a, b) => a.turn_order - b.turn_order);
const ipaFor = w => D.lexicon[w.toLowerCase().replace(/[^a-z'-]/g, '')] || '';
const STOP = new Set("a an the is are am do does did you i it to of in on at and or but with for can could would will my our your this that these those here there he she we they me us them his her its be been have has had just so too now really sure".split(' '));

function stars(v) {
  let h = '';
  for (let i = 1; i <= 3; i++) { const on = v >= i, half = !on && v >= i - 0.5; h += `<span class="material-symbols-rounded star ${on || half ? 'on' : 'off'}">${half ? 'star_half' : 'star'}</span>`; }
  return `<span class="stars">${h}</span>`;
}
function gapFill(text, n) {
  const toks = text.split(/(\s+)/); const idx = [];
  toks.forEach((t, i) => { const w = t.toLowerCase().replace(/[^a-z'-]/g, ''); if (w && !STOP.has(w)) idx.push(i); });
  const chosen = new Set();
  const m = Math.min(n, idx.length);
  for (let k = 0; k < m; k++) chosen.add(idx[Math.round(k * (idx.length - 1) / Math.max(1, m - 1))]);
  return toks.map((t, i) => {
    if (!chosen.has(i)) return esc(t);
    const mm = t.match(/^([^A-Za-z']*)([A-Za-z'-]+)([^A-Za-z']*)$/);
    if (!mm) return esc(t);
    return esc(mm[1]) + `<u class="blank">${'＿'.repeat(Math.max(3, mm[2].length))}</u>` + esc(mm[3]);
  }).join('');
}

/* ---------- 設定の保存/復元（ローカル保存） ---------- */
const PREFS = (() => { try { return JSON.parse(localStorage.getItem('speakup_prefs')) || {}; } catch (e) { return {}; } })();
function savePrefs() { try { localStorage.setItem('speakup_prefs', JSON.stringify({ bgm: bgm.on, sub: SUB })); } catch (e) {} }

/* ---------- BGM（画面別トラック） ---------- */
const bgm = { audio: document.getElementById('bgm'), on: (typeof PREFS.bgm === 'boolean' ? PREFS.bgm : C.BGM_DEFAULT_ON), ducked: false, track: null };
let resultActive = false; // 結果画面ではBGMを自動オフ
function bgmInit() { bgm.audio.volume = (C.BGM_VOLUME != null ? C.BGM_VOLUME : 0.16); }
function bgmPlay(trackKey) {
  const src = (C.BGM || {})[trackKey]; if (!src) return;
  if (bgm.track !== trackKey) { bgm.track = trackKey; bgm.audio.src = src; }
  if (bgm.on && !bgm.ducked && !resultActive) bgm.audio.play().catch(() => {});
}
function bgmSet(on) { bgm.on = on; if (on && !bgm.ducked && !resultActive) bgm.audio.play().catch(() => {}); else bgm.audio.pause(); updateControls(); savePrefs(); }
function bgmDuck(d) { bgm.ducked = d; if (!bgm.on) return; if (d || resultActive) bgm.audio.pause(); else bgm.audio.play().catch(() => {}); }

/* ---------- SFX（仮：Web Audio合成。C.SFXにパスを入れれば差し替え） ---------- */
const SFX_NOTES = {
  tap: [{ f: 660, d: 0.06, v: 0.10, type: 'triangle' }],
  success: [{ f: 523, d: 0.12, v: 0.16 }, { f: 659, t: 0.10, d: 0.12, v: 0.16 }, { f: 784, t: 0.20, d: 0.18, v: 0.18 }],
  perfect: [{ f: 523, d: 0.10, v: 0.16 }, { f: 659, t: 0.09, d: 0.10, v: 0.16 }, { f: 784, t: 0.18, d: 0.10, v: 0.16 }, { f: 1047, t: 0.27, d: 0.22, v: 0.18 }],
  fail: [{ f: 392, d: 0.14, v: 0.15, type: 'sawtooth' }, { f: 294, t: 0.12, d: 0.20, v: 0.13, type: 'sawtooth' }],
};
const sfx = {
  ctx: null, files: {},
  init() { Object.entries(C.SFX || {}).forEach(([k, v]) => { if (v) { const a = new Audio(v); a.preload = 'auto'; this.files[k] = a; } }); },
  play(name) {
    if (!C.SFX_ENABLED) return;
    if (this.files[name]) { const a = this.files[name].cloneNode(); a.volume = 0.6; a.play().catch(() => {}); return; }
    try {
      const ctx = this.ctx || (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      (SFX_NOTES[name] || SFX_NOTES.tap).forEach(n => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = n.type || 'sine'; o.frequency.value = n.f;
        const t0 = now + (n.t || 0), dur = n.d || 0.08;
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(n.v || 0.15, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
      });
    } catch (e) {}
  }
};

/* ---------- Header / settings ---------- */
let SUB = (typeof PREFS.sub === 'boolean' ? PREFS.sub : false);  // 万次郎語字幕モード
const current = { screen: 'title', area: null, scene: null, vid: null, role: null };
function updateControls() {
  $('#set-bgm').classList.toggle('on', bgm.on);
  $('#set-cc').classList.toggle('on', SUB);
}
function setSubtitle(on) { SUB = on; document.body.classList.toggle('subtitle-on', SUB); updateControls(); savePrefs(); }
function updateBack() { $('#btn-back').style.visibility = current.screen === 'title' ? 'hidden' : 'visible'; }
function navBack() {
  bgmDuck(false);
  if (current.screen === 'select') go(renderTitle);
  else if (current.screen === 'scene' || current.screen === 'result') go(() => renderSelect(current.area));
}

/* ---------- screen transition (hardened) ---------- */
function go(fn) {
  stopExample(); stopWaveAudio();
  APP.style.opacity = 0;
  setTimeout(() => {
    try { fn(); }
    catch (e) { console.error(e); APP.innerHTML = `<p style="padding:30px;text-align:center;color:var(--sub)">表示中に問題が発生しました。上の戻るボタンでお戻りください。</p>`; }
    updateBack(); APP.scrollTop = 0; APP.style.opacity = 1;
  }, 120);
}

/* ============================================================ SCREENS ============================================================ */
function renderTitle() {
  current.screen = 'title'; resultActive = false;
  bgmPlay('title');
  APP.innerHTML = '';
  const wrap = el(`<section class="screen title-screen"></section>`);
  wrap.appendChild(el(`<div class="brand"><img class="choicy-hero" src="${C.CHOICY_IMG}" alt="Choicy"><h1>SpeakUp! <span class="title-accent">Choicy</span></h1><p class="tagline">Lend your voice. Save the day.</p></div>`));
  const grid = el(`<div class="area-grid"></div>`);
  D.areas.forEach(a => {
    const ss = scenesOf(a); const avg = ss.reduce((s, x) => s + Number(x.difficulty_star), 0) / ss.length;
    const card = el(`<button class="area-card">
        <div class="area-thumb" style="background-image:url('${IMG(a.map_image)}')"></div>
        <div class="area-body"><div class="area-name">${esc(a.area_name_en)}<span class="sub-mj">${esc(a.area_name_ja)}</span></div>
        <div class="area-meta">${stars(avg)}<span class="count">${ss.length} spots</span></div></div></button>`);
    card.onclick = () => go(() => renderSelect(a));
    grid.appendChild(card);
  });
  // Coming soon (locked, no shadow, image shows when provided)
  const locked = (en, ja, img) => el(`<div class="area-card locked">
      <div class="area-thumb" style="background-image:url('${IMG(img)}')"></div><span class="soon-badge">COMING SOON</span>
      <div class="area-body"><div class="area-name">${en}<span class="sub-mj">${ja}</span></div>
      <div class="area-meta"><span class="count">Coming soon</span></div></div></div>`);
  grid.appendChild(locked('Los Angeles', 'ロサンゼルス', 'la_map.png'));
  grid.appendChild(locked('New York', 'ニューヨーク', 'ny_map.png'));
  wrap.appendChild(grid);
  APP.appendChild(wrap);
}

function renderSelect(area) {
  current.screen = 'select'; current.area = area; resultActive = false;
  bgmPlay('title');
  APP.innerHTML = '';
  const wrap = el(`<section class="screen select-screen"></section>`);
  wrap.appendChild(el(`<p class="select-hint"><span class="material-symbols-rounded">open_with</span>Drag or swipe to move the map</p>`));
  const frame = el(`<div class="map-frame">
    <div class="map-title"><span class="material-symbols-rounded">map</span>${esc(area.area_name_en)}<span class="sub-mj">${esc(area.area_name_ja)}</span></div>
    <div class="map-viewport"><div class="map-inner"><img class="map-img" src="${IMG(area.map_image)}" alt=""></div></div></div>`);
  const vp = $('.map-viewport', frame);
  const inner = $('.map-inner', frame);
  scenesOf(area).forEach(s => {
    const pin = el(`<button class="pin" style="left:${s.pin_x}%;top:${s.pin_y}%">
        <span class="pin-dot" style="background-image:url('${IMG(s.scene_id + '_V1.png')}')"></span><span class="pin-label">${esc(s.title_en)}</span>${stars(Number(s.difficulty_star))}</button>`);
    pin.onclick = () => openDetail(area, s);
    inner.appendChild(pin);
  });
  wrap.appendChild(frame);
  APP.appendChild(wrap);

  const center = () => { vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2; vp.scrollTop = (vp.scrollHeight - vp.clientHeight) / 2; };
  requestAnimationFrame(center);
  $('.map-img', vp).addEventListener('load', center);

  // drag-to-pan (mouse only; touch uses native scroll)
  let pan = null;
  vp.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' || e.target.closest('.pin')) return; pan = { x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop }; vp.classList.add('grabbing'); });
  window.addEventListener('pointermove', e => { if (!pan) return; vp.scrollLeft = pan.sl - (e.clientX - pan.x); vp.scrollTop = pan.st - (e.clientY - pan.y); });
  window.addEventListener('pointerup', () => { if (pan) { pan = null; vp.classList.remove('grabbing'); } });
}

function openDetail(area, s) {
  let role = 'questioner';
  const v1 = s.scene_id + '_V1.png';
  const sheet = el(`<div class="overlay"><div class="detail-card">
      <div class="detail-hero" style="background-image:url('${IMG(v1)}')"></div>
      <button class="close"><span class="material-symbols-rounded">close</span></button>
      <div class="detail-body">
        <div class="detail-head"><div><h2>${esc(s.title_en)}</h2><p class="sub-mj">${esc(s.title_ja)}</p></div>${stars(Number(s.difficulty_star))}</div>
        <p class="summary en">${esc(s.summary_en)}</p>
        <p class="summary-mj sub-mj">${esc(s.summary_mj)}</p>
        <div class="role-pick"><p class="role-label">Choose your role</p>
          <div class="role-btns">
            <button class="role-btn on" data-role="questioner"><span class="material-symbols-rounded">arrow_back</span>Asker</button>
            <button class="role-btn" data-role="answerer">Answerer<span class="material-symbols-rounded">arrow_forward</span></button>
          </div></div>
        <button class="start-btn"><span class="material-symbols-rounded">play_arrow</span>START</button>
      </div></div></div>`);
  sheet.querySelectorAll('.role-btn').forEach(b => b.onclick = () => { role = b.dataset.role; sheet.querySelectorAll('.role-btn').forEach(x => x.classList.toggle('on', x === b)); });
  $('.close', sheet).onclick = () => sheet.remove();
  sheet.onclick = e => { if (e.target === sheet) sheet.remove(); };
  $('.start-btn', sheet).onclick = () => { sheet.remove(); const vs = variantsOf(s.scene_id); const vid = vs[Math.floor(Math.random() * vs.length)].variant_id; go(() => renderScene(area, s, vid, role)); };
  APP.appendChild(sheet);
}

function renderScene(area, s, vid, role, skipExample) {
  current.screen = 'scene'; current.area = area; current.scene = s; current.vid = vid; current.role = role; resultActive = false;
  bgmPlay('scene');
  const pair = phrasesOfVariant(s.scene_id, vid);
  const mine = pair.find(p => p.role === role);
  const other = pair.find(p => p.role !== role);
  const state = { hint: 0, recording: false, rec: null, chunks: [], stream: null };

  APP.innerHTML = '';
  const wrap = el(`<section class="screen scene-screen">
    <div class="stage" style="background-image:url('${IMG(s.scene_id + '_V' + vid + '.png')}')">
      <div class="balloon left ${role === 'questioner' ? 'mine' : ''}" id="bln-q"></div>
      <div class="balloon right ${role === 'answerer' ? 'mine' : ''}" id="bln-a"></div>
      <div class="intro" id="intro">Listen to the example first <span class="material-symbols-rounded">volume_up</span></div>
    </div>
    <div class="controls">
      <button class="ctl" id="btn-repeat" disabled><span class="material-symbols-rounded">replay</span><label>Repeat</label></button>
      <button class="ctl rec" id="btn-rec" disabled><span class="material-symbols-rounded">mic</span><label>Rec</label></button>
      <button class="ctl" id="btn-hint" disabled><span class="material-symbols-rounded">lightbulb</span><label>Hint</label></button>
    </div></section>`);

  const fill = () => {
    const map = { questioner: $('#bln-q', wrap), answerer: $('#bln-a', wrap) };
    pair.forEach(p => {
      const node = map[p.role];
      if (p === mine) {
        let inner = `<span class="ph-empty">…</span>`;
        if (state.hint >= 1) inner = `<span class="ph-manjiro">${esc(p.manjiro_ja)}</span>`;
        if (state.hint === 2) inner += `<span class="ph-gap">${gapFill(p.text_en, C.BLANKS_BY_STAR[String(s.difficulty_star)] || 1)}</span>`;
        else if (state.hint >= 3) inner += `<span class="ph-gap">${esc(p.text_en)}</span>`;
        node.innerHTML = inner;
      } else node.innerHTML = `<span class="ph-text">${esc(p.text_en)}</span>`;
    });
  };
  fill();
  APP.appendChild(wrap);

  const enable = on => ['btn-repeat', 'btn-rec', 'btn-hint'].forEach(id => $('#' + id, wrap).disabled = !on);
  $('#btn-hint', wrap).onclick = () => { state.hint = (state.hint + 1) % 4; fill(); $('#btn-hint', wrap).classList.toggle('maxed', state.hint === 3); };
  $('#btn-repeat', wrap).onclick = () => playExample([mine], wrap, null, false);
  $('#btn-rec', wrap).onclick = () => state.recording ? stopRecording(state, wrap, area, s, vid, role, mine, other) : startRecording(state, wrap, area, s, vid, role, mine, other);

  if (skipExample) { $('#intro', wrap).classList.add('hide'); enable(true); }
  else setTimeout(() => playExample(pair, wrap, () => { $('#intro', wrap).classList.add('hide'); enable(true); }, true), 400);
}

let _exAudio = null, _exStopped = false;
let _waveAudio = null, _waveBtn = null, _beatTimers = [], _rafId = 0;
function clearBeatTimers() { _beatTimers.forEach(t => clearTimeout(t)); _beatTimers = []; if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; } document.querySelectorAll('.beat.pop').forEach(b => b.classList.remove('pop')); }
function stopWaveAudio() {
  if (_waveAudio) { try { _waveAudio.onended = _waveAudio.onpause = _waveAudio.onerror = _waveAudio.onplaying = null; _waveAudio.pause(); } catch (e) {} }
  if (_waveBtn) { try { $('.material-symbols-rounded', _waveBtn).textContent = 'play_arrow'; } catch (e) {} }
  _waveAudio = null; _waveBtn = null; clearBeatTimers(); bgmDuck(false);
}
function stopExample() {
  _exStopped = true;
  if (_exAudio) { try { _exAudio.onended = null; _exAudio.onerror = null; _exAudio.pause(); } catch (e) {} _exAudio = null; }
  bgmDuck(false);
}
function playExample(list, wrap, done, showIntro) {
  if (_exAudio) { try { _exAudio.onended = null; _exAudio.onerror = null; _exAudio.pause(); } catch (e) {} _exAudio = null; }
  _exStopped = false;
  bgmDuck(true);
  if (showIntro) $('#intro', wrap).classList.remove('hide');
  const seq = [...list].sort((a, b) => a.turn_order - b.turn_order);
  let i = 0;
  const next = () => {
    if (_exStopped) return;
    if (i >= seq.length) { bgmDuck(false); if (showIntro) $('#intro', wrap).classList.add('hide'); done && done(); return; }
    const p = seq[i++]; const side = p.role === 'questioner' ? 'left' : 'right';
    wrap.querySelectorAll('.balloon').forEach(b => b.classList.remove('talking'));
    const sideEl = wrap.querySelector('.balloon.' + side); if (sideEl) sideEl.classList.add('talking');
    const a = new Audio(AUD(p.audio_file)); _exAudio = a; let done2 = false;
    const adv = () => { if (done2) return; done2 = true; if (sideEl) sideEl.classList.remove('talking'); next(); };
    a.onended = adv; a.onerror = () => setTimeout(adv, 600);
    a.play().catch(() => setTimeout(adv, 600));
  };
  next();
}

/* ---- recording ---- */
async function startRecording(state, wrap, area, s, vid, role, mine, other) {
  const btn = $('#btn-rec', wrap); bgmDuck(true); state.recStart = Date.now();
  if (C.DEMO_MODE) { state.recording = true; btn.classList.add('live'); $('label', btn).textContent = 'Stop'; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.stream = stream; state.chunks = [];
    let mime = '';
    const cand = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac'];
    if (window.MediaRecorder && MediaRecorder.isTypeSupported) { for (const c of cand) { if (MediaRecorder.isTypeSupported(c)) { mime = c; break; } } }
    state.rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    state.mime = state.rec.mimeType || mime || 'audio/mp4';
    state.rec.ondataavailable = e => e.data.size && state.chunks.push(e.data);
    state.rec.start();
    state.recording = true; btn.classList.add('live'); $('label', btn).textContent = 'Stop';
  } catch (err) { bgmDuck(false); toast('マイクを使えません。ブラウザの許可（または localhost / https）をご確認ください。'); }
}
function stopMic(state) { try { state.rec && state.rec.state !== 'inactive' && state.rec.stop(); state.stream && state.stream.getTracks().forEach(t => t.stop()); } catch (e) {} }

async function stopRecording(state, wrap, area, s, vid, role, mine, other) {
  const btn = $('#btn-rec', wrap);
  state.recording = false; btn.classList.remove('live'); $('label', btn).textContent = 'Rec';
  showScoring(wrap);
  let result, userBlob = null;
  try {
    if (C.DEMO_MODE) { const held = state.recStart ? (Date.now() - state.recStart) / 1000 : undefined; await new Promise(r => setTimeout(r, 700)); result = demoScore(mine, held); }
    else {
      userBlob = await new Promise(res => { state.rec.onstop = () => res(new Blob(state.chunks, { type: state.rec.mimeType || state.mime || 'audio/mp4' })); state.rec.stop(); });
      stopMic(state);
      try { result = await geminiScore(userBlob, mine); }
      catch (e) { console.error(e); toast('採点に失敗したのでデモ採点を表示します: ' + e.message); showDemoBadge('DEMO (fallback)'); result = demoScore(mine); }
      if (userBlob && result) {
        try {
          const an = await getAnalysis(URL.createObjectURL(userBlob));
          result.rhythm = rhythmScoreFromAnalysis(beatsFor(mine.text_en, mine.chunks_en), an);
          result.overall = combineOverall(result.accuracy, result.rhythm);
        } catch (e) { console.error('rhythm score failed', e); }
      }
    }
  } catch (e) { console.error(e); result = demoScore(mine); }
  bgmDuck(false);
  go(() => renderResult(area, s, vid, role, mine, other, result, userBlob));
}

/* ---- scoring ----
   方針: 各単語に great/close/practice/missing のラベルを付け、
   completeness=言えた割合、accuracy=言えた単語の発音平均、overall=accuracy×completeness/100
   として算出する。表示の色とスコアが必ず一致し、未発話は missing として反映される。 */
// 苦手な音(IPA記号)→具体的な調音アドバイス（舌・唇・息）
const ARTIC_TIPS = {
  'r':  { ipa: 'r',  slug: 'r',            en: "English R: pull your tongue back and keep it touching nothing — don't use the Japanese ら-row.", mj: "英語のRは舌をどこにも触れさせず後ろへ引く。ラ行にしない。" },
  'ɹ':  { ipa: 'ɹ',  slug: 'r',            en: "English R: pull your tongue back and keep it touching nothing — don't use the Japanese ら-row.", mj: "英語のRは舌をどこにも触れさせず後ろへ引く。ラ行にしない。" },
  'l':  { ipa: 'l',  slug: 'l',            en: "L: press the tip of your tongue firmly behind your upper front teeth.", mj: "Lは舌先を上の前歯の裏にしっかり当てる。" },
  'θ':  { ipa: 'θ',  slug: 'th_voiceless', en: "Unvoiced TH (think): put your tongue tip lightly between your teeth and blow air — no voice.", mj: "thは舌先を軽く歯の間に出し、息だけ出す（声は出さない）。" },
  'ð':  { ipa: 'ð',  slug: 'th_voiced',    en: "Voiced TH (this): tongue tip between the teeth, but turn your voice on.", mj: "ðは舌先を歯の間に出し、声も出す。" },
  'v':  { ipa: 'v',  slug: 'v',            en: "V: rest your top teeth on your bottom lip and add voice.", mj: "vは上の歯を下唇に当てて声を出す。fと違い声あり。" },
  'f':  { ipa: 'f',  slug: 'f',            en: "F: top teeth on your bottom lip, blow air with no voice.", mj: "fは上の歯を下唇に当て、息だけ出す。" },
  'æ':  { ipa: 'æ',  slug: 'ae',           en: "The 'a' in cat: open your mouth wide — a sound between Japanese ア and エ.", mj: "æは口を大きく開け、アとエの中間の音。" },
  'w':  { ipa: 'w',  slug: 'w',            en: "W: round your lips tightly first, like a small う, then glide into the vowel.", mj: "wは唇を丸めて小さい「う」から始めて滑らかに。" },
  'ə':  { ipa: 'ə',  slug: 'schwa',        en: "Schwa: fully relax — a short, weak 'uh' with no stress.", mj: "あいまい母音は力を抜いた弱い「ア」。強く言わない。" },
  'ŋ':  { ipa: 'ŋ',  slug: 'ng',           en: "The 'ng' sound: let it resonate through your nose; don't add a hard 'g'.", mj: "ngは鼻に抜く音。最後に「グ」を付けない。" },
  'ɝ':  { ipa: 'ɝ',  slug: 'er',           en: "R-colored vowel (bird): say 'uh' while curling your tongue back.", mj: "「アー」と言いながら舌を後ろに丸める音。" },
  'ɜ':  { ipa: 'ɜ',  slug: 'er',           en: "R-colored vowel (bird): say 'uh' while curling your tongue back.", mj: "「アー」と言いながら舌を後ろに丸める音。" },
  'ʃ':  { ipa: 'ʃ',  slug: 'sh',           en: "SH: round your lips and push air over the middle of your tongue.", mj: "shは唇を丸め、舌の中央から息を流す。" },
  'ɪ':  { ipa: 'ɪ',  slug: 'ih',           en: "Short 'i' (sit): relax — shorter and looser than the Japanese イ.", mj: "短いイは日本語のイより短く緩めて。" },
  'ʊ':  { ipa: 'ʊ',  slug: 'uh',           en: "Short 'u' (book): relax your lips — looser than the Japanese ウ.", mj: "短いウは唇を緩めて。" },
};
function tipsFromWords(words) {
  const seen = [], tips = [];
  words.forEach(w => {
    if ((w.level === 'close' || w.level === 'practice') && w.weak && ARTIC_TIPS[w.weak] && !seen.includes(w.weak)) {
      seen.push(w.weak); if (tips.length < 3) tips.push(ARTIC_TIPS[w.weak]);
    }
  });
  return tips;
}
const LVL_W = { great: 100, close: 70, practice: 40 };
function combineOverall(accuracy, rhythm) { return Math.round(0.6 * accuracy + 0.4 * rhythm); }
function rhythmScoreFromAnalysis(beats, an) {
  const prom = flatBeats(beats).filter(w => w[1] >= 1).length || 1;
  const coverage = Math.max(0, Math.min(1, an.peaks.length / prom));
  const dyn = an.peakLevel / Math.max(an.med, 1e-6);
  const dynN = Math.max(0, Math.min(1, (dyn - 1.5) / 3));
  return Math.round(Math.max(0, Math.min(100, 100 * (0.55 * coverage + 0.45 * dynN))));
}
function finalizeScore({ words, said_text, comment, comment_mj, rhythm }) {
  words = (words || []).map(w => ({
    word: w.word,
    level: ['great', 'close', 'practice', 'missing'].includes(w.level) ? w.level : 'great',
    weak: w.weak || ''
  }));
  const total = words.length || 1;
  const said = words.filter(w => w.level !== 'missing');
  const accuracy = said.length ? Math.round(said.reduce((s, w) => s + LVL_W[w.level], 0) / said.length) : 0;
  const completeness = Math.round(100 * said.length / total);
  const rhythmVal = (rhythm != null) ? rhythm : Math.max(35, accuracy - 10);   // 実音解析が無い場合の暫定値
  const overall = combineOverall(accuracy, rhythmVal);
  const missing = total - said.length;
  if (!comment) {
    if (missing > 0) {
      comment = "You stopped partway — try to say the whole phrase in one go. The part you did say sounded good!";
      comment_mj = "途中で止まったみたい 最後まで一息で言ってみよう 言えた所はいい感じ！";
    } else if (overall >= C.SUCCESS_THRESHOLD) {
      comment = "Nicely done — that came through clearly! Try stressing the key words a bit more to sound even more natural.";
      comment_mj = "いいね ちゃんと伝わった！大事な単語を少し強く言うと もっと自然。";
    } else {
      comment = "So close! Instead of one word at a time, group the words into chunks and say each chunk in one breath.";
      comment_mj = "おしい！単語ひとつずつより チャンクごとにまとめて 一息で言ってみよう。";
    }
  }
  return { accuracy, rhythm: rhythmVal, completeness, overall, words, said_text: said_text || said.map(w => w.word).join(' '), comment, comment_mj, tips: tipsFromWords(words) };
}

function demoScore(mine, heldSec) {
  const toks = mine.text_en.split(/\s+/);
  const total = toks.length;
  // デモは音声を解析できないため、Recを押している長さで「どこまで言えたか」を擬似的に決める
  let cut;
  if (typeof heldSec === 'number') {
    const expected = total * 0.42 + 0.5;            // 想定発話時間(秒)
    const frac = Math.max(0, Math.min(1, heldSec / expected));
    cut = Math.round(total * frac);                 // 早くStop＝cutが小さい＝未発話が増える
  } else {
    cut = total;
    if (total >= 4 && Math.random() < 0.35) cut = Math.max(2, Math.floor(total * (0.4 + Math.random() * 0.45)));
  }
  const words = toks.map((w, idx) => {
    if (idx >= cut) return { word: w, level: 'missing', weak: '' };
    const clean = w.replace(/[^A-Za-z'-]/g, ''); let level = 'great';
    if (clean && !STOP.has(clean.toLowerCase()) && Math.random() < 0.25) level = Math.random() < 0.5 ? 'close' : 'practice';
    const ipa = ipaFor(w);
    let weak = '';
    if (level !== 'great' && ipa) { const tricky = [...ipa].find(ch => ARTIC_TIPS[ch]); weak = tricky || ipa[Math.max(0, Math.floor(ipa.length / 2))]; }
    return { word: w, level, weak };
  });
  const said_text = words.filter(w => w.level !== 'missing').map(w => w.word).join(' ');
  const saidCount = words.filter(w => w.level !== 'missing').length;
  const demoRhythm = Math.round(Math.max(35, Math.min(92, 58 + Math.random() * 28 - (words.length - saidCount) * 6)));
  return finalizeScore({ words, said_text, rhythm: demoRhythm });
}

async function geminiScore(blob, mine) {
  const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  const wordList = mine.text_en.split(/\s+/);
  const prompt = `You are an English pronunciation coach for a Japanese learner. Listen to the audio and compare it to the TARGET phrase.
TARGET: "${mine.text_en}"
CHUNKS: "${mine.chunks_en}"
Label EVERY target word in order (${JSON.stringify(wordList)}) with a level:
- "missing": the word is NOT clearly heard in the audio (e.g. the speaker stopped early or skipped it). Be strict: if you cannot actually hear that word, it is "missing", NOT "great".
- "great": clearly and correctly pronounced.
- "close": understandable but slightly off.
- "practice": hard to understand / clearly mispronounced.
Return ONLY compact JSON: {"said_text":"<exactly what you actually heard>","words":[{"word":string,"level":"missing"|"great"|"close"|"practice","weak":"<one IPA symbol to fix, or empty>"}],"comment":"<one short friendly coaching tip in ENGLISH, casual tone>","comment_mj":"<the same tip written in JAPANESE characters (hiragana/katakana/kanji), casual telegraphic style, English word order chunk by chunk, particles dropped. Do NOT use romaji.>"}
If the audio is silent or unrelated, mark all words "missing".`;
  const body = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: blob.type || 'audio/webm', data: b64 } }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } };
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 30000);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${C.MODEL}:generateContent?key=${C.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
  clearTimeout(to);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text).join('') || '{}';
  const parsed = JSON.parse(txt.replace(/```json|```/g, '').trim());
  if (!parsed.words || !parsed.words.length) parsed.words = wordList.map(w => ({ word: w, level: 'practice', weak: '' }));
  return finalizeScore({ words: parsed.words, said_text: parsed.said_text, comment: parsed.comment, comment_mj: parsed.comment_mj });
}

/* ---- result ---- */
function renderResult(area, s, vid, role, mine, other, res, userBlob) {
  current.screen = 'result'; current.area = area; resultActive = true;
  const ok = res.overall >= C.SUCCESS_THRESHOLD, perfect = res.overall >= C.PERFECT_THRESHOLD;
  try { bgm.audio.pause(); } catch (e) {}
  sfx.play(perfect ? 'perfect' : ok ? 'success' : 'fail');
  APP.innerHTML = '';
  const wrap = el(`<section class="screen result-screen"></section>`);

  const wordsHTML = (res.words || []).map(w => {
    let sub = '';
    if (w.level === 'missing') sub = `<span class="w-miss">未発話</span>`;
    else if (w.level !== 'great') {
      const ipa = ipaFor(w.word);
      if (ipa) { let body = esc(ipa); if (w.weak) body = body.replace(esc(w.weak), `<b>${esc(w.weak)}</b>`); sub = `<span class="w-ipa">/${body}/</span>`; }
    }
    return `<span class="w ${w.level}"><span class="w-en">${esc(w.word)}</span>${sub}</span>`;
  }).join('');
  const hasMissing = (res.words || []).some(w => w.level === 'missing');
  const band = perfect ? 'great' : ok ? 'close' : 'practice';

  wrap.appendChild(el(`<div class="result-head ${ok ? 'ok' : 'no'}"><img class="choicy-orb ${perfect ? 'cheer' : ''}" src="${C.CHOICY_IMG}" alt="Choicy"><h2>${ok ? (perfect ? 'Perfect! You nailed it!' : 'You helped them!') : 'Almost — try again!'}</h2></div>`));
  wrap.appendChild(el(`<p class="comment">${esc(res.comment || '')}<span class="comment-mj">${esc(res.comment_mj || '')}</span></p>`));
  wrap.appendChild(el(`<div class="score-row">
    <div class="ring-block"><div class="ring big" style="--p:${res.overall}"><div class="ring-in"><b>${res.overall}</b><small>SCORE</small></div></div><span class="ring-cap">Overall</span></div>
    <div class="ring-block"><div class="ring sm" style="--p:${res.accuracy};--c:#FFB59E;--ic:#E0744C"><div class="ring-in"><span class="material-symbols-rounded">record_voice_over</span></div></div><span class="ring-cap">Accuracy</span></div>
    <div class="ring-block"><div class="ring sm" style="--p:${res.rhythm != null ? res.rhythm : 0};--c:#BBE3D4;--ic:#2E9C82"><div class="ring-in"><span class="material-symbols-rounded">graphic_eq</span></div></div><span class="ring-cap">Rhythm</span></div>
  </div>`));
  wrap.appendChild(el(`<div class="phrase-card band-${band}"><div class="words">${wordsHTML}</div>
    <p class="said">You said: <span>${esc(res.said_text || '—')}</span></p>
    <div class="legend"><span class="lg great">Great</span><span class="lg close">Close</span><span class="lg practice">Practice</span>${hasMissing ? '<span class="lg missing">未発話</span>' : ''}</div></div>`));

  // pronunciation tips（苦手な音の具体的な口・舌の使い方＋図解サムネ）
  if (res.tips && res.tips.length) {
    const tipsHTML = res.tips.map(t => `<div class="tip">
        <div class="tip-img"><img src="${C.IMAGES_DIR}/phonemes/${t.slug}.svg" alt="${esc(t.ipa || '')}" loading="lazy"><span class="tip-zoom material-symbols-rounded">zoom_in</span></div>
        <div class="tip-text">${t.ipa ? `<span class="tip-ipa">/${esc(t.ipa)}/</span>` : ''}<span class="tip-en">${esc(t.en)}</span><span class="tip-mj sub-mj">${esc(t.mj)}</span></div>
      </div>`).join('');
    const tipsCard = el(`<div class="tips-card"><h3>Pronunciation tips</h3>${tipsHTML}</div>`);
    wrap.appendChild(tipsCard);
    const boxes = [...tipsCard.querySelectorAll('.tip-img')];
    res.tips.forEach((t, i) => {
      const box = boxes[i]; if (!box) return; const img = $('img', box);
      img.onerror = () => { box.style.display = 'none'; };           // 画像が無ければサムネ枠ごと隠す
      box.onclick = () => openLightbox(t.slug, t.ipa, t.en, t.mj);
    });
  }

  // rhythm (chunk beats) — お手本/自分を上下2段、各音声の実エネルギーで円サイズ
  const beats = beatsFor(mine.text_en, mine.chunks_en);
  const stripHTML = () => beats.map(ch => `<div class="chunk">${ch.map(w => {
    const cls = w[1] === 2 ? 'n' : w[1] === 1 ? 's' : 'w';
    return `<div class="beat ${cls}"><span class="dot"></span><span class="lab en">${esc(w[0])}</span></div>`;
  }).join('')}</div>`).join('');
  const meSrc = userBlob ? URL.createObjectURL(userBlob) : null, exSrc = AUD(mine.audio_file);
  const rcard = el(`<div class="rhythm-card"><h3>Rhythm</h3>
    <div class="r-legend"><span><i class="d w"></i>weak</span><span><i class="d s"></i>strong</span><span><i class="d n"></i>nucleus</span></div>
    <div class="r-track">
      <div class="r-head"><button class="r-play ex" aria-label="Play example"><span class="material-symbols-rounded">play_arrow</span></button><span class="r-name">Example</span></div>
      <div class="rhythm-stage"><div class="strip" data-strip="ex">${stripHTML()}</div></div>
    </div>
    <div class="r-track">
      <div class="r-head"><button class="r-play me" aria-label="Play your voice"><span class="material-symbols-rounded">play_arrow</span></button><span class="r-name">You</span></div>
      <div class="rhythm-stage"><div class="strip" data-strip="me">${stripHTML()}</div></div>
    </div>
    <p class="r-verdict" hidden></p></div>`);
  wrap.appendChild(rcard);
  const exStrip = $('.strip[data-strip="ex"]', rcard), meStrip = $('.strip[data-strip="me"]', rcard);
  wireRhythmPlay($('.r-play.ex', rcard), exSrc, [...exStrip.querySelectorAll('.beat')], beats, false, rcard);
  wireRhythmPlay($('.r-play.me', rcard), meSrc, [...meStrip.querySelectorAll('.beat')], beats, true, rcard);
  getAnalysis(exSrc).then(an => sizeDotsByEnergy(exStrip, beats, an)).catch(() => {});
  if (meSrc) getAnalysis(meSrc).then(an => { sizeDotsByEnergy(meStrip, beats, an); showVerdict(rcard, rhythmVerdict(beats, an)); }).catch(() => {});

  const qP = phraseOf(s.scene_id, vid, 'questioner'), aP = phraseOf(s.scene_id, vid, 'answerer');
  const expCard = (p, label) => `<div class="exp">
      <div class="exp-en"><span class="exp-label">${label}</span>${esc(p.text_en)}</div>
      <div style="font-size:14px;color:#525b69;margin-top:6px;line-height:1.55">${esc(p.explanation_en)}</div>
      <div class="exp-mj sub-mj">${esc(p.explanation_mj)}</div></div>`;
  wrap.appendChild(el(`<div class="explain"><h3>Phrases</h3>${expCard(qP, 'Asker')}${expCard(aP, 'Answerer')}</div>`));

  const actions = el(`<div class="result-actions"><button class="btn ghost" id="r-back"><span class="material-symbols-rounded">map</span>Scenes</button><button class="btn primary" id="r-retry"><span class="material-symbols-rounded">refresh</span>Try again</button></div>`);
  $('#r-back', actions).onclick = () => go(() => renderSelect(area));
  $('#r-retry', actions).onclick = () => go(() => renderScene(area, s, vid, role, true));
  wrap.appendChild(actions);
  APP.appendChild(wrap);
}

/* ---- rhythm (chunk beats) ----
   強弱: 0=弱(機能語) 1=強(内容語) 2=核(文中で一番の山=最後の内容語)
   再生に合わせて該当の拍をポップさせる（拍の中心時刻を音声長で正規化してスケジュール） */
function beatsFor(textEn, chunksEn) {
  const chunkStrs = (chunksEn || textEn || '').split('/').map(s => s.trim()).filter(Boolean);
  const chunks = chunkStrs.map(cs => cs.split(/\s+/).filter(Boolean).map(w => {
    const clean = w.toLowerCase().replace(/[^a-z'-]/g, '');
    return [w, (clean && !STOP.has(clean)) ? 1 : 0];
  }));
  let last = null;
  chunks.forEach((ch, ci) => ch.forEach((w, wi) => { if (w[1] === 1) last = [ci, wi]; }));
  if (last) chunks[last[0]][last[1]][1] = 2;
  else if (chunks.length) { const ci = chunks.length - 1, wi = chunks[ci].length - 1; if (chunks[ci][wi]) chunks[ci][wi][1] = 2; }
  return chunks;
}
const BEAT_DUR = { 0: 190, 1: 340, 2: 430 }, BEAT_GAP = 170;
function beatModel(beats) { // フォールバック用の推定モデル
  let t = 0; const centers = [];
  beats.forEach((ch, ci) => { if (ci) t += BEAT_GAP; ch.forEach(w => { const d = BEAT_DUR[w[1]]; centers.push(t + d / 2); t += d; }); });
  return { centers: centers.map(c => c / t), total: t };
}
function flatBeats(beats) { const f = []; beats.forEach(ch => ch.forEach(w => f.push(w))); return f; }
function popBeat(el) { if (!el) return; el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 240); }
function setPlayIcon(btn, name) { const i = $('.material-symbols-rounded', btn); if (i) i.textContent = name; }

/* 録音/お手本のエネルギー（RMS）包絡を作り、強い拍＝ピークを検出する */
let _decAC = null;
function decAC() { return _decAC || (_decAC = new (window.AudioContext || window.webkitAudioContext)()); }
const _analysisCache = {}, _analysisDone = {};
function getAnalysis(src) { return _analysisCache[src] || (_analysisCache[src] = analyzeAudio(src).then(an => { _analysisDone[src] = an; return an; })); }
async function analyzeAudio(src) {
  const r = await fetch(src); if (!r.ok) throw new Error('audio fetch ' + r.status);
  const buf = await r.arrayBuffer();
  const audio = await decAC().decodeAudioData(buf.slice(0));
  const data = audio.getChannelData(0), sr = audio.sampleRate, dur = audio.duration;
  const FR = 0.01, hop = Math.max(1, Math.floor(sr * FR)), n = Math.floor(data.length / hop);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) { let s = 0; const st = f * hop; for (let j = 0; j < hop && st + j < data.length; j++) { const v = data[st + j]; s += v * v; } env[f] = Math.sqrt(s / hop); }
  const sm = new Float32Array(n), K = 3;
  for (let f = 0; f < n; f++) { let s = 0, c = 0; for (let d = -K; d <= K; d++) { const i = f + d; if (i >= 0 && i < n) { s += env[i]; c++; } } sm[f] = s / c; }
  const peakLevel = Math.max(...sm, 1e-6);
  const sorted = [...sm].sort((a, b) => a - b), med = sorted[Math.floor(n / 2)] || 0;
  const thr = Math.max(peakLevel * 0.30, med * 1.8);
  const minGap = Math.round(0.14 / FR);
  const peaks = []; let lastF = -1e9;
  for (let f = 1; f < n - 1; f++) { if (sm[f] > thr && sm[f] >= sm[f - 1] && sm[f] > sm[f + 1] && (f - lastF) >= minGap) { peaks.push(f * FR); lastF = f; } }
  // 発話区間（先頭/末尾の無音を除く）— ピーク基準＋ノイズ床（中央値依存をやめ早切れを防ぐ）
  const noise = sorted[Math.floor(n * 0.15)] || 0;
  const thrV = Math.max(peakLevel * 0.08, noise + peakLevel * 0.05);
  let onF = 0; while (onF < n && sm[onF] < thrV) onF++;
  let offF = n - 1; while (offF > onF && sm[offF] < thrV) offF--;
  let onset = onF < n ? onF * FR : 0, offset = offF > onF ? (offF + 1) * FR : dur;
  if (!(offset > onset)) { onset = 0; offset = dur; }
  return { peaks, dur, peakLevel, med, frames: n, env: sm, frameDur: FR, onset, offset };
}
function energyAt(env, frameDur, t, win) {
  win = win || 0.06; let m = 0;
  const a = Math.max(0, Math.round((t - win) / frameDur)), b = Math.min(env.length - 1, Math.round((t + win) / frameDur));
  for (let i = a; i <= b; i++) if (env[i] > m) m = env[i];
  return m;
}
// 実エネルギーに合わせて各拍のドットの大きさを設定（色は役割のまま）
function sizeDotsByEnergy(stripEl, beats, an) {
  if (!stripEl || !an) return;
  const times = assignBeatTimes(beats, an);
  const dots = [...stripEl.querySelectorAll('.dot')];
  dots.forEach((dot, i) => {
    const e = energyAt(an.env, an.frameDur, times[i] || 0);
    const norm = Math.max(0, Math.min(1, e / (an.peakLevel || 1e-6)));
    const size = Math.round(8 + 24 * Math.pow(norm, 0.7));
    dot.style.width = dot.style.height = size + 'px';
  });
}
/* 各拍の時刻(秒)を作る：
   発話区間[onset,offset]にモデル比率で配置 → 強拍/核だけ近傍ピークへ微調整。
   これで全体が音声の実発話に重なり、前倒しや先頭無音のズレが起きにくい。 */
function assignBeatTimes(beats, an) {
  const flat = flatBeats(beats), N = flat.length;
  const dur = (an && an.dur) || 1;
  const onset = an && an.onset != null ? an.onset : 0;
  const offset = an && an.offset != null ? an.offset : dur;
  const span = Math.max(0.25, offset - onset);
  const centers = beatModel(beats).centers;                 // [0,1]
  const times = centers.map(c => onset + c * span);
  const peaks = (an && an.peaks) || [];
  if (peaks.length) {                                       // 強拍/核を小窓内の最寄りピークへ
    const win = Math.min(0.13, span * 0.12);
    for (let i = 0; i < N; i++) {
      if (flat[i][1] < 1) continue;
      let best = null, bd = win;
      for (const p of peaks) { const d = Math.abs(p - times[i]); if (d < bd) { bd = d; best = p; } }
      if (best != null) times[i] = best;
    }
  }
  for (let i = 1; i < N; i++) if (times[i] < times[i - 1]) times[i] = times[i - 1] + 0.02;
  return times.map(t => Math.max(0, Math.min(dur, t)));
}
function rhythmVerdict(beats, an) {
  const prom = flatBeats(beats).filter(w => w[1] >= 1).length || 1;
  const ratio = an.peaks.length / prom;
  const dynamic = an.peakLevel / Math.max(an.med, 1e-6);
  if (ratio >= 0.6 && dynamic >= 3) return { ok: true, en: "Nice — your voice has a clear strong/weak wave!", mj: "いいね 強弱の波が出ています！" };
  return { ok: false, en: "Try a bigger wave: hit the strong words harder, say weak words quick and soft.", mj: "もっと波を：内容語を強く、機能語は弱く速く。" };
}
function showVerdict(rcard, v) {
  const el2 = $('.r-verdict', rcard); if (!el2) return;
  el2.hidden = false; el2.className = 'r-verdict ' + (v.ok ? 'good' : 'work');
  const icon = v.ok ? 'check_circle' : 'graphic_eq';
  el2.innerHTML = `<span class="material-symbols-rounded rv-icon">${icon}</span><span class="rv-text">${esc(v.en)}<span class="rv-mj sub-mj">${esc(v.mj)}</span></span>`;
}
const POP_LEAD = 0.045;   // 知覚補正：エネルギー最大点より少し前で鳴らす（P-center）
function wireRhythmPlay(btn, src, beatEls, beats, isUser, rcard) {
  if (!btn) return;
  if (!src) { btn.disabled = true; return; }
  btn.onclick = () => {
    if (_waveAudio && _waveBtn === btn && !_waveAudio.paused) { _waveAudio.pause(); return; }
    stopWaveAudio();
    const a = new Audio(src); _waveAudio = a; _waveBtn = btn;
    setPlayIcon(btn, 'pause');
    const N = beatEls.length;
    const popped = new Array(N).fill(false);
    let times = _analysisDone[src] ? assignBeatTimes(beats, _analysisDone[src]) : null;  // キャッシュ済みなら即確定
    let modelTimes = null;
    getAnalysis(src).then(an => {            // 未解析なら解析完了時に確定（発話区間に合わせる）
      if (_waveAudio !== a) return;
      times = assignBeatTimes(beats, an);
      if (isUser && rcard) showVerdict(rcard, rhythmVerdict(beats, an));
    }).catch(() => {});
    const useTimes = () => {                  // 解析が間に合わない時のみ推定モデルで代用
      if (times) return times;
      if (!modelTimes) { const m = beatModel(beats); const dur = (isFinite(a.duration) && a.duration > 0) ? a.duration : m.total / 1000; modelTimes = m.centers.map(c => c * dur); }
      return modelTimes;
    };
    const loop = () => {                       // currentTimeを毎フレーム見て、来た拍だけポップ
      if (_waveAudio !== a) return;
      const t = a.currentTime, T = useTimes();
      for (let i = 0; i < N; i++) { if (!popped[i] && t >= T[i] - POP_LEAD) { popped[i] = true; popBeat(beatEls[i]); } }
      if (!a.paused && !a.ended) _rafId = requestAnimationFrame(loop);
    };
    const reset = () => { setPlayIcon(btn, 'play_arrow'); clearBeatTimers(); if (_waveAudio === a) { _waveAudio = null; _waveBtn = null; } };
    a.onended = reset; a.onpause = reset; a.onerror = reset;
    a.onplaying = () => { if (_rafId) cancelAnimationFrame(_rafId); _rafId = requestAnimationFrame(loop); };
    a.play().catch(reset);                      // iOS対策：ジェスチャ内で即再生
  };
}

/* ---- small UI ---- */
function showDemoBadge(text) { const b = $('#mode-badge'); if (b) { b.textContent = text || 'DEMO'; b.hidden = false; } }
function showScoring(wrap) { wrap.appendChild(el(`<div class="overlay scoring"><div class="spinner"></div><p>Checking your voice…</p></div>`)); }
function toast(msg) { const t = el(`<div class="toast">${esc(msg)}</div>`); document.body.appendChild(t); requestAnimationFrame(() => t.classList.add('show')); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800); }
/* ---- articulation diagram (JS生成・アニメ可) ---- */
const ARTIC_G = { INK: '#5b6573', LINE: '#9aa6b4', CORAL: '#ff6b5c', CORAL_D: '#e1503f', GUM: '#f3d9c7', GUM_E: '#e7b49a', TEE: '#ffffff', LIP: '#ff7a6c', OFF: '#c4ccd6' };
const ARTIC_UNDER = [[150, 126], [112, 132], [74, 132], [52, 129]];
const ARTIC_REST = [[52, 118], [82, 108], [114, 106], [140, 108], [156, 112]];
const ARTIC_CFG = {
  schwa: { ipa: 'ə', top: [[52, 116], [80, 102], [112, 98], [140, 102], [156, 110]], r: false, v: true },
  r: { ipa: 'ɹ', top: [[52, 114], [78, 98], [104, 84], [126, 86], [138, 94]], r: true, v: true },
  er: { ipa: 'ɝ', top: [[52, 114], [78, 98], [104, 84], [126, 86], [138, 94]], r: true, v: true },
  l: { ipa: 'l', top: [[52, 116], [80, 106], [112, 104], [138, 96], [157, 68]], r: false, v: true },
  th_voiceless: { ipa: 'θ', top: [[52, 116], [82, 104], [112, 102], [140, 98], [172, 88]], r: false, v: false },
  th_voiced: { ipa: 'ð', top: [[52, 116], [82, 104], [112, 102], [140, 98], [172, 88]], r: false, v: true },
  v: { ipa: 'v', top: [[52, 118], [82, 106], [112, 104], [140, 104], [156, 110]], r: false, v: true, lip: 'labio' },
  f: { ipa: 'f', top: [[52, 118], [82, 106], [112, 104], [140, 104], [156, 110]], r: false, v: false, lip: 'labio' },
  ae: { ipa: 'æ', top: [[52, 120], [84, 112], [116, 110], [142, 108], [156, 112]], r: false, v: true },
  w: { ipa: 'w', top: [[52, 110], [74, 84], [100, 92], [130, 102], [156, 110]], r: true, v: true },
  ng: { ipa: 'ŋ', top: [[52, 96], [72, 68], [100, 86], [130, 100], [156, 110]], r: false, v: true, nasal: true, air: false },
  sh: { ipa: 'ʃ', top: [[52, 114], [82, 100], [110, 88], [132, 78], [150, 104]], r: true, v: false },
  ih: { ipa: 'ɪ', top: [[52, 114], [82, 98], [112, 90], [138, 88], [156, 98]], r: false, v: true },
  uh: { ipa: 'ʊ', top: [[52, 108], [80, 88], [108, 92], [134, 102], [156, 110]], r: true, v: true },
};
function articCR(P) {
  const n = P.length; let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)} `;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)} `;
  }
  return d + 'Z';
}
function articTonguePath(top) { return articCR(top.concat(ARTIC_UNDER)); }
function articLerp(a, b, p) { return a.map((pt, i) => [pt[0] + (b[i][0] - pt[0]) * p, pt[1] + (b[i][1] - pt[1]) * p]); }
function articLipsRelaxed() { return `<path d="M176 70 C184 69 190 70 192 72" fill="none" stroke="${ARTIC_G.LIP}" stroke-width="7" stroke-linecap="round"/><path d="M176 104 C184 105 190 104 192 102" fill="none" stroke="${ARTIC_G.LIP}" stroke-width="7" stroke-linecap="round"/>`; }
function articLipsTarget(c) {
  if (c.lip === 'labio') return `<path d="M176 66 C184 65 190 66 192 68" fill="none" stroke="${ARTIC_G.LIP}" stroke-width="6" stroke-linecap="round"/><path d="M159 80 L190 80 C195 91 190 102 177 102 C167 102 160 93 159 84 Z" fill="${ARTIC_G.LIP}" stroke="${ARTIC_G.CORAL_D}" stroke-width="1.2"/>`;
  if (c.r) return `<circle cx="184" cy="87" r="9.5" fill="none" stroke="${ARTIC_G.LIP}" stroke-width="7"/>`;
  return articLipsRelaxed();
}
function articMarkers(c) {
  let s = '';
  if (c.air !== false) s += `<path d="M198 86 L210 86" stroke="${ARTIC_G.CORAL}" stroke-width="2.6" stroke-linecap="round"/><path d="M205 81 L210 86 L205 91" fill="none" stroke="${ARTIC_G.CORAL}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (c.nasal) s += `<path d="M120 42 C124 30 132 28 138 32" fill="none" stroke="${ARTIC_G.CORAL}" stroke-width="2.4" stroke-linecap="round"/><path d="M131 27 L135 23" stroke="${ARTIC_G.CORAL}" stroke-width="2.4" stroke-linecap="round"/>`;
  s += c.v ? `<circle cx="30" cy="126" r="5.5" fill="${ARTIC_G.CORAL}"/><circle cx="30" cy="126" r="9.5" fill="none" stroke="${ARTIC_G.CORAL}" stroke-width="1.8" opacity="0.5"/>` : `<circle cx="30" cy="126" r="5.5" fill="none" stroke="${ARTIC_G.OFF}" stroke-width="2"/>`;
  return s;
}
function articSVG(slug) {   // 目標(target)で静的描画。ただし全グループにidを付けてアニメ可
  const c = ARTIC_CFG[slug]; if (!c) return '';
  return `<svg viewBox="0 0 222 152" xmlns="http://www.w3.org/2000/svg">`
    + `<path d="M40 52 C90 40 130 44 158 56 C164 50 170 54 172 62 L172 70 C150 60 96 58 46 70 Z" fill="${ARTIC_G.GUM}" stroke="${ARTIC_G.GUM_E}" stroke-width="1.4"/>`
    + `<path d="M45 62 C36 86 38 110 50 130" fill="none" stroke="${ARTIC_G.LINE}" stroke-width="2.4" stroke-linecap="round"/>`
    + `<rect x="159" y="66" width="7.5" height="13" rx="2" fill="${ARTIC_G.TEE}" stroke="${ARTIC_G.INK}" stroke-width="1.2"/>`
    + `<path class="tongue" d="${articTonguePath(c.top)}" fill="${ARTIC_G.CORAL}" stroke="${ARTIC_G.CORAL_D}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<rect x="159" y="95" width="7.5" height="13" rx="2" fill="${ARTIC_G.TEE}" stroke="${ARTIC_G.INK}" stroke-width="1.2"/>`
    + `<path d="M50 132 C92 142 132 136 158 114" fill="none" stroke="${ARTIC_G.LINE}" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/>`
    + `<g class="lipsRelaxed" opacity="0">${articLipsRelaxed()}</g>`
    + `<g class="lipsTarget" opacity="1">${articLipsTarget(c)}</g>`
    + `<g class="markers" opacity="1">${articMarkers(c)}</g>`
    + `<text x="14" y="30" font-family="Georgia, 'Times New Roman', serif" font-size="21" font-weight="700" fill="${ARTIC_G.INK}">/${c.ipa}/</text>`
    + `</svg>`;
}
// 中立→その音の形へ動かし、tip全文を音声合成で読み上げる簡易プレイヤー
function makeArticPlayer(svgEl, slug, text) {
  const c = ARTIC_CFG[slug];
  const tongue = svgEl.querySelector('.tongue'), lipsR = svgEl.querySelector('.lipsRelaxed'), lipsT = svgEl.querySelector('.lipsTarget'), markers = svgEl.querySelector('.markers');
  const ease = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const CYCLE = 1700; let raf = 0, mode = 'idle', t0 = 0, lastP = 1, settleFrom = 1, settleT0 = 0, onDone = null;
  function setP(p) { lastP = p; tongue.setAttribute('d', articTonguePath(articLerp(ARTIC_REST, c.top, p))); if (lipsR) lipsR.setAttribute('opacity', (1 - p).toFixed(3)); if (lipsT) lipsT.setAttribute('opacity', p.toFixed(3)); if (markers) markers.setAttribute('opacity', p.toFixed(3)); }
  function frame(now) {
    if (mode === 'loop') { const ph = ((now - t0) % CYCLE) / CYCLE; setP(ph < 0.5 ? ease(ph * 2) : ease((1 - ph) * 2)); raf = requestAnimationFrame(frame); }
    else if (mode === 'settle') { const e = Math.min(1, (now - settleT0) / 450); setP(settleFrom + (1 - settleFrom) * ease(e)); if (e < 1) raf = requestAnimationFrame(frame); else { mode = 'idle'; if (onDone) { const cb = onDone; onDone = null; cb(); } } }
  }
  function stopRaf() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function settle(cb) { stopRaf(); settleFrom = lastP; settleT0 = performance.now(); mode = 'settle'; onDone = cb || null; raf = requestAnimationFrame(frame); }
  function stop() { stopRaf(); mode = 'idle'; try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} }
  function play(btn) {
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
    setP(0); stopRaf(); mode = 'loop'; t0 = performance.now(); raf = requestAnimationFrame(frame);
    if (btn) setPlayIcon(btn, 'graphic_eq');
    const finish = () => settle(() => { if (btn) setPlayIcon(btn, 'play_arrow'); });
    if (window.speechSynthesis && text) {
      const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.92;
      const vs = speechSynthesis.getVoices() || []; const v = vs.find(x => /^en[-_]/i.test(x.lang)); if (v) u.voice = v;
      u.onend = finish; u.onerror = finish;
      try { speechSynthesis.speak(u); } catch (e) { setTimeout(finish, 1700); }
    } else setTimeout(finish, 1700);
  }
  return { play, stop };
}
function openLightbox(slug, ipa, en, mj) {
  const svg = ARTIC_CFG[slug] ? articSVG(slug) : '';
  const ipaHtml = ipa ? `<div class="lb-cap">/${esc(ipa)}/</div>` : '';
  const txt = (en || mj) ? `<div class="lb-text">${en ? `<p class="lb-en">${esc(en)}</p>` : ''}${mj ? `<p class="lb-mj">${esc(mj)}</p>` : ''}</div>` : '';
  const playBtn = (svg && (window.speechSynthesis || true)) ? `<button class="lb-play"><span class="material-symbols-rounded">play_arrow</span><span>Watch &amp; listen</span></button>` : '';
  const ov = el(`<div class="lightbox"><div class="lb-inner"><div class="lb-stage">${svg}</div>${playBtn}${ipaHtml}${txt}<button class="lb-close" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div></div>`);
  let player = null;
  const svgEl = $('.lb-stage svg', ov);
  if (svgEl && ARTIC_CFG[slug]) {
    player = makeArticPlayer(svgEl, slug, en || '');
    const pb = $('.lb-play', ov);
    if (pb) pb.onclick = (e) => { e.stopPropagation(); player.play(pb); };
  }
  $('.lb-inner', ov).onclick = e => e.stopPropagation();
  const close = () => { if (player) player.stop(); ov.classList.remove('show'); setTimeout(() => ov.remove(), 200); };
  ov.onclick = close; const cb = $('.lb-close', ov); if (cb) cb.onclick = (e) => { e.stopPropagation(); close(); };
  document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('show'));
}

/* ---- boot ---- */
sfx.init(); bgmInit();
if (C.DEMO_MODE) showDemoBadge('DEMO');
$('#btn-back').onclick = navBack;
$('#set-bgm').onclick = () => bgmSet(!bgm.on);
$('#set-cc').onclick = () => setSubtitle(!SUB);
$('#btn-settings').onclick = (e) => { e.stopPropagation(); $('#settings-panel').hidden = !$('#settings-panel').hidden; };
document.addEventListener('click', e => {
  if (e.target.closest('button')) sfx.play('tap');
  if (!e.target.closest('#settings-panel') && !e.target.closest('#btn-settings')) $('#settings-panel').hidden = true;
});
window.addEventListener('pointerdown', function once() { if (bgm.on && !bgm.ducked) bgm.audio.play().catch(() => {}); window.removeEventListener('pointerdown', once); });
document.body.classList.toggle('subtitle-on', SUB);
if (window.speechSynthesis) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = function () {}; } catch (e) {} }
updateControls(); updateBack();
renderTitle();
