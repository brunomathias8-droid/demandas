import { supabase } from './supabase';
import { toISO } from './dates';

const WEEK_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const pad = (n) => String(n).padStart(2, '0');

export const MAX_SECONDS = 180;

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const opts = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return opts.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function sendCapture({ text, audio, mime, demands }) {
  if (!supabase) throw new Error('A captura inteligente precisa da conta conectada.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Faça login novamente.');
  const now = new Date();
  const body = {
    text: text || undefined,
    audio: audio || undefined,
    mime: mime || undefined,
    nowLocal: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    weekday: WEEK_LONG[now.getDay()],
    demands: demands.map((d) => ({ id: d.id, name: d.name, description: d.description || '', keywords: d.keywords || [] }))
  };
  let r;
  try {
    r = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('Sem conexão. Verifique a internet e tente de novo.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Não consegui processar agora. Tente de novo.');
  return j;
}

// Lembrete padrão para não deixar passar: no horário do prazo, ou às 9:00 do dia do prazo.
export function defaultReminder(item, now = new Date()) {
  if (item.remind_at) {
    const [d, t] = item.remind_at.split('T');
    return toISO(d, t);
  }
  if (!item.due_date) return null;
  const iso = toISO(item.due_date, item.due_time || '09:00');
  return new Date(iso) > now ? iso : null;
}

export function itemToTask(item, { transcript, source }) {
  return {
    title: item.title.trim(),
    demand_id: item.demand_id,
    kind: item.kind,
    notes: item.notes || null,
    due_at: item.due_date ? toISO(item.due_date, item.due_time || null) : null,
    due_all_day: !item.due_time,
    remind_at: item.reminderOff ? null : defaultReminder(item),
    source,
    raw_input: transcript || null
  };
}
