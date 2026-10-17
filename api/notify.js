// POST /api/notify — chamado a cada minuto pelo agendador do Supabase.
// Envia lembretes vencidos e o resumo da manhã.
import { adminClient, localParts, sendToUser, summarize, vapidKeys } from './_lib/server.js';

const hhmm = (d, tz) => localParts(d, tz).time.replace(/^0/, '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  let db;
  try { db = adminClient(); } catch { return res.status(500).json({ error: 'config' }); }

  // Autorização: segredo gerado no banco (app_secrets.cron_secret)
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const { data: sec } = await db.from('app_secrets').select('value').eq('key', 'cron_secret').maybeSingle();
  if (!sec?.value || token !== sec.value) return res.status(401).json({ error: 'unauthorized' });

  const now = new Date();
  const keys = await vapidKeys(db);
  const { data: subsAll } = await db.from('push_subscriptions').select('*');
  if (!subsAll?.length) return res.status(200).json({ ok: true, users: 0 });

  const subsByUser = {};
  for (const s of subsAll) (subsByUser[s.user_id] ||= []).push(s);
  const userIds = Object.keys(subsByUser);

  const [{ data: profiles }, { data: demands }, { data: openTasks }] = await Promise.all([
    db.from('profiles').select('*').in('user_id', userIds),
    db.from('demands').select('id,name,user_id').in('user_id', userIds),
    db.from('tasks').select('id,user_id,demand_id,title,status,due_at,due_all_day,remind_at,reminded_at').in('user_id', userIds).eq('status', 'open')
  ]);
  const profileOf = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
  const demandName = Object.fromEntries((demands || []).map((d) => [d.id, d.name]));
  const tasksByUser = {};
  for (const t of openTasks || []) (tasksByUser[t.user_id] ||= []).push(t);

  let reminders = 0; let mornings = 0;
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  for (const uid of userIds) {
    const prof = profileOf[uid] || { tz: 'America/Fortaleza', morning_enabled: true, morning_time: '07:30' };
    const tz = prof.tz || 'America/Fortaleza';
    const tasks = tasksByUser[uid] || [];
    const sum = summarize(tasks, tz, now);
    const badge = sum.late + sum.today;

    // 1) Lembretes vencidos (até 24 h de atraso), ainda não enviados para este horário
    const due = tasks.filter((t) => t.remind_at
      && new Date(t.remind_at) <= now && new Date(t.remind_at) > dayAgo
      && (!t.reminded_at || new Date(t.reminded_at) < new Date(t.remind_at)));
    for (const t of due) {
      const when = t.due_at && !t.due_all_day ? ` · ${hhmm(new Date(t.due_at), tz)}` : '';
      const sent = await sendToUser(db, keys, subsByUser[uid], {
        title: `${demandName[t.demand_id] || 'Lembrete'}${when}`,
        body: t.title,
        tag: `task-${t.id}`,
        url: `/?task=${t.id}`,
        badge
      });
      await db.from('tasks').update({ reminded_at: now.toISOString() }).eq('id', t.id);
      if (sent) reminders++;
    }

    // 2) Resumo da manhã, uma vez por dia no horário escolhido
    const local = localParts(now, tz);
    if (prof.morning_enabled !== false && local.time >= (prof.morning_time || '07:30')
      && prof.last_morning_on !== local.date && (sum.late || sum.today)) {
      const parts = [];
      if (sum.today) parts.push(`${sum.today} para hoje`);
      if (sum.late) parts.push(`${sum.late} ${sum.late === 1 ? 'atrasada' : 'atrasadas'}`);
      const first = sum.first ? ` Comece por: ${sum.first.title}` : '';
      await sendToUser(db, keys, subsByUser[uid], {
        title: 'Seu dia',
        body: `${parts.join(', ')}.${first}`,
        tag: 'resumo-manha', url: '/', badge
      });
      await db.from('profiles').upsert({ user_id: uid, tz, last_morning_on: local.date }, { onConflict: 'user_id' });
      mornings++;
    } else if (prof.morning_enabled !== false && local.time >= (prof.morning_time || '07:30') && prof.last_morning_on !== local.date) {
      // nada para hoje: marca o dia para não verificar de novo
      await db.from('profiles').upsert({ user_id: uid, tz, last_morning_on: local.date }, { onConflict: 'user_id' });
    }
  }

  return res.status(200).json({ ok: true, users: userIds.length, reminders, mornings });
}
