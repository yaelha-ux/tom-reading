const $ = (id) => document.getElementById(id);
const STORE_KEY = 'tom-reading-v1';

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
// רק האלבום נשמר לתמיד; ההתקדמות בשלבים נשמרת בזיכרון ומתאפסת ברענון הטאב
const state = { collected: loadState().collected || {} };
const passageIndex = {};
// לכל שלב: איפה עצרנו (session + current), כדי לחזור לשם אחרי מסך הבית
const saved = {};
const finishedLevels = {};

let current = null; // { level, passage, index }

function show(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(screenId).classList.add('active');
}

// ---------- בית ----------
function renderHome() {
  $('levels').innerHTML = '';
  LEVELS.forEach((level) => {
    const b = document.createElement('button');
    b.className = 'level-btn';
    b.style.background = level.color;
    const s = saved[level.id];
    const sub = finishedLevels[level.id] && !s ? '✓ סִיַּמְתָּ'
      : s ? `נִשְׁאַר ${formatTime(s.session.remaining)}` : `${level.minutes} דַּקּוֹת`;
    b.innerHTML = `${level.name}<small>${sub}</small>`;
    b.onclick = () => startLevel(level);
    $('levels').appendChild(b);
  });

  $('album').innerHTML = '';
  CHARACTERS.forEach((c) => {
    const n = state.collected[c.id] || 0;
    const slot = document.createElement('div');
    slot.className = 'album-slot' + (n ? '' : ' locked');
    slot.style.background = n ? c.bg : '#eee';
    slot.innerHTML = `<img src="${c.img}" alt="">${n ? c.name : '?'}${n > 1 ? `<span class="count">×${n}</span>` : ''}`;
    $('album').appendChild(slot);
  });
  show('home');
}

// איפוס אלבום מוסתר להורים: לחיצה ארוכה (2 שניות) על כותרת האלבום ואז קוד
const PARENT_CODE = '2209';
let resetTimer;
const albumTitle = $('albumTitle');
albumTitle.addEventListener('pointerdown', () => {
  resetTimer = setTimeout(() => {
    const code = prompt('קוד הורים:');
    if (code === null) return;
    if (code.trim() !== PARENT_CODE) { alert('קוד שגוי'); return; }
    if (!confirm('לאפס את האלבום? כל הדמויות שנאספו יימחקו.')) return;
    state.collected = {};
    saveState();
    renderHome();
  }, 2000);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
  albumTitle.addEventListener(ev, () => clearTimeout(resetTimer))
);
albumTitle.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- קריאה ----------
// session: אימון אחד לפי זמן הרמה; כשקטע נגמר והזמן עוד לא, ממשיכים לקטע הבא
let session = null;

function startLevel(level) {
  const s = saved[level.id];
  if (s) {
    // ממשיכים מאיפה שעצרנו
    ({ session, current } = s);
    updateTimer();
    speechWarmup();
    renderSentence();
    show('reader');
    return;
  }
  session = { total: level.minutes * 60, remaining: level.minutes * 60, timeUp: false };
  updateTimer();
  speechWarmup();
  nextPassage(level);
}

function nextPassage(level) {
  // מתחלפים בין הקטעים של כל רמה
  const i = (passageIndex[level.id] || 0) % level.passages.length;
  passageIndex[level.id] = i + 1;
  current = { level, passage: level.passages[i], index: 0 };
  saved[level.id] = { session, current };
  renderSentence();
  show('reader');
}

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateTimer() {
  const { remaining, total, timeUp } = session;
  $('timerText').textContent = timeUp ? '✓' : formatTime(remaining);
  $('timerLabel').textContent = timeUp ? 'סִיַּמְתָּ!' : 'נִשְׁאַר';
  $('timerRing').style.strokeDashoffset = 276.5 * (1 - remaining / total);
  $('timer').classList.toggle('low', !timeUp && remaining <= 60);
  $('timer').classList.toggle('done', timeUp);
}

// הזמן רץ רק כשתום במסך הקריאה והמסך פתוח
setInterval(() => {
  if (!session || session.timeUp || document.hidden) return;
  if (!$('reader').classList.contains('active') || $('celebrate').classList.contains('show')) return;
  session.remaining--;
  if (session.remaining <= 0) { session.remaining = 0; session.timeUp = true; }
  updateTimer();
}, 1000);

function renderSentence() {
  const { level, passage, index } = current;
  // כל מילה ב-span כדי לצבוע מילים שזוהו במיקרופון
  $('sentence').innerHTML = passage.sentences[index].split(' ').map((w) => `<span class="w">${w}</span>`).join(' ');
  $('micMsg').textContent = '';
  $('story').classList.toggle('hidden', !level.storyMode);
  if (level.storyMode) {
    $('storyTitle').textContent = passage.title;
    $('storyText').innerHTML = passage.sentences.slice(0, index)
      .map((s, i) => `<span${i === index - 1 ? ' class="fresh"' : ''}>${s} </span>`).join('');
    $('story').scrollTop = $('story').scrollHeight;
  }
  $('medals').innerHTML = passage.sentences
    .map((_, i) => (i < index ? '<span>🥇</span>' : `<span class="dot${i === index ? ' now' : ''}"></span>`))
    .join('');
}


function markRead() {
  const { passage } = current;
  current.index++;
  // נגמר הזמן? מסיימים במשפט הזה ומקבלים גביע
  const finished = current.index >= passage.sentences.length || session.timeUp;
  const text = session.timeUp ? 'סִיַּמְתָּ אֶת הָאִמּוּן!' : finished ? 'סִיַּמְתָּ אֶת הַקֶּטַע!' : 'יָפֶה מְאוֹד!';
  celebrate(finished ? '🏆' : '🥇', text, () => {
    if (finished) startScratch();
    else {
      renderSentence();
      if (autoListen && Recognition) startListening();
    }
  });
}

// ---------- בדיקה במיקרופון (ניסיונית; דורשת אינטרנט) ----------
// הזיהוי מחזיר טקסט בלי ניקוד, אז משווים מילים בלבד ובסלחנות.
// אותיות סופיות הופכות לרגילות, כי "אַמְ" נשמע כמו "אם"
const plain = (s) => s.replace(/[֑-ׇ]/g, '').replace(/[^א-ת ]/g, ' ')
  .replace(/[ךםןףץ]/g, (c) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }[c])).trim().split(/\s+/).filter(Boolean);

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// מחזיר לכל מילה במשפט אם נשמעה באחת מהאפשרויות שהזיהוי החזיר
function matchWords(sentence, transcripts) {
  const heard = transcripts.flatMap(plain);
  // כתיב מלא/חסר: "עכשו" מול "עכשיו", לכן מתעלמים מ-ו/י בהשוואה
  const loose = (w) => w.replace(/[וי]/g, '');
  // הברה של אות אחת ("בַּ"): הזיהוי מחזיר משהו כמו "בא" או "בה", אז מספיק שהמילה הקצרה תתחיל באותו צליל
  const sound = (c) => ({ ק: 'כ', ט: 'ת', ע: 'א', ש: 'ס' }[c] || c);
  return plain(sentence).map((w) =>
    heard.some((h) => h === w || loose(h) === loose(w) || (w.length > 2 && editDistance(loose(h), loose(w)) <= 1)
      || (w.length === 1 && h.length <= 3 && sound(h[0]) === sound(w)))
  );
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
// אחרי קריאה מוצלחת במיקרופון, המשפט הבא מתחיל להקשיב לבד
let listening = false, autoListen = false;
const MIC_LABEL = '🎤 קְרָא בְּקוֹל';
// לחיצה ראשונה מתחילה להקשיב; אחרי 3 שניות הכפתור הופך ל"סִיַּמְתִּי" ולחיצה עליו בודקת
$('micBtn').onclick = () => (listening ? stopListening() : startListening());

let rec = null, doneTimer;
function resetMicBtn() {
  clearTimeout(doneTimer);
  $('micBtn').textContent = MIC_LABEL;
  $('micBtn').classList.remove('listening', 'done-mode');
}
// עוצרים בלי לבדוק (יציאה לבית / "הבא" של ההורים)
function cancelListening() {
  if (!rec || !listening) return;
  rec.onend = () => { listening = false; resetMicBtn(); };
  rec.abort();
}
function stopListening() {
  if ($('micBtn').classList.contains('done-mode') && rec) rec.stop();
}

function startListening() {
  if (!Recognition) { $('micMsg').textContent = 'הַדַּפְדְּפָן לֹא תּוֹמֵךְ בְּמִיקְרוֹפוֹן'; return; }
  if (listening) return;
  rec = new Recognition();
  rec.lang = 'he-IL';
  rec.maxAlternatives = 5;
  rec.interimResults = false;
  rec.continuous = true; // ממשיכים להקשיב עד שתום לוחץ "סִיַּמְתִּי"
  listening = true;
  let heard = [], failed = false;
  $('micBtn').classList.add('listening');
  $('micMsg').textContent = 'מַקְשִׁיבָה... 👂';
  doneTimer = setTimeout(() => {
    $('micBtn').classList.add('done-mode');
    $('micBtn').textContent = '✅ סִיַּמְתִּי';
  }, 3000);

  rec.onresult = (e) => {
    // כל קטע שנשמע מוסיף אפשרויות; מחברים את כולן בסוף
    for (let i = e.resultIndex; i < e.results.length; i++)
      heard.push(...Array.from(e.results[i]).map((r) => r.transcript));
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    failed = true;
    autoListen = false;
    $('micMsg').textContent = e.error === 'not-allowed' ? 'צָרִיךְ לְאַשֵּׁר מִיקְרוֹפוֹן' :
      e.error === 'network' ? 'אֵין אִינְטֶרְנֶט' : 'לֹא שָׁמַעְתִּי, נְנַסֶּה שׁוּב?';
  };
  rec.onend = () => {
    listening = false;
    resetMicBtn();
    if (failed) return;
    if (!heard.length) { autoListen = false; $('micMsg').textContent = 'לֹא שָׁמַעְתִּי, נְנַסֶּה שׁוּב?'; return; }
    // גם כל מה שנשמע ברצף, למקרה שהמשפט התפצל לכמה קטעים
    const sentence = current.passage.sentences[current.index];
    const ok = matchWords(sentence, [...heard, heard.join(' ')]);
    // צובעים כל מילה לפי הזיהוי (מדלגים על סימני פיסוק נפרדים)
    const spans = [...$('sentence').querySelectorAll('.w')].filter((s) => plain(s.textContent).length);
    spans.forEach((s, i) => s.classList.add(ok[i] ? 'ok' : 'miss'));
    const score = ok.filter(Boolean).length / ok.length;
    if (score >= 0.6) {
      $('micMsg').textContent = 'קָרָאתָ נָכוֹן! 🎉';
      autoListen = true;
      setTimeout(markRead, 900);
    } else {
      autoListen = false;
      sadBear();
    }
  };
  rec.start();
}

// "הַבָּא" להורים בלבד: חץ קטן וחיוור בפינה השמאלית העליונה, צריך להחזיק שנייה
let nextTimer;
const parentNext = $('parentNext');
parentNext.addEventListener('pointerdown', () => { nextTimer = setTimeout(() => { cancelListening(); autoListen = false; markRead(); }, 1000); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => parentNext.addEventListener(ev, () => clearTimeout(nextTimer)));
parentNext.addEventListener('contextmenu', (e) => e.preventDefault());

$('homeBtn').onclick = () => { autoListen = false; cancelListening(); renderHome(); };

function celebrate(icon, text, then) {
  $('celebrateIcon').textContent = icon;
  $('celebrateText').textContent = text;
  // מפעיל מחדש את האנימציה
  const el = $('celebrateIcon');
  el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
  $('celebrate').classList.add('show');
  confetti(icon === '🏆' ? 80 : 25);
  playChime(icon === '🏆');
  setTimeout(() => { $('celebrate').classList.remove('show'); then(); }, icon === '🏆' ? 2200 : 1300);
}

// דוב עצוב מצויר: גבות מורמות באמצע, עיניים עצומות כלפי מטה, פה עצוב ודמעות
const SAD_BEAR_SVG = `
<svg class="sad-bear" viewBox="0 0 240 240" fill="#fff" stroke="#1a1a1a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="58" cy="62" r="30"/><circle cx="58" cy="62" r="14" fill="#f6d2c2"/>
  <circle cx="182" cy="62" r="30"/><circle cx="182" cy="62" r="14" fill="#f6d2c2"/>
  <ellipse cx="120" cy="128" rx="92" ry="86"/>
  <path d="M70 92 L100 82" /><path d="M170 92 L140 82"/>
  <path d="M76 116 Q90 106 104 116" fill="none"/><path d="M136 116 Q150 106 164 116" fill="none"/>
  <ellipse cx="120" cy="164" rx="40" ry="32"/>
  <ellipse cx="120" cy="150" rx="13" ry="9" fill="#1a1a1a"/>
  <path d="M100 186 Q120 168 140 186" fill="none"/>
  <ellipse cx="68" cy="146" rx="12" ry="7" fill="#f9b3b3" stroke="none"/>
  <ellipse cx="172" cy="146" rx="12" ry="7" fill="#f9b3b3" stroke="none"/>
  <path class="tear" d="M90 122 q-7 12 0 16 q7 -4 0 -16z" fill="#4fc3f7" stroke="#2a9fd0" stroke-width="3"/>
  <path class="tear t2" d="M150 122 q-7 12 0 16 q7 -4 0 -16z" fill="#4fc3f7" stroke="#2a9fd0" stroke-width="3"/>
</svg>`;

// קריאה בקול לא הצליחה: דוב בוכה וצליל עצוב, ואז חוזרים לאותו משפט
function sadBear() {
  $('celebrateIcon').innerHTML = SAD_BEAR_SVG;
  $('celebrateText').textContent = 'בּוֹא נְנַסֶּה שׁוּב 💪';
  $('celebrate').classList.add('show');
  playSad();
  setTimeout(() => {
    $('celebrate').classList.remove('show');
    $('micMsg').textContent = 'בּוֹא נְנַסֶּה שׁוּב 💪';
  }, 2200);
}

function playSad() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [392, 349, 311, 262].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine';
      const t = audioCtx.currentTime + i * 0.3;
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 0.94, t + 0.3);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.45);
    });
  } catch {}
}

function confetti(count) {
  const colors = ['#ff6b9a', '#ffd84a', '#58cc02', '#4fc3f7', '#ffb347'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1 + Math.random() * 1.5 + 's';
    c.style.animationDelay = Math.random() * 0.3 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }
}

let audioCtx;
function playChime(big) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = big ? [523, 659, 784, 1047] : [659, 988];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = 'triangle';
      const t = audioCtx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.4);
    });
  } catch {}
}

// ---------- השמעה מוסתרת (לחיצה ארוכה 1.5 שניות) ----------
let hebrewVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  // באנדרואיד עברית מופיעה לפעמים כקוד הישן iw
  hebrewVoice = voices.find((v) => v.lang && /^(he|iw)/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
// בטאבלטים צריך נגיעה ראשונה לפני שהקול עובד
function speechWarmup() {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'he-IL';
  if (hebrewVoice) u.voice = hebrewVoice;
  u.rate = 0.75;
  speechSynthesis.speak(u);
}

// כפתור השמעה ליד "קרא בקול"
$('listenBtn').onclick = () => speak(current.passage.sentences[current.index]);

// ---------- כרטיס גירוד ----------
function pickPrize() {
  // מעדיפים דמות שעוד לא נאספה
  const missing = CHARACTERS.filter((c) => !state.collected[c.id]);
  const pool = missing.length ? missing : CHARACTERS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function startScratch() {
  const prize = pickPrize();
  $('prizeImg').src = prize.img;
  $('prizeName').textContent = prize.name;
  $('cardPrize').style.background = prize.bg;
  $('doneBtn').classList.add('hidden');
  $('doneBtn').textContent = session.timeUp ? 'לְאַלְבּוֹם' : 'לַקֶּטַע הַבָּא ←';
  show('scratch');

  const canvas = $('cardCanvas');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const grad = ctx.createLinearGradient(0, 0, rect.width, rect.height);
  grad.addColorStop(0, '#c0c0c0'); grad.addColorStop(0.5, '#e8e8e8'); grad.addColorStop(1, '#a8a8a8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#888';
  ctx.font = 'bold 34px "Noto Sans Hebrew", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('גָּרֵד כָּאן ✨', rect.width / 2, rect.height / 2);

  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 50; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  let drawing = false, last = null, revealed = false;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.onpointerdown = (e) => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); scratchAt(last, last); };
  canvas.onpointermove = (e) => { if (!drawing) return; const p = pos(e); scratchAt(last, p); last = p; };
  canvas.onpointerup = canvas.onpointercancel = () => { drawing = false; checkReveal(); };

  function scratchAt(a, b) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function checkReveal() {
    if (revealed) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0, total = 0;
    for (let i = 3; i < data.length; i += 64) { total++; if (data[i] === 0) clear++; }
    if (clear / total > 0.5) {
      revealed = true;
      canvas.style.transition = 'opacity .6s'; canvas.style.opacity = 0;
      state.collected[prize.id] = (state.collected[prize.id] || 0) + 1;
      saveState();
      confetti(60); playChime(true);
      $('doneBtn').classList.remove('hidden');
    }
  }
  canvas.style.transition = ''; canvas.style.opacity = 1;
}

$('doneBtn').onclick = () => {
  if (session.timeUp) {
    delete saved[current.level.id];
    finishedLevels[current.level.id] = true;
    session = null;
    renderHome();
  }
  else nextPassage(current.level);
};

renderHome();

// מספר הגרסה מוצג בתחתית מסך הבית; להעלות יחד עם CACHE ב-sw.js
const APP_VERSION = 24;
$('version').textContent = 'גרסה ' + APP_VERSION;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // בודקים אם יש גרסה חדשה בכל פעם שחוזרים לאפליקציה (הטאבלט משאיר אותה פתוחה ברקע)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
  }).catch(() => {});
  // גרסה חדשה השתלטה: טוענים מחדש פעם אחת, רק כשלא באמצע קריאה
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    // לא טוענים מחדש אם יש התקדמות שתימחק; הגרסה החדשה תגיע ברענון הבא
    if (Object.keys(saved).length) return;
    if ($('home').classList.contains('active')) location.reload();
    else $('homeBtn').addEventListener('click', () => location.reload(), { once: true });
  });
}
