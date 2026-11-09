// Разбор и правка Задачи.md: тот же формат, что ведёт ассистент.
// Работает в приложении (window.TasksMD) и на компьютере (require).
// Правка меняет только нужную строку, остальной файл остаётся как был,
// поэтому правки из приложения и правки ассистента сливаются без потерь.
(function (root) {
  'use strict';
  const SECTIONS = { 'На этой неделе': 'todo', 'Дальше': 'todo', 'В работе': 'doing', 'Ждём ответа': 'wait', 'Сделано': 'done' };
  const STATUS_WORDS = { 'нужно сделать': 'todo', 'в работе': 'doing', 'жду ответа': 'wait', 'готово': 'done' };
  const DESCRIPTIONS = { 'В работе': 'Ты уже взялась за задачу, но она ещё не готова.' };
  const ORDER = ['На этой неделе', 'Дальше', 'В работе', 'Ждём ответа', 'Сделано'];

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Год в файле не пишется: берём ближайший к сегодняшнему дню.
  function isoFromDM(dm, ref) {
    const m = /^(\d{1,2})\.(\d{1,2})$/.exec((dm || '').trim());
    if (!m) return null;
    ref = ref || new Date();
    const d = +m[1], mo = +m[2];
    let y = ref.getFullYear();
    const diff = (new Date(y, mo - 1, d) - ref) / 864e5;
    if (diff > 183) y -= 1; else if (diff < -183) y += 1;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  const dm = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : '';

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  function parseLine(raw, section, ref) {
    const m = /^- \[( |x|X)\] (.+)$/.exec(raw.trim());
    if (!m || !(section in SECTIONS)) return null;
    const parts = m[2].split(' | ').map(s => s.trim());
    const t = { text: parts[0], date: null, time: null, project: '', status: SECTIONS[section], from: '', reminder: '', line: raw.trim() };
    if (m[1] !== ' ') t.status = 'done';
    for (const p of parts.slice(1)) {
      const kv = /^([а-яё]+):\s*(.*)$/i.exec(p);
      if (!kv) { t.project = p; continue; }
      const k = kv[1].toLowerCase(), v = kv[2].trim();
      if (k === 'срок') t.date = isoFromDM(v, ref);
      else if (k === 'сделано') t.doneDate = isoFromDM(v, ref);
      else if (k === 'время') t.time = /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : null;
      else if (k === 'статус' && STATUS_WORDS[v]) t.status = STATUS_WORDS[v];
      else if (k === 'откуда') t.from = v;
      else if (k === 'напоминание') t.reminder = v;
    }
    if (!t.time) {
      const tm = /(?:^|\s|,)(?:до|в)\s(\d{1,2}:\d{2})/.exec(t.text);
      if (tm) t.time = tm[1].padStart(5, '0');
    }
    return t;
  }

  function parse(md, ref) {
    const tasks = [], seen = {};
    let section = '';
    for (const raw of md.split('\n')) {
      const h = /^##\s+(.+?)\s*$/.exec(raw);
      if (h) { section = h[1]; continue; }
      const t = parseLine(raw, section, ref);
      if (!t) continue;
      const base = hash(t.line);
      seen[base] = (seen[base] || 0) + 1;
      t.id = base + (seen[base] > 1 ? '-' + seen[base] : '');
      tasks.push(t);
    }
    return tasks;
  }

  const clean = s => String(s || '').replace(/\s*\|\s*/g, ' / ').replace(/\s+/g, ' ').trim();

  function serialize(t, ref) {
    if (t.status === 'done') {
      const p = [clean(t.text), 'сделано: ' + dm(t.doneDate || iso(ref || new Date()))];
      if (t.project) p.push(clean(t.project));
      return '- [x] ' + p.join(' | ');
    }
    const p = [clean(t.text), 'срок: ' + (t.date ? dm(t.date) : 'нет')];
    if (t.time) p.push('время: ' + t.time);
    if (t.project) p.push(clean(t.project));
    p.push('откуда: ' + (t.from || 'ты'));
    if (t.reminder) p.push('напоминание: ' + t.reminder);
    return '- [ ] ' + p.join(' | ');
  }

  function sectionFor(t, ref) {
    if (t.status === 'done') return 'Сделано';
    if (t.status === 'wait') return 'Ждём ответа';
    if (t.status === 'doing') return 'В работе';
    const d = ref || new Date();
    const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - d.getDay()) % 7);
    return t.date && t.date <= iso(sunday) ? 'На этой неделе' : 'Дальше';
  }

  function sectionAt(lines, i) {
    for (let k = i; k >= 0; k--) { const h = /^##\s+(.+?)\s*$/.exec(lines[k]); if (h) return h[1]; }
    return '';
  }

  function findLine(lines, op) {
    let i = lines.findIndex(l => l.trim() === op.line);
    if (i >= 0) return i;
    // строку успели поправить: ищем задачу с тем же текстом, если она одна
    const same = [];
    lines.forEach((l, k) => { const t = parseLine(l, sectionAt(lines, k)); if (t && t.text === op.text) same.push(k); });
    if (same.length === 1) return same[0];
    const e = new Error('Задачу успели поменять'); e.code = 'changed'; throw e;
  }

  function insert(lines, section, line) {
    let h = lines.findIndex(l => l.trim() === '## ' + section);
    if (h < 0) {
      // раздела нет: ставим его на своё место по порядку
      const after = ORDER.slice(ORDER.indexOf(section) + 1);
      let at = lines.findIndex(l => after.some(s => l.trim() === '## ' + s));
      if (at < 0) { while (lines.length && lines[lines.length - 1].trim() === '') lines.pop(); lines.push(''); at = lines.length; }
      const block = ['## ' + section, ''];
      if (DESCRIPTIONS[section]) block.push(DESCRIPTIONS[section], '');
      lines.splice(at, 0, ...block, line, '');
      return;
    }
    let end = lines.findIndex((l, k) => k > h && /^##\s/.test(l));
    if (end < 0) end = lines.length;
    let last = -1;
    for (let k = h + 1; k < end; k++) if (/^- \[/.test(lines[k].trim())) last = k;
    if (last >= 0) { lines.splice(last + 1, 0, line); return; }
    let ne = h;
    for (let k = h + 1; k < end; k++) if (lines[k].trim()) ne = k;
    const add = ['', line];
    if (ne + 1 >= end && end < lines.length) add.push('');
    lines.splice(ne + 1, 0, ...add);
  }

  // op: {type:'add', task} | {type:'update', line, text, task} | {type:'delete', line, text}
  function apply(md, op, ref) {
    ref = ref || new Date();
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    if (op.type === 'add') {
      insert(lines, sectionFor(op.task, ref), serialize(op.task, ref));
    } else {
      const i = findLine(lines, op);
      if (op.type === 'delete') lines.splice(i, 1);
      else {
        const line = serialize(op.task, ref), to = sectionFor(op.task, ref);
        const from = sectionAt(lines, i);
        if (from === to) lines[i] = line;
        else { lines.splice(i, 1); insert(lines, to, line); }
      }
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  const api = { parse, apply, serialize, sectionFor, isoFromDM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TasksMD = api;
})(typeof window !== 'undefined' ? window : this);
