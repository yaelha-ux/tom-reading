const $ = (id) => document.getElementById(id);
const STORE_KEY = 'tom-reading-v1';

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
const state = Object.assign({ collected: {}, passageIndex: {} }, loadState());

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
    b.innerHTML = `${level.name}<small>${level.minutes} דַּקּוֹת</small>`;
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

// ---------- קריאה ----------
// session: אימון אחד לפי זמן הרמה; כשקטע נגמר והזמן עוד לא, ממשיכים לקטע הבא
let session = null;

function startLevel(level) {
  session = { total: level.minutes * 60, remaining: level.minutes * 60, timeUp: false };
  updateTimer();
  speechWarmup();
  nextPassage(level);
}

function nextPassage(level) {
  // מתחלפים בין הקטעים של כל רמה
  const i = (state.passageIndex[level.id] || 0) % level.passages.length;
  state.passageIndex[level.id] = i + 1;
  saveState();
  current = { level, passage: level.passages[i], index: 0 };
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

$('readBtn').onclick = () => markRead();

function markRead() {
  const { passage } = current;
  current.index++;
  // נגמר הזמן? מסיימים במשפט הזה ומקבלים גביע
  const finished = current.index >= passage.sentences.length || session.timeUp;
  const text = session.timeUp ? 'סִיַּמְתָּ אֶת הָאִמּוּן!' : finished ? 'סִיַּמְתָּ אֶת הַקֶּטַע!' : 'יָפֶה מְאוֹד!';
  celebrate(finished ? '🏆' : '🥇', text, () => {
    if (finished) startScratch();
    else renderSentence();
  });
}

// ---------- בדיקה במיקרופון (ניסיונית; דורשת אינטרנט) ----------
// הזיהוי מחזיר טקסט בלי ניקוד, אז משווים מילים בלבד ובסלחנות.
const plain = (s) => s.replace(/[֑-ׇ]/g, '').replace(/[^א-ת ]/g, ' ').trim().split(/\s+/).filter(Boolean);

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
  return plain(sentence).map((w) =>
    heard.some((h) => h === w || loose(h) === loose(w) || (w.length > 2 && editDistance(loose(h), loose(w)) <= 1))
  );
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) $('micBtn').classList.remove('hidden');

let listening = false;
$('micBtn').onclick = () => {
  if (listening) return;
  const rec = new Recognition();
  rec.lang = 'he-IL';
  rec.maxAlternatives = 5;
  rec.interimResults = false;
  listening = true;
  $('micBtn').classList.add('listening');
  $('micMsg').textContent = 'מַקְשִׁיבָה... 👂';

  rec.onresult = (e) => {
    const transcripts = Array.from(e.results[0]).map((r) => r.transcript);
    const sentence = current.passage.sentences[current.index];
    const ok = matchWords(sentence, transcripts);
    // צובעים כל מילה לפי הזיהוי (מדלגים על סימני פיסוק נפרדים)
    const spans = [...$('sentence').querySelectorAll('.w')].filter((s) => plain(s.textContent).length);
    spans.forEach((s, i) => s.classList.add(ok[i] ? 'ok' : 'miss'));
    const score = ok.filter(Boolean).length / ok.length;
    if (score >= 0.6) {
      $('micMsg').textContent = 'קָרָאתָ נָכוֹן! 🎉';
      setTimeout(markRead, 900);
    } else {
      $('micMsg').textContent = 'בּוֹא נְנַסֶּה שׁוּב 💪';
    }
  };
  rec.onerror = (e) => {
    $('micMsg').textContent = e.error === 'not-allowed' ? 'צָרִיךְ לְאַשֵּׁר מִיקְרוֹפוֹן' :
      e.error === 'network' ? 'אֵין אִינְטֶרְנֶט, לְחַץ "קָרָאתִי!"' : 'לֹא שָׁמַעְתִּי, נְנַסֶּה שׁוּב?';
  };
  rec.onend = () => { listening = false; $('micBtn').classList.remove('listening'); };
  rec.start();
};

$('homeBtn').onclick = () => { session = null; renderHome(); };

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

let holdTimer;
const listenBtn = $('listenBtn');
listenBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  listenBtn.classList.add('holding');
  holdTimer = setTimeout(() => {
    listenBtn.classList.remove('holding');
    speak(current.passage.sentences[current.index]);
  }, 1500);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
  listenBtn.addEventListener(ev, () => { clearTimeout(holdTimer); listenBtn.classList.remove('holding'); })
);
listenBtn.addEventListener('contextmenu', (e) => e.preventDefault());

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
  if (session.timeUp) { session = null; renderHome(); }
  else nextPassage(current.level);
};

renderHome();

// כפתור התקנה: Chrome שולח beforeinstallprompt כשאפשר להתקין
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
$('installBtn').onclick = async () => {
  if (installPrompt) {
    try {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      return;
    } catch {}
  }
  // אין חלון התקנה מ-Chrome: מציגים הוראות באמצע המסך
  alert(
    'כדי להתקין:\n' +
    '1. ודאו שהדף פתוח בדפדפן Chrome (לא מתוך וואטסאפ או מייל).\n' +
    '2. לחצו על ⋮ (שלוש נקודות) למעלה.\n' +
    '3. בחרו "הוספה למסך הבית" או "התקנת אפליקציה".\n\n' +
    'בדפדפן סמסונג: ☰ ← "הוסף דף אל" ← "מסך הבית".'
  );
};
const installed = () => window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
if (installed()) $('installBtn').classList.add('hidden');
window.addEventListener('appinstalled', () => $('installBtn').classList.add('hidden'));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
