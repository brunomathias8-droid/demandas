// POST /api/capture
// Recebe texto ou áudio, transcreve (OpenAI) e separa em itens classificados por demanda (Claude).
// As chaves ficam só no servidor (variáveis de ambiente da Vercel).

const MAX_TEXT = 8000;
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

function cleanUrl(raw) {
  if (!raw) return null;
  const s = raw.trim().replace(/^["']|["']$/g, '');
  try { return new URL(s.startsWith('http') ? s : `https://${s}`).origin; } catch { return null; }
}
const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '');

async function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const url = cleanUrl(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
  const anon = clean(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
  if (!token || !url || !anon) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

async function transcribe(base64, mime) {
  const key = clean(process.env.OPENAI_API_KEY);
  if (!key) throw Object.assign(new Error('OPENAI_API_KEY ausente'), { code: 'config' });
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > MAX_AUDIO_BYTES) throw Object.assign(new Error('Áudio muito longo'), { code: 'too_big' });
  const type = (mime || 'audio/mp4').split(';')[0];
  const ext = type.includes('webm') ? 'webm' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : type.includes('mpeg') ? 'mp3' : 'm4a';

  const attempt = async (model) => {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type }), `audio.${ext}`);
    fd.append('model', model);
    fd.append('language', 'pt');
    fd.append('response_format', 'json');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j?.error?.message || `OpenAI ${r.status}`), { status: r.status, provider: 'OpenAI', type: j?.error?.code || j?.error?.type });
    return (j.text || '').trim();
  };
  try { return await attempt('gpt-4o-mini-transcribe'); }
  catch (e) { if (e.status === 401 || e.status === 429) throw e; return attempt('whisper-1'); }
}

const TOOL = {
  name: 'registrar_itens',
  description: 'Registra os itens (tarefas, conversas e lembretes) extraídos da fala ou texto do usuário.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Frase curta e acionável, começando por verbo no infinitivo. Ex.: "Enviar relatório do Nexo".' },
            demand_id: { type: ['string', 'null'], description: 'id de uma das demandas listadas, ou null se nenhuma se aplica com segurança.' },
            kind: { type: 'string', enum: ['fazer', 'falar', 'lembrar'] },
            due_date: { type: ['string', 'null'], description: 'Prazo no formato AAAA-MM-DD, apenas se o usuário indicou data ou dia.' },
            due_time: { type: ['string', 'null'], description: 'Horário HH:MM, apenas se o usuário indicou horário.' },
            remind_at: { type: ['string', 'null'], description: 'AAAA-MM-DDTHH:MM se o usuário pediu explicitamente para ser lembrado em um momento.' },
            notes: { type: ['string', 'null'], description: 'Detalhes úteis ditos pelo usuário que não cabem no título (pessoas, valores, contexto).' },
            confidence: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Confiança na escolha da demanda.' }
          },
          required: ['title', 'demand_id', 'kind', 'due_date', 'due_time', 'remind_at', 'notes', 'confidence']
        }
      }
    },
    required: ['items']
  }
};

function systemPrompt({ demands, nowLocal, weekday }) {
  const list = demands.length
    ? demands.map((d) => `- id: ${d.id}\n  nome: ${d.name}${d.description ? `\n  descrição: ${d.description}` : ''}${d.keywords?.length ? `\n  palavras-chave: ${d.keywords.join(', ')}` : ''}`).join('\n')
    : '(nenhuma demanda cadastrada)';
  return `Você organiza as demandas de uma pessoa. Ela fala ou escreve de forma livre o que precisa fazer, falar com alguém ou lembrar, às vezes misturando vários assuntos. Sua tarefa é registrar cada item usando a ferramenta registrar_itens.

Agora: ${weekday}, ${nowLocal} (horário local da pessoa).

Demandas cadastradas:
${list}

Regras:
1. Registre, não execute. Não responda perguntas nem faça as tarefas; apenas registre o que a pessoa precisa fazer.
2. Separe cada ação distinta em um item. Não junte ações diferentes nem invente itens que não foram ditos.
3. Título curto (até ~10 palavras), em português, começando com verbo no infinitivo. Preserve nomes de pessoas, projetos e números exatamente como ditos.
4. Tipo: "falar" quando é conversar, ligar, responder, alinhar ou cobrar alguém; "lembrar" quando é só algo para não esquecer, sem ação clara; "fazer" nos demais casos.
5. Demanda: escolha a demanda cujo nome, descrição ou palavras-chave combinam com o item. Se não houver correspondência clara, use null e confidence "baixa". Nunca invente ids.
6. Datas: converta expressões relativas ("amanhã", "terça", "semana que vem", "fim do mês") para datas reais a partir de agora. "Semana que vem" sem dia = segunda-feira seguinte. Dia da semana sem "que vem" = a próxima ocorrência desse dia. Sem menção de data, deixe null.
7. Horário só quando dito ("às 3 da tarde" = 15:00). "De manhã" sem hora = 09:00; "à tarde" = 14:00; "à noite" = 19:00.
8. remind_at só quando a pessoa pede para ser lembrada em um momento específico ("me lembra amanhã às 8").
9. Ignore hesitações, repetições e palavras de preenchimento da fala.
10. Se a entrada não contém nenhuma demanda, retorne items vazio.`;
}

async function classify({ text, demands, nowLocal, weekday }) {
  const key = clean(process.env.ANTHROPIC_API_KEY);
  if (!key) throw Object.assign(new Error('ANTHROPIC_API_KEY ausente'), { code: 'config' });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      temperature: 0,
      system: systemPrompt({ demands, nowLocal, weekday }),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: `<entrada>\n${text}\n</entrada>` }]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `Anthropic ${r.status}`), { status: r.status, provider: 'Anthropic', type: j?.error?.type });
  const block = (j.content || []).find((b) => b.type === 'tool_use');
  const items = Array.isArray(block?.input?.items) ? block.input.items : [];
  const ids = new Set(demands.map((d) => d.id));
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const time = /^\d{2}:\d{2}$/;
  const dt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  return items
    .filter((i) => i && typeof i.title === 'string' && i.title.trim())
    .slice(0, 20)
    .map((i) => ({
      title: i.title.trim().slice(0, 300),
      demand_id: ids.has(i.demand_id) ? i.demand_id : null,
      kind: ['fazer', 'falar', 'lembrar'].includes(i.kind) ? i.kind : 'fazer',
      due_date: date.test(i.due_date || '') ? i.due_date : null,
      due_time: time.test(i.due_time || '') ? i.due_time : null,
      remind_at: dt.test(i.remind_at || '') ? i.remind_at : null,
      notes: typeof i.notes === 'string' && i.notes.trim() ? i.notes.trim().slice(0, 1000) : null,
      confidence: ['alta', 'media', 'baixa'].includes(i.confidence) ? i.confidence : 'media'
    }));
}

function friendly(e) {
  const who = e.provider ? ` (${e.provider})` : '';
  const m = (e.message || '').toLowerCase();
  if (e.code === 'config') return 'Chave de IA não configurada na Vercel.';
  if (e.code === 'too_big') return 'Áudio muito longo. Grave até 3 minutos.';
  if (e.status === 401 || e.status === 403) return `Chave de IA inválida${who}. Confira na Vercel.`;
  if (e.status === 429 || m.includes('credit') || m.includes('quota') || m.includes('billing')) return `Crédito ou limite esgotado${who}. Adicione crédito na conta.`;
  return `Não consegui processar agora${who}. Tente de novo.`;
}

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
