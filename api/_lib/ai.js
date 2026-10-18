// IA compartilhada: transcrição (OpenAI) e classificação em itens (Claude)
import { clean } from './server.js';

export const MAX_TEXT = 8000;
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

export async function transcribe(input, mime, filename) {
  const key = clean(process.env.OPENAI_API_KEY);
  if (!key) throw Object.assign(new Error('OPENAI_API_KEY ausente'), { code: 'config' });
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'base64');
  if (buf.length > MAX_AUDIO_BYTES) throw Object.assign(new Error('Áudio muito longo'), { code: 'too_big' });
  let type = (mime || 'audio/mp4').split(';')[0].toLowerCase();
  const fext = (filename || '').toLowerCase().split('.').pop();
  // WhatsApp envia .opus (ogg/opus); a OpenAI aceita como .ogg
  if (fext === 'opus' || type.includes('opus')) type = 'audio/ogg';
  const ext = type.includes('webm') ? 'webm' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav'
    : type.includes('mpeg') || fext === 'mp3' ? 'mp3' : ['m4a', 'mp4', 'aac', 'caf'].includes(fext) ? 'm4a' : 'm4a';

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
            demand_id: { type: 'string', description: 'id de uma das demandas listadas, ou string vazia se nenhuma se aplica com segurança.' },
            kind: { type: 'string', enum: ['fazer', 'falar', 'lembrar'] },
            due_date: { type: 'string', description: 'Vazio se não houver. Prazo no formato AAAA-MM-DD, apenas se o usuário indicou data ou dia.' },
            due_time: { type: 'string', description: 'Vazio se não houver. Horário HH:MM, apenas se o usuário indicou horário.' },
            remind_at: { type: 'string', description: 'Vazio se não houver. AAAA-MM-DDTHH:MM se o usuário pediu explicitamente para ser lembrado em um momento.' },
            notes: { type: 'string', description: 'Vazio se não houver. Detalhes úteis ditos pelo usuário que não cabem no título (pessoas, valores, contexto).' },
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
5. Demanda: escolha a demanda cujo nome, descrição ou palavras-chave combinam com o item. Se não houver correspondência clara, use string vazia e confidence "baixa". Nunca invente ids.
6. Datas: converta expressões relativas ("amanhã", "terça", "semana que vem", "fim do mês") para datas reais a partir de agora. "Semana que vem" sem dia = segunda-feira seguinte. Dia da semana sem "que vem" = a próxima ocorrência desse dia. Sem menção de data, deixe vazio.
7. Horário só quando dito ("às 3 da tarde" = 15:00). "De manhã" sem hora = 09:00; "à tarde" = 14:00; "à noite" = 19:00.
8. remind_at só quando a pessoa pede para ser lembrada em um momento específico ("me lembra amanhã às 8").
9. Ignore hesitações, repetições e palavras de preenchimento da fala.
10. Se a entrada não contém nenhuma demanda, retorne items vazio.`;
}

export async function classify({ text, demands, nowLocal, weekday }) {
  const key = clean(process.env.ANTHROPIC_API_KEY);
  if (!key) throw Object.assign(new Error('ANTHROPIC_API_KEY ausente'), { code: 'config' });
  const models = [...new Set([ANTHROPIC_MODEL, 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-4-5'])];
  const body = (model) => JSON.stringify({
    model,
    max_tokens: 2000,
    temperature: 0,
    system: systemPrompt({ demands, nowLocal, weekday }),
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: `<entrada>\n${text}\n</entrada>` }]
  });
  let j; let lastErr;
  outer: for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: body(model)
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok) { j = res; break outer; }
      lastErr = Object.assign(new Error(res?.error?.message || `Anthropic ${r.status}`), { status: r.status, provider: 'Anthropic', type: res?.error?.type, model });
      console.error('anthropic', model, r.status, res?.error);
      if (r.status === 529 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 1200)); continue; } // sobrecarga: tenta de novo
      if (r.status === 404 || (r.status === 400 && /model/i.test(lastErr.message))) continue outer; // modelo indisponível: próximo
      throw lastErr; // chave, crédito, requisição: não adianta repetir
    }
  }
  if (!j) throw lastErr || new Error('Anthropic sem resposta');
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

export function friendly(e) {
  const who = e.provider ? ` (${e.provider})` : '';
  const m = (e.message || '').toLowerCase();
  if (e.code === 'config') return 'Chave de IA não configurada na Vercel.';
  if (e.code === 'too_big') return 'Áudio muito longo. Grave até 3 minutos.';
  if (e.status === 401 || e.status === 403) return `Chave de IA inválida${who}. Confira na Vercel.`;
  if (e.status === 429 || m.includes('credit') || m.includes('quota') || m.includes('billing')) return `Crédito ou limite esgotado${who}. Adicione crédito na conta.`;
  if (e.status === 529 || e.status >= 500) return `O serviço de IA${who} está sobrecarregado. Tente de novo em instantes.`;
  const detail = (e.message || '').replace(/\s+/g, ' ').slice(0, 160);
  return `Não consegui processar agora${who}.${detail ? ` Detalhe: ${detail}` : ''}`;
}
