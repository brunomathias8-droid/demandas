// POST /api/inbox — recebe mensagens e áudios compartilhados do WhatsApp (via Atalho do iPhone).
// Autenticação: código pessoal gerado em Ajustes (Authorization: Bearer <código> ou ?token=).
// Corpo: formulário (campo com arquivo ou texto) ou JSON { text }.
// Resultado: itens criados na Entrada, já classificados; resposta em texto para o Atalho mostrar.
import crypto from 'node:crypto';
import busboy from 'busboy';
import { adminClient, localParts, zonedToISO } from './_lib/server.js';
import { MAX_TEXT, classify, friendly, transcribe } from './_lib/ai.js';

const WEEK = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEK_S = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function reply(res, status, text) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(status).send(text);
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const out = { fields: [], files: [] };
    let bb;
    try { bb = busboy({ headers: req.headers, limits: { fileSize: 8 * 1024 * 1024, files: 4, fields: 10 } }); }
    catch (e) { reject(e); return; }
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => out.files.push({ name, filename: info.filename || '', mime: info.mimeType || '', buf: Buffer.concat(chunks), truncated: stream.truncated }));
    });
    bb.on('field', (_n, v) => { if (v && String(v).trim()) out.fields.push(String(v)); });
    bb.on('close', () => resolve(out));
    bb.on('error', reject);
    req.pipe(bb);
  });
}

export async function readInput(req) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.startsWith('multipart/form-data')) {
    const { fields, files } = await parseMultipart(req);
    const texts = [...fields];
    let audio = null;
    for (const f of files) {
      const isText = f.mime.startsWith('text/') || /\.(txt|text)$/i.test(f.filename);
      if (isText) texts.push(f.buf.toString('utf8'));
      else if (!audio && f.buf.length) audio = f;
    }
    return { text: texts.join('\n').trim(), audio };
  }
  const b = req.body;
  if (typeof b === 'string') return { text: b.trim(), audio: null };
  if (Buffer.isBuffer(b)) return { text: '', audio: { buf: b, mime: ct, filename: '' } };
  return { text: String(b?.text || '').trim(), audio: null };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, 'Use POST.');
  let db;
  try { db = adminClient(); } catch { return reply(res, 500, 'Servidor sem configuração (SUPABASE_SERVICE_ROLE_KEY).'); }

  const url = new URL(req.url, 'http://x');
  const auth = req.headers.authorization || '';
  const token = (auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token') || '').trim();
  if (!token) return reply(res, 401, 'Código do atalho ausente. Gere em Demandas › Ajustes › WhatsApp.');
  const { data: tok } = await db.from('inbox_tokens').select('user_id').eq('token_hash', sha256(token)).maybeSingle();
  if (!tok?.user_id) return reply(res, 401, 'Código do atalho inválido. Gere um novo em Demandas › Ajustes › WhatsApp.');
  const uid = tok.user_id;

  try {
    const input = await readInput(req);
    if (input.audio?.truncated) return reply(res, 413, 'Áudio muito longo. Envie áudios de até 3 minutos.');
    let transcript = input.text;
    let source = 'whatsapp';
    if (!transcript && input.audio) transcript = await transcribe(input.audio.buf, input.audio.mime, input.audio.filename);
    if (!transcript) return reply(res, 400, 'Não recebi texto nem áudio. Compartilhe uma mensagem ou um áudio.');
    transcript = transcript.slice(0, MAX_TEXT);

    const [{ data: prof }, { data: demands }] = await Promise.all([
      db.from('profiles').select('tz').eq('user_id', uid).maybeSingle(),
      db.from('demands').select('id,name,description,keywords').eq('user_id', uid).eq('archived', false)
    ]);
    const tz = prof?.tz || 'America/Fortaleza';
    const now = new Date();
    const lp = localParts(now, tz);
    const [y, m, d] = lp.date.split('-');
    const weekdayIdx = new Date(Date.UTC(+y, +m - 1, +d)).getUTCDay();

    let items = [];
    try {
      items = await classify({ text: transcript, demands: demands || [], nowLocal: `${d}/${m}/${y} ${lp.time}`, weekday: WEEK[weekdayIdx] });
    } catch (e) {
      console.error('classify', e);
      items = [];
    }

    const nameOf = Object.fromEntries((demands || []).map((x) => [x.id, x.name]));
    const rows = (items.length ? items : [{ title: transcript.slice(0, 300), demand_id: null, kind: 'fazer', due_date: null, due_time: null, remind_at: null, notes: null }])
      .map((i) => {
        const due = i.due_date ? zonedToISO(i.due_date, i.due_time, tz) : null;
        let remind = null;
        if (i.remind_at) { const [rd, rt] = i.remind_at.split('T'); remind = zonedToISO(rd, rt, tz); }
        else if (i.due_date) { const r = zonedToISO(i.due_date, i.due_time || '09:00', tz); if (new Date(r) > now) remind = r; }
        return {
          user_id: uid, title: i.title, demand_id: i.demand_id, kind: i.kind, notes: i.notes,
          status: 'inbox', source, raw_input: transcript,
          due_at: due, due_all_day: !i.due_time, remind_at: remind
        };
      });

    const { error } = await db.from('tasks').insert(rows);
    if (error) { console.error(error); return reply(res, 500, 'Não consegui salvar na Entrada. Tente de novo.'); }

    const lines = rows.map((r) => {
      const bits = [];
      if (r.demand_id) bits.push(nameOf[r.demand_id]);
      if (r.due_at) {
        const p = localParts(new Date(r.due_at), tz);
        const [yy, mm, dd] = p.date.split('-');
        const wd = WEEK_S[new Date(Date.UTC(+yy, +mm - 1, +dd)).getUTCDay()];
        bits.push(`${wd} ${+dd}/${+mm}${r.due_all_day ? '' : ` ${p.time}`}`);
      }
      return `• ${r.title}${bits.length ? ` (${bits.join(', ')})` : ''}`;
    });
    const head = rows.length === 1 ? 'Na Entrada do Demandas:' : `${rows.length} itens na Entrada do Demandas:`;
    return reply(res, 200, `${head}\n${lines.join('\n')}`);
  } catch (e) {
    console.error(e);
    return reply(res, e.code === 'too_big' ? 413 : 500, friendly(e));
  }
}
