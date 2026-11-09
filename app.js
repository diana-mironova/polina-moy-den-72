'use strict';
// «Мой день» — мини-приложение Telegram Полины.
// Привычки, отметки, фокус, победа дня, подписчики, заказы и доход хранятся в Telegram CloudStorage.
// Вне Telegram (просмотр в браузере) те же данные лежат в localStorage этого браузера.
// Задачи приходят из закрытого репозитория GitHub, план и идеи из content.json рядом с приложением.

const tg = window.Telegram && window.Telegram.WebApp;
const IN_TG = !!(tg && tg.initData);

const NAME = 'Полина';
const GOAL_INCOME = 150000;
const GOAL_FOLLOWERS = 10000;
const MAX_HABITS = 5;

const COLORS = { pink: '#FF2D78', orange: '#FF9500', yellow: '#FFC400', green: '#30D158', mint: '#00C7BE',
  teal: '#32ADE6', blue: '#0A84FF', indigo: '#5E5CE6', purple: '#BF5AF2', red: '#FF3B30' };
const ICONS = ['📸', '📵', '🚶‍♀️', '💧', '🧘‍♀️', '📚', '🏃‍♀️', '🥗', '😴', '✍️', '🎨', '🌿', '💪', '☀️', '🍎', '🎧'];
const DEFAULT_HABITS = [
  { id: 'h1', name: 'Сторис утром', icon: '📸', color: 'pink' },
  { id: 'h2', name: '2 часа без телефона', icon: '📵', color: 'purple' },
  { id: 'h3', name: 'Прогулка 30 минут', icon: '🚶‍♀️', color: 'green' },
  { id: 'h4', name: 'Вода 2 литра', icon: '💧', color: 'blue' },
];
const TSTAT = { todo: ['нужно сделать', '#8E8E93'], doing: ['в работе', '#0A84FF'], wait: ['жду ответа', '#FF9500'], done: ['готово', '#30D158'] };
const TORDER = ['todo', 'doing', 'wait', 'done'];
const CSTAT = { 'идея': '#FF9500', 'сценарий': '#0A84FF', 'снято': '#BF5AF2', 'вышло': '#30D158' };
const CORDER = ['идея', 'сценарий', 'снято', 'вышло'];
const FORMATS = { 'Рилс': ['🎬', '#FF2D78'], 'Карусель': ['🖼️', '#BF5AF2'], 'Пост': ['✍️', '#0A84FF'], 'Сторис': ['📱', '#FF9500'] };
const OSTAT = { 'в работе': '#0A84FF', 'сдано': '#FF9500', 'оплачено': '#30D158' };
const OORDER = ['в работе', 'сдано', 'оплачено'];
const PROJ_COLORS = ['#5E5CE6', '#FF2D78', '#00C7BE', '#FF9500', '#BF5AF2', '#32ADE6', '#30D158', '#FF3B30'];

/* ---------- даты и форматы ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const diffDays = (a, b) => Math.round((parseD(a) - parseD(b)) / 864e5);
const weekStart = s => { const d = parseD(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
const fmt = (s, o) => new Intl.DateTimeFormat('ru-RU', o).format(parseD(s));
const dayLabel = s => {
  const k = diffDays(s, today());
  if (k === 0) return 'сегодня';
  if (k === 1) return 'завтра';
  if (k === -1) return 'вчера';
  return fmt(s, { weekday: 'short', day: 'numeric', month: 'long' });
};
const shortDate = s => fmt(s, { day: 'numeric', month: 'short' }).replace('.', '');
const rub = n => Math.round(n || 0).toLocaleString('ru-RU') + ' ₽';
const num = n => Math.round(n || 0).toLocaleString('ru-RU');
const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return f[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2]; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const hashColor = s => { let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) >>> 0; return PROJ_COLORS[h % PROJ_COLORS.length]; };
const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- хранилище: Telegram CloudStorage или localStorage ---------- */
const store = (() => {
  const CHUNK = 3800; // CloudStorage принимает до 4096 знаков на ключ, длинное режем на куски
  const cloud = !!(IN_TG && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9'));
  const ls = {
    get: k => { try { return localStorage.getItem('md_' + k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem('md_' + k, v); } catch {} },
    del: k => { try { localStorage.removeItem('md_' + k); } catch {} },
  };
  const getRaw = keys => cloud
    ? new Promise(res => tg.CloudStorage.getItems(keys, (e, v) => res(e ? {} : v || {})))
    : Promise.resolve(Object.fromEntries(keys.map(k => [k, ls.get(k)])));
  const setRaw = (k, v) => cloud ? new Promise(res => tg.CloudStorage.setItem(k, v, () => res())) : (ls.set(k, v), Promise.resolve());
  const delRaw = keys => cloud ? new Promise(res => tg.CloudStorage.removeItems(keys, () => res())) : (keys.forEach(ls.del), Promise.resolve());
  const parts = {};
  const range = (k, from, to) => Array.from({ length: to - from }, (_, i) => `${k}_${from + i}`);

  async function load(keys) {
    const first = await getRaw(keys), out = {};
    for (const k of keys) {
      let v = first[k];
      if (v && v[0] === '~') {
        const n = +v.slice(1); parts[k] = n;
        const got = await getRaw(range(k, 0, n));
        v = range(k, 0, n).map(x => got[x] || '').join('');
      }
      try { out[k] = v ? JSON.parse(v) : undefined; } catch { out[k] = undefined; }
    }
    return out;
  }
  async function save(k, data) {
    const s = JSON.stringify(data), old = parts[k] || 0;
    if (s.length <= CHUNK) {
      await setRaw(k, s); parts[k] = 0;
      if (old) await delRaw(range(k, 0, old));
    } else {
      const n = Math.ceil(s.length / CHUNK);
      for (let i = 0; i < n; i++) await setRaw(`${k}_${i}`, s.slice(i * CHUNK, (i + 1) * CHUNK));
      await setRaw(k, '~' + n); parts[k] = n;
      if (old > n) await delRaw(range(k, n, old));
    }
  }
  const timers = {};
  const saveSoon = (k, data) => { clearTimeout(timers[k]); timers[k] = setTimeout(() => save(k, data), 300); };
  return { load, save, saveSoon, cloud, local: ls };
})();

/* ---------- состояние ---------- */
const S = {
  habits: [], marks: {}, focus: {}, wins: {}, followers: [], orders: [], income: [],
  plan: { status: {}, added: [], moved: [] },
  tasks: [], tasksMd: '', remote: null, ghToken: '', tasksMode: 'none', tasksError: '', tasksLoaded: 0, pending: 0,
  content: { weeks: [], ideas: [] }, contentError: false,
  tab: 'today', taskFilter: 'all', showDone: false,
};
const CLOUD_KEYS = ['habits', 'marks', 'focus', 'wins', 'followers', 'orders', 'income', 'plan'];
const persist = k => store.saveSoon(k, S[k]);

/* ---------- Telegram: тема, вибрация, подтверждение ---------- */
function applyTheme() {
  const q = new URLSearchParams(location.search).get('theme');
  const dark = IN_TG ? tg.colorScheme === 'dark' : q ? q === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (IN_TG) {
    const bg = dark ? '#000000' : '#F2F2F7';
    try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); tg.setBottomBarColor && tg.setBottomBarColor(bg); } catch {}
  }
}
function haptic(kind = 'light') {
  try {
    if (IN_TG && tg.HapticFeedback) {
      if (['success', 'warning', 'error'].includes(kind)) tg.HapticFeedback.notificationOccurred(kind);
      else if (kind === 'select') tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.impactOccurred(kind);
    } else if (navigator.vibrate) navigator.vibrate(kind === 'success' ? [20, 40, 30] : 12);
  } catch {}
}
const ask = msg => new Promise(res => (IN_TG && tg.showConfirm) ? tg.showConfirm(msg, ok => res(!!ok)) : res(window.confirm(msg)));
function toast(text) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.remove(), 1900);
}

/* ---------- привычки ---------- */
const hColor = h => COLORS[h.color] || h.color || COLORS.blue;

// Прошлая версия приложения хранила в Telegram значок названием (camera, walk…) и цвет кодом (#FF2D78).
// Переводим такие записи в эмодзи и названия цветов, незнакомый значок заменяем первым свободным.
const OLD_ICONS = { camera: '📸', phoneOff: '📵', walk: '🚶‍♀️', drop: '💧', book: '📚', dumbbell: '💪', moon: '😴',
  sun: '☀️', heart: '🧘‍♀️', pencil: '✍️', coffee: '🥗', leaf: '🌿', music: '🎧', apple: '🍎', bed: '😴', brush: '🎨', sparkle: '☀️' };
const OLD_COLORS = { '#FF2D78': 'pink', '#FF3B30': 'red', '#FF8A00': 'orange', '#FFC400': 'yellow', '#22C55E': 'green',
  '#00C2B2': 'mint', '#19B5FE': 'teal', '#2F6BFF': 'blue', '#5B4BFF': 'indigo', '#B44CFF': 'purple' };
function fixOldHabits() {
  let changed = false;
  const out = [];
  for (const h of S.habits || []) {
    const x = { ...h };
    if (!ICONS.includes(x.icon)) {
      const used = out.map(o => o.icon).concat((S.habits || []).map(o => OLD_ICONS[o.icon] || o.icon));
      x.icon = OLD_ICONS[x.icon] || ICONS.find(i => !used.includes(i)) || ICONS[0];
      changed = true;
    }
    if (!COLORS[x.color] && OLD_COLORS[String(x.color).toUpperCase()]) { x.color = OLD_COLORS[String(x.color).toUpperCase()]; changed = true; }
    out.push(x);
  }
  S.habits = out;
  if (changed) persist('habits');
}
const marked = (id, d) => (S.marks[d] || []).includes(id);
function toggleMark(id, d) {
  const a = [...(S.marks[d] || [])], i = a.indexOf(id);
  if (i >= 0) a.splice(i, 1); else a.push(id);
  if (a.length) S.marks[d] = a; else delete S.marks[d];
  const edge = addDays(today(), -120);
  for (const k of Object.keys(S.marks)) if (k < edge) delete S.marks[k];
  persist('marks');
  return i < 0;
}
function streak(id) {
  let d = today(), n = 0;
  if (!marked(id, d)) d = addDays(d, -1);
  while (marked(id, d)) { n++; d = addDays(d, -1); }
  return n;
}
const doneToday = () => S.habits.filter(h => marked(h.id, today())).length;

function rings(size, values, gap, maxStroke, dim) {
  const c = size / 2, n = Math.max(values.length, 1);
  const step = (c - 1) / n, stroke = Math.min(maxStroke, step - gap);
  let out = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`;
  values.forEach((v, i) => {
    const r = c - stroke / 2 - 1 - i * step; if (r <= stroke / 2) return;
    const L = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v.frac));
    out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${v.color}" stroke-opacity="${dim ? .12 : .22}" stroke-width="${stroke}"/>`;
    if (f > 0) out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${v.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(L * f).toFixed(2)} ${L.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
  });
  return out + '</svg>';
}

/* ---------- задачи ---------- */
// Задачи живут в Задачи.md в закрытом репозитории GitHub. Приложение читает и правит его ключом,
// который открывает только этот репозиторий. Ключ лежит в CloudStorage, на открытом адресе его нет.
// На компьютере (127.0.0.1) без ключа задачи берутся из показать.mjs, а правки живут только в памяти.
const TASKS_REPO = 'diana-mironova/polina-zadachi-72';
const TASKS_FILE = 'Задачи.md';
const IS_LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
const GH = `https://api.github.com/repos/${TASKS_REPO}/contents/${encodeURIComponent(TASKS_FILE)}`;
const b64dec = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), c => c.charCodeAt(0)));
const b64enc = s => { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(bin); };
function ghErr(status) {
  const e = new Error('GitHub ' + status);
  e.code = [401, 403, 404].includes(status) ? 'token' : [409, 422].includes(status) ? 'conflict' : 'net';
  return e;
}
async function ghGet(token = S.ghToken) {
  let r;
  try { r = await fetch(GH + '?ref=main', { cache: 'no-store', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' } }); }
  catch { throw ghErr(0); }
  if (!r.ok) throw ghErr(r.status);
  const j = await r.json();
  return { md: b64dec(j.content), sha: j.sha };
}
async function ghPut(md, sha, message) {
  let r;
  try {
    r = await fetch(GH, { method: 'PUT', headers: { Authorization: 'Bearer ' + S.ghToken, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: b64enc(md), sha, branch: 'main' }) });
  } catch { throw ghErr(0); }
  if (!r.ok) throw ghErr(r.status);
  return (await r.json()).content.sha;
}
const setTasks = md => { S.tasksMd = md; S.tasks = TasksMD.parse(md); };
async function loadTasks() {
  S.tasksError = '';
  if (S.ghToken) {
    S.tasksMode = 'github';
    try { const g = await ghGet(); S.remote = g; if (!S.pending) setTasks(g.md); S.tasksLoaded = Date.now(); }
    catch (e) { S.tasksError = e.code === 'token' ? 'token' : 'net'; }
    return;
  }
  if (IS_LOCAL) {
    S.tasksMode = 'preview';
    try { const r = await fetch('api/tasks.md', { cache: 'no-store' }); if (!r.ok) throw 0; setTasks(await r.text()); S.tasksLoaded = Date.now(); }
    catch { S.tasksError = 'net'; }
    return;
  }
  S.tasksMode = 'none';
}
// Правки уходят по одной. Если файл успел поменяться (например, ассистент добавил задачу),
// правка накладывается на свежую версию файла, и ничего не теряется.
let tasksQueue = Promise.resolve();
function taskOp(op, label) {
  try { setTasks(TasksMD.apply(S.tasksMd || '', op)); } catch { toast('Задачу успели поменять, список обновлён'); loadTasks().then(render); return; }
  render();
  if (S.tasksMode !== 'github') return;
  S.pending++;
  tasksQueue = tasksQueue.then(async () => {
    for (let i = 0; i < 4; i++) {
      try {
        if (!S.remote || i > 0) S.remote = await ghGet();
        const md = TasksMD.apply(S.remote.md, op);
        const sha = await ghPut(md, S.remote.sha, 'Мой день: ' + label);
        S.remote = { md, sha };
        return;
      } catch (e) {
        if (e.code === 'conflict' && i < 3) continue;
        toast(e.code === 'changed' ? 'Задачу успели поменять, список обновлён' : e.code === 'token' ? 'Ключ GitHub не подошёл, правка не сохранилась' : 'Нет связи с GitHub, правка не сохранилась');
        try { S.remote = await ghGet(); } catch {}
        return;
      }
    }
  }).finally(() => {
    if (--S.pending === 0 && S.remote) { setTasks(S.remote.md); S.tasksLoaded = Date.now(); if (!document.querySelector('.sheet-back')) render(); }
  });
}
function refreshTasks() {
  if (S.tasksMode === 'github' && !S.pending && Date.now() - (S.tasksLoaded || 0) > 10000) loadTasks().then(() => !document.querySelector('.sheet-back') && render());
}
async function connectTasks(token) {
  try {
    const g = await ghGet(token);
    S.ghToken = token; store.save('gh_token', token);
    S.remote = g; setTasks(g.md); S.tasksMode = 'github'; S.tasksError = ''; S.tasksLoaded = Date.now();
    haptic('success'); toast('Задачи подключены'); render();
  } catch (e) {
    haptic('error');
    toast(e.code === 'token' ? 'Ключ не подошёл: у него нет доступа к задачам' : 'Нет связи с GitHub, попробуй ещё раз');
  }
}
const projects = () => {
  const cnt = {};
  for (const t of S.tasks) if (t.project) cnt[t.project] = (cnt[t.project] || 0) + 1;
  return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b, 'ru'));
};
const sortTasks = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99').localeCompare(b.time || '99');
function nearestTask() {
  return S.tasks.filter(t => t.status !== 'done' && t.date).sort(sortTasks)[0] || null;
}
function dueHtml(t) {
  if (!t.date) return '<span>без срока</span>';
  const k = diffDays(t.date, today());
  const cls = k < 0 ? 'due-red' : k === 0 ? 'due-orange' : '';
  const label = k < 0 ? `просрочено · ${dayLabel(t.date)}` : dayLabel(t.date);
  return `<span class="${cls}">${esc(label)}${t.time ? ' · ' + esc(t.time) : ''}</span>`;
}

/* ---------- контент ---------- */
async function loadContent() {
  try {
    const r = await fetch(`content.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw 0;
    S.content = await r.json();
  } catch { S.contentError = true; }
}
function weekItems(ws = weekStart(today())) {
  const we = addDays(ws, 6);
  const all = S.content.weeks.flatMap(w => w.items).concat(S.plan.added);
  const seen = new Set();
  return all.filter(i => i.date && i.date >= ws && i.date <= we && !seen.has(i.key) && seen.add(i.key))
    .map(i => ({ ...i, status: S.plan.status[i.key] || i.status }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
const freshIdeas = () => S.content.ideas.filter(i => !S.plan.moved.includes(i.key));

/* ---------- подписчики и деньги ---------- */
function followersStats() {
  const f = [...S.followers].sort((a, b) => a.d.localeCompare(b.d));
  if (!f.length) return null;
  const last = f[f.length - 1];
  let base = null;
  for (const e of f) if (e.d <= addDays(last.d, -7)) base = e;
  if (!base && f.length > 1) base = f[0];
  const growth = base ? last.n - base.n : null;
  const days = base ? diffDays(last.d, base.d) : 0;
  let weeksLeft = null;
  if (growth > 0 && days > 0 && last.n < GOAL_FOLLOWERS) weeksLeft = Math.ceil((GOAL_FOLLOWERS - last.n) / (growth / days) / 7);
  return { list: f, last, base, growth, weeksLeft, exactWeek: base && days >= 7 };
}
const monthKey = (d = today()) => d.slice(0, 7);
function monthIncome() {
  const m = monthKey();
  const orders = S.orders.filter(o => o.status === 'оплачено' && o.paidAt && o.paidAt.startsWith(m));
  const manual = S.income.filter(i => i.d.startsWith(m));
  return { orders, manual, total: orders.reduce((s, o) => s + (+o.sum || 0), 0) + manual.reduce((s, i) => s + (+i.sum || 0), 0) };
}

/* ---------- таймер фокуса ---------- */
const FOCUS_MS = 25 * 60 * 1000;
let timer = (() => { try { return JSON.parse(store.local.get('timer')) || null; } catch { return null; } })() || { end: null, left: FOCUS_MS };
const saveTimer = () => store.local.set('timer', JSON.stringify(timer));
const timerLeft = () => timer.end ? Math.max(0, timer.end - Date.now()) : timer.left;
const mmss = ms => { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
function pomos(add) {
  let p = {}; try { p = JSON.parse(store.local.get('pomos') || '{}'); } catch {}
  if (add) { p = { [today()]: (p[today()] || 0) + 1 }; store.local.set('pomos', JSON.stringify(p)); }
  return p[today()] || 0;
}
function tickTimer() {
  if (timer.end && Date.now() >= timer.end) {
    timer = { end: null, left: FOCUS_MS }; saveTimer(); pomos(true);
    haptic('success'); confetti(70); toast('25 минут фокуса позади, сделай перерыв');
    if (S.tab === 'today') render();
    return;
  }
  const el = $('#timer-val'); if (el) el.textContent = mmss(timerLeft());
}

/* ---------- значки ---------- */
const IC = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="currentColor" stroke="none" opacity=".18"/><path d="M7.5 9l1.6 1.6L12 7.7M7.5 15l1.6 1.6L12 13.7M14.5 9h3M14.5 15h3"/></svg>',
  habits: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3a9 9 0 1 1-8.5 6"/><path d="M12 7.5a4.5 4.5 0 1 1-4.3 3.2" opacity=".75"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  content: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="4.5" fill="currentColor" stroke="none" opacity=".18"/><rect x="3" y="5" width="18" height="14" rx="4.5"/><path d="M10.2 9.2v5.6l4.6-2.8z" fill="currentColor"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="6" width="19" height="13" rx="4" fill="currentColor" stroke="none" opacity=".18"/><rect x="2.5" y="6" width="19" height="13" rx="4"/><path d="M10 16V9h2.6a2.1 2.1 0 0 1 0 4.2H8.8M8.8 14.6h4"/></svg>',
  pencil: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};
const TABS = [
  ['today', 'Сегодня', COLORS.pink], ['tasks', 'Задачи', COLORS.blue], ['habits', 'Привычки', COLORS.green],
  ['content', 'Контент', COLORS.purple], ['money', 'Деньги', COLORS.orange],
];

/* ---------- экран «Сегодня» ---------- */
function renderToday() {
  const t = today(), h = new Date().getHours();
  const greet = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : h < 23 ? 'Добрый вечер' : 'Доброй ночи';
  const days = [...Array(7)].map((_, i) => addDays(t, i - 6)); // последние 7 дней, сегодня справа
  const done = doneToday(), total = S.habits.length;
  const weekVals = S.habits.map(x => ({ color: hColor(x), frac: days.filter(d => marked(x.id, d)).length / 7 }));
  const weekPct = total ? Math.round(100 * days.reduce((s, d) => s + S.habits.filter(x => marked(x.id, d)).length, 0) / (total * 7)) : 0;
  const focus = S.focus[t] || '', win = S.wins[t] || '';
  const nt = nearestTask();
  const running = !!timer.end, pc = pomos();

  return `
  <div class="top">
    <div class="grow">
      <div class="eyebrow">${esc(fmt(t, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
      <h1>${greet}, ${NAME}</h1>
    </div>
    <div class="avatar"><img src="фото/полина.jpg" alt=""></div>
  </div>

  <div class="card grad g-focus" data-act="edit" data-key="focus">
    <div class="label">🎯 Фокус дня</div>
    <div class="editable ${focus ? '' : 'empty'}">${focus ? esc(focus) : 'Нажми и напиши главное на сегодня'}</div>
  </div>

  <div class="card" style="margin-top:var(--gap)">
    <div class="rings-card">
      ${rings(128, weekVals, 2.5, 12)}
      <div class="rings-legend">
        <div><span class="big-num num">${done}<span class="muted" style="font-size:18px"> из ${total}</span></span>
          <div class="muted small">сегодня · за 7 дней ${weekPct}%</div></div>
        ${S.habits.map(x => `<div class="row"><span class="dot" style="background:${hColor(x)}"></span><span>${esc(x.name)}</span><b class="num">${days.filter(d => marked(x.id, d)).length}/7</b></div>`).join('')}
      </div>
    </div>
    <div class="week">
      ${days.map(d => `<div class="d ${d === t ? 'today' : ''}">${rings(34, S.habits.map(x => ({ color: hColor(x), frac: marked(x.id, d) ? 1 : 0 })), 1, 3.4)}
        <span>${d === t ? 'сег' : fmt(d, { weekday: 'short' })}</span></div>`).join('')}
    </div>
  </div>

  <div class="tiles">
    ${S.habits.map(x => {
      const on = marked(x.id, t), s = streak(x.id);
      return `<button class="tile ${on ? 'done' : ''}" style="--c:${hColor(x)}" data-act="habit" data-id="${x.id}">
        <span class="ic">${x.icon}</span><span class="ck">${on ? IC.check : ''}</span>
        <span class="nm">${esc(x.name)}</span>
        <span class="st">${s ? `🔥 ${s} ${plural(s, ['день', 'дня', 'дней'])} подряд` : 'Начни серию сегодня'}</span>
      </button>`;
    }).join('')}
  </div>

  <div class="pair">
    <div class="card grad g-timer">
      <div class="label">⏱ Фокус-таймер</div>
      <div class="timer num" id="timer-val">${mmss(timerLeft())}</div>
      <div class="muted small">${pc ? `🍅 ${pc} ${plural(pc, ['сессия', 'сессии', 'сессий'])} сегодня` : '25 минут на одно дело'}</div>
      <div class="btns">
        <button class="pill-btn solid" data-act="timer">${running ? 'Пауза' : timer.left < FOCUS_MS ? 'Дальше' : 'Старт'}</button>
        ${running || timer.left < FOCUS_MS ? '<button class="pill-btn" data-act="timer-reset" aria-label="Сбросить">↺</button>' : ''}
      </div>
    </div>
    <div class="card grad g-task" data-act="tab" data-tab="tasks">
      <div class="label">📌 Ближайшая задача</div>
      ${nt ? `<div class="task-mini">${esc(nt.text)}</div>
        <div><span class="chip-w">${esc(diffDays(nt.date, t) < 0 ? 'просрочено · ' + dayLabel(nt.date) : dayLabel(nt.date))}${nt.time ? ' · ' + esc(nt.time) : ''}</span></div>`
      : `<div class="task-mini">${S.tasksMode === 'none' || S.tasksError === 'token' ? 'Подключи задачи на вкладке «Задачи»' : S.tasksError ? 'Нет связи с GitHub' : 'Задач со сроком нет'}</div>`}
    </div>
  </div>

  <div class="card grad g-win" style="margin-top:var(--gap)" data-act="edit" data-key="wins">
    <div class="label">🏆 Победа дня</div>
    <div class="editable ${win ? '' : 'empty'}">${win ? esc(win) : 'Вечером запиши одну строку: что сегодня получилось'}</div>
  </div>`;
}

/* ---------- экран «Задачи» ---------- */
function taskRow(x, showDate = true) {
  const [st, c] = TSTAT[x.status];
  return `<div class="item ${x.status === 'done' ? 'done' : ''}" data-act="task-edit" data-id="${esc(x.id)}">
    <div class="body"><div class="title">${esc(x.text)}</div>
      <div class="meta">${x.status === 'done' ? `<span>${x.doneDate ? 'сделано ' + esc(shortDate(x.doneDate)) : 'сделано'}</span>` : showDate ? dueHtml(x) : x.time ? `<span>${esc(x.time)}</span>` : ''}
        ${x.project ? `<span class="tag" style="--c:${hashColor(x.project)}">${esc(x.project)}</span>` : ''}</div></div>
    <button class="status" style="--c:${c}" data-act="task-status" data-id="${esc(x.id)}">${st}</button>
  </div>`;
}
function connectCard() {
  return `<div class="top"><div class="grow"><div class="eyebrow">закрытый репозиторий</div><h1>Задачи</h1></div></div>
  <div class="card">
    <div class="label">🔒 Подключи задачи</div>
    <p style="margin:6px 0 10px">${S.tasksError === 'token' ? 'Ключ GitHub не подошёл или истёк. Вставь новый.' : 'Задачи лежат в закрытом репозитории на GitHub. Вставь ключ доступа один раз, и они появятся здесь на всех твоих устройствах.'}</p>
    <input class="input" id="gh-token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…">
    <button class="btn" data-act="gh-connect" style="margin-top:10px">Подключить</button>
  </div>`;
}
function renderTasks() {
  if (S.tasksMode === 'none' || S.tasksError === 'token') return connectCard();
  const t = today(), f = S.taskFilter;
  const list = S.tasks.filter(x => f === 'all' || x.project === f);
  const active = list.filter(x => x.status !== 'done').sort(sortTasks);
  const done = list.filter(x => x.status === 'done').sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || ''));
  const overdue = active.filter(x => x.date && x.date < t), now = active.filter(x => x.date === t);
  const groups = [];
  if (overdue.length) groups.push(['Просрочено', overdue, COLORS.red, true]);
  if (now.length) groups.push(['Сегодня', now, COLORS.orange]);
  const later = {};
  for (const x of active.filter(x => x.date && x.date > t)) (later[x.date] = later[x.date] || []).push(x);
  for (const d of Object.keys(later).sort()) groups.push([dayLabel(d)[0].toUpperCase() + dayLabel(d).slice(1), later[d]]);
  const nodate = active.filter(x => !x.date);
  if (nodate.length) groups.push(['Без срока', nodate]);
  const projs = projects();

  return `
  <div class="top"><div class="grow"><div class="eyebrow">${active.length} ${plural(active.length, ['задача', 'задачи', 'задач'])} в списке</div><h1>Задачи</h1></div>
    <button class="plus" style="background:var(--blue)" data-act="task-new" aria-label="Новая задача">+</button></div>

  <div class="chips">
    <button class="chip ${f === 'all' ? 'on' : ''}" data-act="filter" data-p="all">Все проекты</button>
    ${projs.map(p => `<button class="chip ${f === p ? 'on' : ''}" style="--c:${hashColor(p)}" data-act="filter" data-p="${esc(p)}">${esc(p)}</button>`).join('')}
  </div>

  <div class="stats">
    <div class="stat" style="--c:${COLORS.red}"><div class="big-num num">${overdue.length}</div><div class="small">просрочено</div></div>
    <div class="stat" style="--c:${COLORS.orange}"><div class="big-num num">${now.length}</div><div class="small">на сегодня</div></div>
    <div class="stat" style="--c:#0A84FF"><div class="big-num num">${active.filter(x => x.status === 'wait').length}</div><div class="small">жду ответа</div></div>
  </div>

  ${S.tasksError === 'net' ? '<div class="card empty-note" style="margin-top:12px">Нет связи с GitHub. <button class="to-plan" style="background:var(--blue)" data-act="tasks-reload">Обновить</button></div>' : ''}
  ${groups.map(([title, items, c, dates]) => `<h2${c ? ` style="color:${c}"` : ''}>${esc(title)} <span class="muted">${items.length}</span></h2>
    <div class="list">${items.map(x => taskRow(x, !!dates)).join('')}</div>`).join('')}
  ${!S.tasksError && S.tasksLoaded && !active.length ? '<div class="card empty-note" style="margin-top:12px">Все задачи закрыты.</div>' : ''}
  ${done.length ? `<h2><button data-act="toggle-done" style="font-weight:700">Готово <span class="muted">${done.length} · ${S.showDone ? 'скрыть' : 'показать'}</span></button></h2>
    ${S.showDone ? `<div class="list">${done.map(x => taskRow(x)).join('')}</div>` : ''}` : ''}
  <p class="foot-note">${S.tasksMode === 'github' ? `🔒 Задачи.md в закрытом репозитории · <button data-act="gh-off" style="color:var(--blue)">сменить ключ</button>` : 'Просмотр на компьютере: правки живут до перезагрузки'}</p>`;
}

/* ---------- экран «Привычки» ---------- */
function renderHabits() {
  const t = today(), days = [...Array(14)].map((_, i) => addDays(t, i - 13));
  const full = S.habits.length >= MAX_HABITS;
  return `
  <div class="top"><div class="grow"><div class="eyebrow">${S.habits.length} из ${MAX_HABITS} привычек</div><h1>Привычки</h1></div>
    <button class="plus" style="background:var(--green)" data-act="habit-new" ${full ? 'disabled' : ''} aria-label="Новая привычка">+</button></div>
  ${S.habits.map(x => {
    const s = streak(x.id), c = hColor(x), cnt = days.filter(d => marked(x.id, d)).length;
    return `<div class="card habit" style="--c:${c}">
      <div class="head"><span class="ic">${x.icon}</span>
        <div class="grow" style="flex:1;min-width:0"><div class="name">${esc(x.name)}</div><div class="muted small">${cnt} из 14 дней</div></div>
        <div class="streak num">${s}<small>${plural(s, ['день', 'дня', 'дней'])} подряд</small></div>
        <button class="edit-btn" data-act="habit-edit" data-id="${x.id}" aria-label="Изменить">${IC.pencil}</button></div>
      <div class="dots">${days.map(d => `<button class="${marked(x.id, d) ? 'on' : ''} ${d === t ? 'today' : ''}" data-act="dot" data-id="${x.id}" data-d="${d}" aria-label="${d}">${+d.slice(8)}</button>`).join('')}</div>
      <div class="dots-legend"><span>${esc(shortDate(days[0]))}</span><span>неделю назад</span><span>сегодня</span></div>
    </div>`;
  }).join('')}
  ${!S.habits.length ? '<div class="card empty-note">Привычек пока нет. Нажми «+», чтобы добавить.</div>' : ''}
  <p class="foot-note">${full ? 'Можно вести до пяти привычек. ' : ''}Нажми на день, чтобы отметить его задним числом.</p>`;
}

/* ---------- экран «Контент» ---------- */
function cover(i) {
  const [ic, c] = FORMATS[i.format] || ['💡', COLORS.indigo];
  return `<div class="cover" style="--c:${c}">${i.cover ? `<img src="${esc(i.cover)}" alt=""><span class="fmt-ic">${ic}</span>` : ic}</div>`;
}
function spark(list) {
  if (list.length < 2) return '';
  const pts = list.slice(-30), min = Math.min(...pts.map(p => p.n)), max = Math.max(...pts.map(p => p.n)), W = 300, H = 38;
  const xy = pts.map((p, i) => [i / (pts.length - 1) * W, H - 3 - (max === min ? .5 : (p.n - min) / (max - min)) * (H - 6)]);
  const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d} L${W} ${H} L0 ${H}Z" fill="rgba(255,255,255,.18)"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function renderContent() {
  const t = today(), ws = weekStart(t), items = weekItems(ws), ideas = freshIdeas();
  const fs = followersStats();
  const counts = CORDER.map(s => [s, items.filter(i => i.status === s).length]);
  const pct = fs ? Math.min(100, fs.last.n / GOAL_FOLLOWERS * 100) : 0;
  return `
  <div class="top"><div class="grow"><div class="eyebrow">Instagram и Telegram</div><h1>Контент</h1></div></div>

  <div class="card grad g-insta">
    <div class="row-between"><div class="label">Подписчики в Instagram</div>
      ${fs && fs.growth !== null ? `<span class="badge-up num">${fs.growth >= 0 ? '+' : ''}${num(fs.growth)} ${fs.exactWeek ? 'за неделю' : 'с ' + esc(shortDate(fs.base.d))}</span>` : ''}</div>
    <div class="hero-num num">${fs ? num(fs.last.n) : '—'}</div>
    ${fs ? spark(fs.list) : ''}
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="row-between small" style="margin-top:6px"><span class="muted">Цель ${num(GOAL_FOLLOWERS)} · ${Math.floor(pct)}%</span>
      <span class="muted">${fs ? (fs.last.n >= GOAL_FOLLOWERS ? 'цель достигнута' : 'осталось ' + num(GOAL_FOLLOWERS - fs.last.n)) : 'впиши число, чтобы начать'}</span></div>
    ${fs && fs.weeksLeft ? `<div class="small" style="margin-top:4px;font-weight:600">При таком темпе до цели ${fs.weeksLeft} ${plural(fs.weeksLeft, ['неделя', 'недели', 'недель'])}</div>` : ''}
    <div class="btns"><button class="pill-btn solid" style="color:#BF5AF2" data-act="followers">Вписать число</button>
      ${fs ? `<span class="small muted" style="align-self:center">последнее: ${esc(dayLabel(fs.last.d))}</span>` : ''}</div>
  </div>

  <h2>План на неделю <span class="muted">${esc(fmt(ws, { day: 'numeric' }))}–${esc(fmt(addDays(ws, 6), { day: 'numeric', month: 'long' }))}</span></h2>
  ${items.length ? `<div class="card" style="padding:12px 14px">
    <div class="row-between"><b>${counts[3][1]} из ${items.length} вышло</b><span class="muted small">нажми на статус, чтобы сменить</span></div>
    <div class="segbar">${counts.filter(([, n]) => n).map(([s, n]) => `<i style="--c:${CSTAT[s]};flex:${n}"></i>`).join('')}</div>
    <div class="legend">${counts.map(([s, n]) => `<span style="--c:${CSTAT[s]}">${s} ${n}</span>`).join('')}</div>
  </div>
  <div class="list" style="margin-top:10px">${items.map(i => `<div class="item plan-item ${i.date === t ? 'today' : ''}">
      ${cover(i)}
      <div class="body"><div class="day" style="color:${(FORMATS[i.format] || [0, COLORS.indigo])[1]}">${esc(fmt(i.date, { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''))}${i.date === t ? ' · сегодня' : ''}</div>
        <div class="title">${esc(i.topic)}</div>
        <div class="meta"><span class="tag" style="--c:${(FORMATS[i.format] || [0, COLORS.indigo])[1]}">${esc(i.format)}</span></div></div>
      <button class="status" style="--c:${CSTAT[i.status]}" data-act="plan-status" data-key="${esc(i.key)}" data-st="${esc(i.status)}">${esc(i.status)}</button>
    </div>`).join('')}</div>`
  : `<div class="card empty-note">${S.contentError ? 'План появится, когда приложение подключим к компьютеру.' : 'На эту неделю в плане ничего нет.'}</div>`}

  <h2>Идеи <span class="muted">${ideas.length ? ideas.length + ' · из бота' : 'из бота'}</span></h2>
  ${ideas.length ? `<div class="list">${ideas.map(i => `<div class="item plan-item">
      ${cover(i)}
      <div class="body"><div class="title">${esc(i.text)}</div>
        <div class="meta">${i.format ? `<span class="tag" style="--c:${FORMATS[i.format][1]}">${esc(i.format)}</span>` : ''}${i.date ? `<span>прислала ${esc(shortDate(i.date))}</span>` : ''}</div></div>
      <button class="to-plan" data-act="idea-plan" data-key="${esc(i.key)}">В план</button>
    </div>`).join('')}</div>`
  : '<div class="card empty-note">Новых идей нет. Пришли идею боту, и она появится здесь.</div>'}
  ${S.content.source ? `<p class="foot-note">План и идеи из ${esc(S.content.source)}</p>` : ''}`;
}

/* ---------- экран «Деньги» ---------- */
function renderMoney() {
  const t = today(), inc = monthIncome(), pct = Math.min(100, inc.total / GOAL_INCOME * 100);
  const monthName = fmt(t, { month: 'long' });
  const dLeft = new Date(parseD(t).getFullYear(), parseD(t).getMonth() + 1, 0).getDate() - parseD(t).getDate();
  const sum = st => S.orders.filter(o => o.status === st).reduce((s, o) => s + (+o.sum || 0), 0);
  const orders = [...S.orders].filter(o => o.status !== 'оплачено' || (o.paidAt || '').startsWith(monthKey()))
    .sort((a, b) => OORDER.indexOf(a.status) - OORDER.indexOf(b.status) || (a.due || '9').localeCompare(b.due || '9'));
  const older = S.orders.length - orders.length;
  const flows = [...inc.orders.map(o => ({ d: o.paidAt, sum: o.sum, title: o.client, sub: o.what, order: true, id: o.id })),
    ...inc.manual.map(i => ({ d: i.d, sum: i.sum, title: i.note || 'Поступление', id: i.id }))].sort((a, b) => b.d.localeCompare(a.d));

  return `
  <div class="top"><div class="grow"><div class="eyebrow">${esc(monthName)}</div><h1>Деньги</h1></div></div>

  <div class="card grad g-money">
    <div class="label">💰 Доход за ${esc(monthName)}</div>
    <div class="hero-num num">${rub(inc.total)}</div>
    <div class="muted" style="font-weight:600">из ${rub(GOAL_INCOME)}</div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="row-between small" style="margin-top:6px;font-weight:600"><span>${Math.floor(pct)}%</span>
      <span>${inc.total >= GOAL_INCOME ? 'цель месяца выполнена' : `осталось ${rub(GOAL_INCOME - inc.total)} · ${dLeft} ${plural(dLeft, ['день', 'дня', 'дней'])}`}</span></div>
  </div>

  <div class="stats">
    <div class="stat" style="--c:${OSTAT['в работе']}"><div class="big-num num" style="font-size:16px">${rub(sum('в работе'))}</div><div class="small">в работе</div></div>
    <div class="stat" style="--c:${OSTAT['сдано']}"><div class="big-num num" style="font-size:16px">${rub(sum('сдано'))}</div><div class="small">сдано, ждём оплату</div></div>
    <div class="stat" style="--c:${OSTAT['оплачено']}"><div class="big-num num" style="font-size:16px">${rub(inc.orders.reduce((s, o) => s + (+o.sum || 0), 0))}</div><div class="small">оплачено в ${esc(/[ьй]$/.test(monthName) ? monthName.slice(0, -1) + 'е' : monthName + 'е')}</div></div>
  </div>

  <h2 class="row-between" style="display:flex">Заказы <button class="plus" style="background:var(--orange);width:30px;height:30px;font-size:20px" data-act="order-new" aria-label="Новый заказ">+</button></h2>
  ${orders.length ? `<div class="list">${orders.map(o => `<div class="item" data-act="order-edit" data-id="${o.id}">
      <div class="body"><div class="title">${esc(o.client)}</div>
        <div class="muted" style="margin-top:1px">${esc(o.what)}</div>
        <div class="meta"><span class="money-sum" style="color:var(--text)">${rub(o.sum)}</span>
          ${o.status === 'оплачено' ? `<span>оплачено ${esc(dayLabel(o.paidAt))}</span>` : o.due ? `<span class="${o.due < t ? 'due-red' : o.due === t ? 'due-orange' : ''}">сдать ${esc(dayLabel(o.due))}</span>` : ''}</div></div>
      <button class="status" style="--c:${OSTAT[o.status]}" data-act="order-status" data-id="${o.id}">${o.status}</button>
    </div>`).join('')}</div>` : '<div class="card empty-note">Заказов пока нет. Нажми «+», чтобы добавить первый.</div>'}
  ${older ? `<p class="foot-note">Ещё ${older} ${plural(older, ['заказ', 'заказа', 'заказов'])} оплачено в прошлые месяцы</p>` : ''}

  <h2 class="row-between" style="display:flex">Поступления <button class="plus" style="background:var(--green);width:30px;height:30px;font-size:20px" data-act="income-new" aria-label="Новое поступление">+</button></h2>
  ${flows.length ? `<div class="list">${flows.map(f => `<div class="item" ${f.order ? '' : `data-act="income-edit" data-id="${f.id}"`}>
      <div class="body"><div class="title">${esc(f.title)}</div>
        <div class="meta">${f.order ? '<span class="tag" style="--c:#30D158">заказ</span>' : ''}<span>${esc(dayLabel(f.d))}</span>${f.sub ? `<span>${esc(f.sub)}</span>` : ''}</div></div>
      <div class="money-sum" style="color:var(--green)">+${rub(f.sum)}</div>
    </div>`).join('')}</div>` : '<div class="card empty-note">Оплаченные заказы появятся здесь сами. Наставничество и курс добавь через «+».</div>'}`;
}

/* ---------- отрисовка ---------- */
const RENDER = { today: renderToday, tasks: renderTasks, habits: renderHabits, content: renderContent, money: renderMoney };
function render() {
  for (const k of Object.keys(RENDER)) $('#s-' + k).classList.toggle('on', k === S.tab);
  $('#s-' + S.tab).innerHTML = RENDER[S.tab]();
  $('#tabs').innerHTML = TABS.map(([k, label, c]) => `<button class="tab ${k === S.tab ? 'on' : ''}" style="--c:${c}" data-act="tab" data-tab="${k}">${IC[k]}<span>${label}</span></button>`).join('');
}
function go(tab) { if (tab === S.tab) return; S.tab = tab; if (tab === 'tasks' || tab === 'today') refreshTasks(); haptic('select'); render(); window.scrollTo(0, 0); history.replaceState(null, '', location.search + '#' + tab); }

/* ---------- нижний лист ---------- */
let sheetClose = null;
function openSheet(html, mount) {
  closeSheet();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog"><div class="grabber"></div>${html}</div>`;
  back.addEventListener('click', e => { if (e.target === back) closeSheet(); });
  document.body.appendChild(back);
  sheetClose = () => back.remove();
  if (IN_TG && tg.BackButton) { tg.BackButton.show(); }
  mount && mount($('.sheet', back));
}
function closeSheet() {
  if (sheetClose) { sheetClose(); sheetClose = null; }
  document.querySelectorAll('.story-back').forEach(e => e.remove());
  if (IN_TG && tg.BackButton) tg.BackButton.hide();
}
const field = (label, inner) => `<div class="field"><div class="label">${label}</div>${inner}</div>`;
function segPick(root, sel, cb) {
  root.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll(sel).forEach(x => x.classList.remove('on')); b.classList.add('on'); haptic('select'); cb && cb(b);
  }));
}

function taskSheet(id) {
  const x = id ? S.tasks.find(t => t.id === id) : { text: '', date: today(), time: '', project: S.taskFilter !== 'all' ? S.taskFilter : '', status: 'todo' };
  if (!x) return;
  const projs = projects();
  openSheet(`<h3>${id ? 'Задача' : 'Новая задача'}</h3>
    ${field('Что сделать', `<textarea class="input" id="f-text" rows="2" placeholder="Например, отправить смету">${esc(x.text)}</textarea>`)}
    <div class="two">${field('Дата', `<input class="input" id="f-date" type="date" value="${esc(x.date || '')}">`)}${field('Время', `<input class="input" id="f-time" type="time" value="${esc(x.time || '')}">`)}</div>
    ${field('Проект', `<div class="wrap-chips">${projs.map(p => `<button class="chip ${p === x.project ? 'on' : ''}" style="--c:${hashColor(p)}" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <input class="input" id="f-proj" style="margin-top:8px" placeholder="или новый проект" value="${projs.includes(x.project) ? '' : esc(x.project)}">`)}
    ${field('Статус', `<div class="seg">${TORDER.map(s => `<button class="${s === x.status ? 'on' : ''}" style="--c:${TSTAT[s][1]}" data-s="${s}">${TSTAT[s][0]}</button>`).join('')}</div>`)}
    <button class="btn" id="f-save">Сохранить</button>
    ${id ? '<button class="btn ghost" id="f-del">Удалить задачу</button>' : ''}`, sh => {
    let proj = x.project, status = x.status;
    segPick(sh, '.wrap-chips .chip', b => { proj = b.dataset.p; $('#f-proj', sh).value = ''; });
    $('#f-proj', sh).addEventListener('input', e => { if (e.target.value.trim()) sh.querySelectorAll('.wrap-chips .chip').forEach(c => c.classList.remove('on')); });
    segPick(sh, '.seg button', b => { status = b.dataset.s; });
    $('#f-save', sh).addEventListener('click', () => {
      const text = $('#f-text', sh).value.trim();
      if (!text) { $('#f-text', sh).focus(); return; }
      const np = $('#f-proj', sh).value.trim();
      const upd = { ...x, text, date: $('#f-date', sh).value || null, time: $('#f-time', sh).value || null, project: np || proj || '', status };
      if (status === 'done' && x.status !== 'done') upd.doneDate = today();
      if (status !== 'done') delete upd.doneDate;
      haptic('success'); closeSheet();
      if (id) taskOp({ type: 'update', line: x.line, text: x.text, task: upd }, 'правка задачи');
      else taskOp({ type: 'add', task: { ...upd, from: 'ты' } }, 'новая задача');
    });
    id && $('#f-del', sh).addEventListener('click', async () => {
      if (!(await ask('Удалить задачу из списка?'))) return;
      haptic('warning'); closeSheet();
      taskOp({ type: 'delete', line: x.line, text: x.text }, 'удаление задачи');
    });
  });
}

function habitSheet(id) {
  const x = id ? S.habits.find(h => h.id === id) : { name: '', icon: ICONS.find(i => !S.habits.some(h => h.icon === i)) || ICONS[0],
    color: Object.keys(COLORS).find(c => !S.habits.some(h => h.color === c)) || 'blue' };
  if (!x) return;
  openSheet(`<h3>${id ? 'Привычка' : 'Новая привычка'}</h3>
    ${field('Название', `<input class="input" id="f-name" maxlength="40" placeholder="Например, читать 20 страниц" value="${esc(x.name)}">`)}
    ${field('Значок', `<div class="grid-pick icons">${ICONS.map(i => `<button class="${i === x.icon ? 'on' : ''}" data-v="${i}">${i}</button>`).join('')}</div>`)}
    ${field('Цвет', `<div class="grid-pick colors">${Object.entries(COLORS).map(([k, c]) => `<button class="${k === x.color ? 'on' : ''}" style="--c:${c}" data-v="${k}" aria-label="${k}"></button>`).join('')}</div>`)}
    <button class="btn" id="f-save" style="background:var(--green)">${id ? 'Сохранить' : 'Добавить привычку'}</button>
    ${id ? '<button class="btn ghost" id="f-del">Удалить привычку</button>' : ''}`, sh => {
    let icon = x.icon, color = x.color;
    segPick(sh, '.icons button', b => { icon = b.dataset.v; });
    segPick(sh, '.colors button', b => { color = b.dataset.v; });
    $('#f-save', sh).addEventListener('click', () => {
      const name = $('#f-name', sh).value.trim();
      if (!name) { $('#f-name', sh).focus(); return; }
      if (id) S.habits = S.habits.map(h => h.id === id ? { ...h, name, icon, color } : h);
      else if (S.habits.length < MAX_HABITS) S.habits.push({ id: uid('h'), name, icon, color });
      persist('habits'); haptic('success'); closeSheet(); render();
    });
    id && $('#f-del', sh).addEventListener('click', async () => {
      if (!(await ask(`Удалить привычку «${x.name}» вместе с отметками?`))) return;
      S.habits = S.habits.filter(h => h.id !== id);
      for (const d of Object.keys(S.marks)) { S.marks[d] = S.marks[d].filter(i => i !== id); if (!S.marks[d].length) delete S.marks[d]; }
      persist('habits'); persist('marks'); haptic('warning'); closeSheet(); render();
    });
  });
}

function followersSheet() {
  const fs = followersStats();
  openSheet(`<h3>Подписчики сегодня</h3>
    ${field('Сколько сейчас подписчиков в Instagram', `<input class="input num" id="f-n" type="number" inputmode="numeric" min="0" placeholder="${fs ? fs.last.n : 'Например, 5200'}">`)}
    ${fs ? `<p class="muted small" style="margin:-4px 2px 12px">Последняя запись: ${num(fs.last.n)}, ${esc(dayLabel(fs.last.d))}</p>` : ''}
    <button class="btn" id="f-save" style="background:var(--purple)">Сохранить</button>`, sh => {
    const inp = $('#f-n', sh); setTimeout(() => inp.focus(), 250);
    $('#f-save', sh).addEventListener('click', () => {
      const n = parseInt(inp.value, 10);
      if (!(n >= 0)) { inp.focus(); return; }
      const d = today();
      S.followers = S.followers.filter(e => e.d !== d).concat({ d, n }).sort((a, b) => a.d.localeCompare(b.d)).slice(-120);
      persist('followers'); haptic('success'); closeSheet(); render();
    });
  });
}

function ideaSheet(key) {
  const idea = S.content.ideas.find(i => i.key === key); if (!idea) return;
  const ws = weekStart(today()), days = [...Array(7)].map((_, i) => addDays(ws, i));
  const busy = new Set(weekItems(ws).map(i => i.date));
  let day = days.find(d => d >= today() && !busy.has(d)) || days.find(d => d >= today()) || days[6], format = idea.format || 'Пост';
  openSheet(`<h3>В план</h3>
    <div class="card" style="margin-bottom:12px;font-weight:600">${esc(idea.text)}</div>
    ${field('День', `<div class="wrap-chips days">${days.map(d => `<button class="chip ${d === day ? 'on' : ''}" style="--c:var(--purple)" data-v="${d}">${esc(fmt(d, { weekday: 'short', day: 'numeric' }))}${busy.has(d) ? ' ·' : ''}</button>`).join('')}</div>`)}
    ${field('Формат', `<div class="wrap-chips fmts">${Object.entries(FORMATS).map(([f, [ic, c]]) => `<button class="chip ${f === format ? 'on' : ''}" style="--c:${c}" data-v="${f}">${ic} ${f}</button>`).join('')}</div>`)}
    <p class="muted small" style="margin:-4px 2px 12px">Точкой отмечены дни, где уже что-то стоит.</p>
    <button class="btn" id="f-save" style="background:var(--purple)">Поставить в план</button>`, sh => {
    segPick(sh, '.days .chip', b => { day = b.dataset.v; });
    segPick(sh, '.fmts .chip', b => { format = b.dataset.v; });
    $('#f-save', sh).addEventListener('click', () => {
      S.plan.added.push({ key: uid('p'), date: day, format, topic: idea.text, status: 'идея', cover: idea.cover || null, fromIdea: idea.key });
      S.plan.moved.push(idea.key); persist('plan'); haptic('success'); closeSheet(); render();
      toast(`Идея стоит в плане: ${dayLabel(day)}`);
    });
  });
}

function orderSheet(id) {
  const x = id ? S.orders.find(o => o.id === id) : { client: '', what: '', due: '', sum: '', status: 'в работе' };
  if (!x) return;
  openSheet(`<h3>${id ? 'Заказ' : 'Новый заказ'}</h3>
    ${field('Клиент', `<input class="input" id="f-client" placeholder="Имя или объект" value="${esc(x.client)}">`)}
    ${field('Что сдать', `<input class="input" id="f-what" placeholder="Например, планировка 78 м²" value="${esc(x.what)}">`)}
    <div class="two">${field('Срок', `<input class="input" id="f-due" type="date" value="${esc(x.due || '')}">`)}${field('Сумма, ₽', `<input class="input num" id="f-sum" type="number" inputmode="numeric" min="0" value="${esc(x.sum)}">`)}</div>
    ${field('Статус', `<div class="seg" style="grid-template-columns:repeat(3,1fr)">${OORDER.map(s => `<button class="${s === x.status ? 'on' : ''}" style="--c:${OSTAT[s]}" data-s="${s}">${s}</button>`).join('')}</div>`)}
    <button class="btn" id="f-save" style="background:var(--orange)">Сохранить</button>
    ${id ? '<button class="btn ghost" id="f-del">Удалить заказ</button>' : ''}`, sh => {
    let status = x.status;
    segPick(sh, '.seg button', b => { status = b.dataset.s; });
    $('#f-save', sh).addEventListener('click', () => {
      const client = $('#f-client', sh).value.trim(), sum = parseInt($('#f-sum', sh).value, 10);
      if (!client) { $('#f-client', sh).focus(); return; }
      if (!(sum >= 0)) { $('#f-sum', sh).focus(); return; }
      const upd = { ...x, client, what: $('#f-what', sh).value.trim(), due: $('#f-due', sh).value || '', sum, status };
      if (status === 'оплачено' && !upd.paidAt) upd.paidAt = today();
      if (status !== 'оплачено') delete upd.paidAt;
      if (id) S.orders = S.orders.map(o => o.id === id ? upd : o); else S.orders.push({ ...upd, id: uid('o') });
      persist('orders'); haptic('success'); closeSheet(); render();
      if (status === 'оплачено' && x.status !== 'оплачено') { confetti(90); toast(`+${rub(sum)} в доход месяца`); }
    });
    id && $('#f-del', sh).addEventListener('click', async () => {
      if (!(await ask('Удалить заказ?'))) return;
      S.orders = S.orders.filter(o => o.id !== id); persist('orders'); haptic('warning'); closeSheet(); render();
    });
  });
}

function incomeSheet(id) {
  const x = id ? S.income.find(i => i.id === id) : { d: today(), sum: '', note: '' };
  if (!x) return;
  openSheet(`<h3>${id ? 'Поступление' : 'Новое поступление'}</h3>
    ${field('За что', `<input class="input" id="f-note" placeholder="Например, наставничество" value="${esc(x.note)}">`)}
    <div class="two">${field('Сумма, ₽', `<input class="input num" id="f-sum" type="number" inputmode="numeric" min="0" value="${esc(x.sum)}">`)}${field('Дата', `<input class="input" id="f-d" type="date" value="${esc(x.d)}">`)}</div>
    <button class="btn" id="f-save" style="background:var(--green)">Сохранить</button>
    ${id ? '<button class="btn ghost" id="f-del">Удалить поступление</button>' : ''}`, sh => {
    $('#f-save', sh).addEventListener('click', () => {
      const sum = parseInt($('#f-sum', sh).value, 10);
      if (!(sum > 0)) { $('#f-sum', sh).focus(); return; }
      const upd = { ...x, sum, note: $('#f-note', sh).value.trim(), d: $('#f-d', sh).value || today() };
      if (id) S.income = S.income.map(i => i.id === id ? upd : i); else S.income.push({ ...upd, id: uid('i') });
      const edge = addDays(today(), -400); S.income = S.income.filter(i => i.d >= edge);
      persist('income'); haptic('success'); closeSheet(); render();
    });
    id && $('#f-del', sh).addEventListener('click', async () => {
      if (!(await ask('Удалить поступление?'))) return;
      S.income = S.income.filter(i => i.id !== id); persist('income'); haptic('warning'); closeSheet(); render();
    });
  });
}

/* ---------- фокус и победа дня: правка нажатием ---------- */
function inlineEdit(card, key) {
  const box = $('.editable', card); if (!box || $('textarea', card)) return;
  const d = today(), ta = document.createElement('textarea');
  ta.className = 'inline-input'; ta.rows = 2; ta.maxLength = 140; ta.value = S[key][d] || '';
  ta.placeholder = key === 'focus' ? 'Главное на сегодня' : 'Что сегодня получилось';
  box.replaceWith(ta); ta.focus();
  const done = () => {
    const v = ta.value.trim();
    if (v) S[key][d] = v; else delete S[key][d];
    const edge = addDays(d, -90); for (const k of Object.keys(S[key])) if (k < edge) delete S[key][k];
    persist(key); render();
    if (v && key === 'wins') haptic('success');
  };
  ta.addEventListener('blur', done, { once: true });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); } });
}

/* ---------- итог дня ---------- */
function openStory() {
  closeSheet();
  const t = today(), fs = followersStats();
  const out = S.content.weeks.flatMap(w => w.items).concat(S.plan.added)
    .map(i => ({ ...i, status: S.plan.status[i.key] || i.status }))
    .filter(i => i.status === 'вышло' && i.date && i.date > addDays(t, -7) && i.date <= t);
  const pc = pomos();
  const back = document.createElement('div');
  back.className = 'story-back';
  back.innerHTML = `<button class="story-close" aria-label="Закрыть">×</button>
  <div class="story">
    <div class="s-top"><img src="фото/полина.jpg" alt=""><div><div class="s-title">Итог дня</div><div class="s-date">${esc(fmt(t, { weekday: 'long', day: 'numeric', month: 'long' }))}</div></div></div>
    <div class="s-box s-hab">${rings(92, S.habits.map(h => ({ color: '#fff', frac: marked(h.id, t) ? 1 : 0 })), 2.5, 9)}
      <div><div class="s-label">Привычки</div><div class="s-big num">${doneToday()} из ${S.habits.length}</div>
      <div class="s-habits">${S.habits.map(h => `<span class="${marked(h.id, t) ? 'on' : 'off'}" title="${esc(h.name)}">${h.icon}</span>`).join('')}</div></div></div>
    <div class="s-box"><div class="s-label">Фокус дня</div><div class="s-val">${S.focus[t] ? esc(S.focus[t]) : 'Фокус не записан'}</div>
      ${pc ? `<div class="small" style="margin-top:3px;opacity:.85">🍅 ${pc} ${plural(pc, ['сессия', 'сессии', 'сессий'])} по 25 минут</div>` : ''}</div>
    <div class="s-row">
      <div class="s-box"><div class="s-label">Подписчики</div><div class="s-big num">${fs && fs.growth !== null ? (fs.growth >= 0 ? '+' : '') + num(fs.growth) : '—'}</div>
        <div class="small" style="opacity:.85">${fs && fs.growth !== null ? (fs.exactWeek ? 'за неделю' : 'с ' + esc(shortDate(fs.base.d))) + ', всего ' + num(fs.last.n) : 'нет данных за неделю'}</div></div>
      <div class="s-box"><div class="s-label">Контент</div><div class="s-big num">${out.length}</div>
        <div class="small" style="opacity:.85">${plural(out.length, ['вышел', 'вышло', 'вышло'])} за 7 дней</div></div>
    </div>
    ${out.length ? `<div class="s-box" style="padding:8px 12px">${out.slice(0, 3).map(i => `<div style="font-weight:600;line-height:1.45">${(FORMATS[i.format] || ['💡'])[0]} ${esc(i.topic)}</div>`).join('')}</div>` : ''}
    <div class="s-box"><div class="s-label">🏆 Победа дня</div><div class="s-val">${S.wins[t] ? esc(S.wins[t]) : 'Победу дня запиши на вкладке «Сегодня»'}</div></div>
    <div class="s-foot">Собрано в Claude Code · практикум @mironova.dii</div>
  </div>`;
  back.addEventListener('click', e => { if (e.target === back || e.target.classList.contains('story-close')) closeSheet(); });
  document.body.appendChild(back);
  if (IN_TG && tg.BackButton) tg.BackButton.show();
  haptic('medium');
}

/* ---------- конфетти ---------- */
function confetti(count = 160) {
  const cv = $('#confetti'), ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const cols = Object.values(COLORS);
  const ps = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .45, vx: (Math.random() - .5) * 13, vy: -Math.random() * 13 - 5,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[(Math.random() * cols.length) | 0],
  }));
  const start = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const life = (now - start) / 2600;
    for (const p of ps) {
      p.vy += .34; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - life); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (life < 1) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(start);
}

/* ---------- нажатия ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (a === 'tab') return go(el.dataset.tab);
  if (a === 'story') return openStory();
  if (a === 'edit') return inlineEdit(el, el.dataset.key);
  if (a === 'habit') {
    const on = toggleMark(id, today());
    haptic(on ? 'medium' : 'light');
    render();
    const tile = $(`.tile[data-id="${id}"]`); tile && tile.classList.add('pop');
    if (on && doneToday() === S.habits.length) { setTimeout(() => confetti(), 120); haptic('success'); toast('Все привычки на сегодня закрыты'); }
    return;
  }
  if (a === 'dot') { toggleMark(id, el.dataset.d); haptic('light'); return render(); }
  if (a === 'habit-new') return S.habits.length < MAX_HABITS && habitSheet();
  if (a === 'habit-edit') return habitSheet(id);
  if (a === 'timer') {
    if (timer.end) timer = { end: null, left: timerLeft() }; else timer = { end: Date.now() + timer.left, left: timer.left };
    saveTimer(); haptic('medium'); return render();
  }
  if (a === 'timer-reset') { timer = { end: null, left: FOCUS_MS }; saveTimer(); haptic('light'); return render(); }
  if (a === 'filter') { S.taskFilter = el.dataset.p; haptic('select'); return render(); }
  if (a === 'gh-connect') { const v = ($('#gh-token') || {}).value || ''; if (v.trim()) connectTasks(v.trim()); return; }
  if (a === 'gh-off') {
    ask('Отключить задачи на этом аккаунте? Ключ удалится из приложения, задачи на GitHub останутся.').then(ok => {
      if (!ok) return; S.ghToken = ''; store.save('gh_token', ''); S.tasks = []; S.tasksMd = ''; S.remote = null; loadTasks().then(render);
    });
    return;
  }
  if (a === 'tasks-reload') { loadTasks().then(render); return; }
  if (a === 'toggle-done') { S.showDone = !S.showDone; return render(); }
  if (a === 'task-new') return taskSheet();
  if (a === 'task-edit') return taskSheet(id);
  if (a === 'task-status') {
    const x = S.tasks.find(t => t.id === id); if (!x) return;
    const upd = { ...x, status: TORDER[(TORDER.indexOf(x.status) + 1) % TORDER.length] };
    if (upd.status === 'done') upd.doneDate = today(); else delete upd.doneDate;
    haptic(upd.status === 'done' ? 'success' : 'select');
    return taskOp({ type: 'update', line: x.line, text: x.text, task: upd }, 'статус задачи');
  }
  if (a === 'plan-status') {
    const next = CORDER[(CORDER.indexOf(el.dataset.st) + 1) % CORDER.length];
    S.plan.status[el.dataset.key] = next; persist('plan');
    haptic(next === 'вышло' ? 'success' : 'select'); render();
    if (next === 'вышло') confetti(60);
    return;
  }
  if (a === 'idea-plan') return ideaSheet(el.dataset.key);
  if (a === 'followers') return followersSheet();
  if (a === 'order-new') return orderSheet();
  if (a === 'order-edit') return orderSheet(id);
  if (a === 'order-status') {
    const o = S.orders.find(x => x.id === id); if (!o) return;
    o.status = OORDER[(OORDER.indexOf(o.status) + 1) % OORDER.length];
    if (o.status === 'оплачено') o.paidAt = today(); else delete o.paidAt;
    persist('orders'); haptic(o.status === 'оплачено' ? 'success' : 'select'); render();
    if (o.status === 'оплачено') { confetti(90); toast(`+${rub(o.sum)} в доход месяца`); }
    return;
  }
  if (a === 'income-new') return incomeSheet();
  if (a === 'income-edit') return incomeSheet(id);
});

/* ---------- запуск ---------- */
async function init() {
  if (tg) {
    try { tg.ready(); tg.expand(); tg.disableVerticalSwipes && tg.isVersionAtLeast('7.7') && tg.disableVerticalSwipes(); } catch {}
    tg.onEvent && tg.onEvent('themeChanged', applyTheme);
    tg.BackButton && tg.BackButton.onClick && tg.BackButton.onClick(closeSheet);
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => !IN_TG && applyTheme());
  const h = location.hash.slice(1);
  if (RENDER[h]) S.tab = h;

  const data = await store.load([...CLOUD_KEYS, 'gh_token']);
  for (const k of CLOUD_KEYS) if (data[k] !== undefined) S[k] = data[k];
  S.ghToken = data.gh_token || '';
  await Promise.all([loadTasks(), loadContent()]);
  if (!data.habits) { S.habits = DEFAULT_HABITS.map(h => ({ ...h })); persist('habits'); }
  else fixOldHabits();
  S.plan = { status: {}, added: [], moved: [], ...S.plan };
  render();
  setInterval(tickTimer, 500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); refreshTasks(); } });
  window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (RENDER[t]) { closeSheet(); S.tab = t; render(); window.scrollTo(0, 0); } });
}
init();
