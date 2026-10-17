// Utilitários do servidor (não é uma rota: pastas iniciadas por "_" não viram funções na Vercel)
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '');

export function cleanUrl(raw) {
  if (!raw) return null;
  const s = clean(raw);
  try { return new URL(s.startsWith('http') ? s : `https://${s}`).origin; } catch { return null; }
}

export const SUPABASE_URL = cleanUrl(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
export const ANON_KEY = clean(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);

export function adminClient() {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!SUPABASE_URL || !key) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY ausente'), { code: 'config' });
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !SUPABASE_URL || !ANON_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

// Chaves VAPID: geradas uma vez e guardadas em app_secrets (só o servidor lê)
export async function vapidKeys(db) {
  const { data } = await db.from('app_secrets').select('key,value').in('key', ['vapid_public', 'vapid_private']);
  const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  if (m.vapid_public && m.vapid_private) return { publicKey: m.vapid_public, privateKey: m.vapid_private };
  const k = webpush.generateVAPIDKeys();
  await db.from('app_secrets').upsert(
    [{ key: 'vapid_public', value: k.publicKey }, { key: 'vapid_private', value: k.privateKey }],
    { onConflict: 'key', ignoreDuplicates: true }
  );
  // relê para o caso de duas execuções simultâneas
  const again = await db.from('app_secrets').select('key,value').in('key', ['vapid_public', 'vapid_private']);
  const n = Object.fromEntries((again.data || []).map((r) => [r.key, r.value]));
  return { publicKey: n.vapid_public || k.publicKey, privateKey: n.vapid_private || k.privateKey };
}

// Envia para todas as assinaturas do usuário; remove as que expiraram
export async function sendToUser(db, keys, subs, payload) {
  webpush.setVapidDetails('mailto:demandas@example.com', keys.publicKey, keys.privateKey);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600, urgency: 'high' }
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push', e.statusCode, e.body);
    }
  }
  return sent;
}

// Data e hora locais num fuso
export function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// Converte data/hora locais de um fuso em ISO (UTC)
export function zonedToISO(dateStr, timeStr, tz) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '12:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess - (asIfUTC - guess)).toISOString();
}

// Atrasados e de hoje, no fuso do usuário
export function summarize(tasks, tz, now = new Date()) {
  const today = localParts(now, tz).date;
  let late = 0; let todayCount = 0; const todayList = [];
  for (const t of tasks) {
    if (t.status !== 'open' || !t.due_at) continue;
    const due = new Date(t.due_at);
    const dueDay = localParts(due, tz).date;
    const isLate = t.due_all_day ? dueDay < today : due < now;
    if (isLate) late++;
    else if (dueDay === today) { todayCount++; todayList.push(t); }
  }
  todayList.sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  return { late, today: todayCount, first: todayList[0] || null };
}
