// POST /api/capture
// Recebe texto ou áudio do app, transcreve e separa em itens classificados por demanda.
import { getUser } from './_lib/server.js';
import { MAX_TEXT, classify, friendly, transcribe } from './_lib/ai.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST' }); }
  try {
    const user = await getUser(req);
    if (!user?.id) return res.status(401).json({ error: 'Faça login novamente.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const demands = Array.isArray(body.demands)
      ? body.demands.slice(0, 50).map((d) => ({
        id: String(d.id), name: String(d.name || '').slice(0, 60),
        description: String(d.description || '').slice(0, 300),
        keywords: Array.isArray(d.keywords) ? d.keywords.slice(0, 30).map((k) => String(k).slice(0, 40)) : []
      }))
      : [];

    let transcript = typeof body.text === 'string' ? body.text.trim() : '';
    if (!transcript && body.audio) transcript = await transcribe(body.audio, body.mime);
    if (!transcript) return res.status(200).json({ transcript: '', items: [] });
    transcript = transcript.slice(0, MAX_TEXT);

    const nowLocal = String(body.nowLocal || '').slice(0, 40) || new Date().toISOString();
    const weekday = String(body.weekday || '').slice(0, 20);
    let items = [];
    try { items = await classify({ text: transcript, demands, nowLocal, weekday }); }
    catch (e) {
      console.error('classify', e);
      return res.status(200).json({ transcript, items: [], error: friendly(e) });
    }
    return res.status(200).json({ transcript, items });
  } catch (e) {
    console.error(e);
    return res.status(e.code === 'too_big' ? 413 : 500).json({ error: friendly(e) });
  }
}
