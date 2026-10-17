// Utilitários de data em pt-BR. Datas são guardadas em ISO (UTC) e exibidas no fuso do aparelho.

const DAY = 86400000;
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEK_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY);

export const hhmm = (d) => {
  const x = new Date(d);
  const m = x.getMinutes();
  return `${x.getHours()}:${String(m).padStart(2, '0')}`;
};

export function todayLabel(now = new Date()) {
  const w = WEEK_LONG[now.getDay()];
  return `${w.charAt(0).toUpperCase() + w.slice(1)}, ${now.getDate()} de ${MONTHS_LONG[now.getMonth()]}`;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function isLate(task, now = new Date()) {
  if (!task.due_at || task.status === 'done') return false;
  const due = new Date(task.due_at);
  return task.due_all_day ? startOfDay(due) < startOfDay(now) : due < now;
}

// Rótulo curto do prazo: "Hoje", "14:30", "Amanhã, 9:00", "Seg, 19", "3 nov", "Ontem", "Há 3 dias"
export function dueLabel(task, now = new Date()) {
  if (!task.due_at) return '';
  const due = new Date(task.due_at);
  const diff = dayDiff(due, now);
  const t = task.due_all_day ? '' : hhmm(due);
  if (diff === 0) return t || 'Hoje';
  if (diff === 1) return t ? `Amanhã, ${t}` : 'Amanhã';
  if (diff === -1) return t ? `Ontem, ${t}` : 'Ontem';
  if (diff < -1) return `Há ${-diff} dias`;
  const base = diff < 7 ? `${WEEK[due.getDay()]}, ${due.getDate()}` : `${due.getDate()} ${MONTHS[due.getMonth()]}`;
  return t ? `${base} · ${t}` : base;
}

export function reminderLabel(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  const t = hhmm(d);
  if (diff === 0) return `Hoje, ${t}`;
  if (diff === 1) return `Amanhã, ${t}`;
  if (diff > 1 && diff < 7) return `${WEEK[d.getDay()]}, ${t}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${t}`;
}

// Agrupa tarefas abertas para a tela Hoje
export function bucketize(tasks, now = new Date()) {
  const b = { late: [], today: [], next: [], later: [], nodate: [] };
  for (const t of tasks) {
    if (t.status !== 'open') continue;
    if (!t.due_at) { b.nodate.push(t); continue; }
    if (isLate(t, now)) { b.late.push(t); continue; }
    const diff = dayDiff(t.due_at, now);
    if (diff === 0) b.today.push(t);
    else if (diff <= 7) b.next.push(t);
    else b.later.push(t);
  }
  const byDue = (a, c) => new Date(a.due_at) - new Date(c.due_at);
  b.late.sort(byDue); b.today.sort(byDue); b.next.sort(byDue); b.later.sort(byDue);
  b.nodate.sort((a, c) => new Date(c.created_at) - new Date(a.created_at));
  return b;
}

// Converte valores de <input type="date"> e <input type="time"> em ISO
export function toISO(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr ? timeStr.split(':').map(Number) : [12, 0];
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

export function toDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function nextWeekday(target, now = new Date()) {
  // target: 1 = segunda
  const d = startOfDay(now);
  let add = (target - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  return addDays(d, add);
}

export const weekdayShort = (d) => `${WEEK[d.getDay()]}, ${d.getDate()}`;
