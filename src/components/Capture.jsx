import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { MAX_SECONDS, blobToBase64, defaultReminder, itemToTask, pickMime, sendCapture } from '../lib/capture';
import { dueLabel, reminderLabel } from '../lib/dates';
import { IconCheck, IconClose, IconEdit, IconMic } from './Icons';

const BARS = 28;
const KINDS = [['fazer', 'Fazer'], ['falar', 'Falar com'], ['lembrar', 'Lembrar']];
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let seq = 0;

function micMessage(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
    return 'O microfone está bloqueado para o app. No iPhone: Ajustes › Apps › Safari › Microfone › Permitir. Depois feche e abra o app.';
  }
  if (e && e.name === 'NotFoundError') return 'Nenhum microfone encontrado neste aparelho.';
  return 'Não consegui acessar o microfone. Você pode escrever em vez de falar.';
}

function ItemCard({ item, demands, onChange }) {
  const [edit, setEdit] = useState(false);
  const set = (patch) => onChange({ ...item, ...patch });
  const fakeTask = { due_at: item.due_date ? `${item.due_date}T${item.due_time || '12:00'}` : null, due_all_day: !item.due_time, status: 'open' };
  const due = item.due_date ? dueLabel({ ...fakeTask, due_at: new Date(fakeTask.due_at).toISOString() }) : 'Sem prazo';
  const rem = item.reminderOff ? null : defaultReminder(item);

  return (
    <article className={`cap-card${item.include ? '' : ' is-off'}`}>
      <div className="cap-card-top">
        <button type="button" className="check" aria-pressed={item.include} aria-label={item.include ? 'Não incluir este item' : 'Incluir este item'} onClick={() => set({ include: !item.include })}>
          <span className="check-box cap-check">{item.include && <IconCheck />}</span>
        </button>
        <label className="sr-only" htmlFor={`t-${item.key}`}>Título</label>
        <textarea id={`t-${item.key}`} className="cap-title" rows={2} value={item.title} onChange={(e) => set({ title: e.target.value })} />
      </div>

      {item.include && (
        <div className="cap-card-body">
          <div className="chips-scroll">
            <button type="button" className={`pill pill-sm${item.demand_id === null ? ' is-on' : ''}`} onClick={() => set({ demand_id: null })}>Nenhuma</button>
            {demands.map((d) => (
              <button key={d.id} type="button" className={`pill pill-sm${item.demand_id === d.id ? ' is-on' : ''}`} style={{ '--c': d.color }} onClick={() => set({ demand_id: d.id, confidence: 'alta' })}>
                <span className="dot" />{d.name}
              </button>
            ))}
          </div>
          {item.confidence === 'baixa' && <div className="hint tone-warn">Confira a demanda deste item.</div>}

          <div className="segmented seg-sm" role="group" aria-label="Tipo">
            {KINDS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={item.kind === id} className={item.kind === id ? 'is-on' : ''} onClick={() => set({ kind: id })}>{label}</button>
            ))}
          </div>

          <button type="button" className="cap-when" aria-expanded={edit} onClick={() => setEdit(!edit)}>
            <span><strong>{due}</strong>{rem ? ` · aviso ${reminderLabel(rem)}` : item.due_date ? ' · sem aviso' : ''}</span>
            <IconEdit size={16} />
          </button>
          {edit && (
            <div className="cap-edit">
              <div className="inline-row">
                <label className="muted" htmlFor={`d-${item.key}`}>Data</label>
                <input id={`d-${item.key}`} className="input input-time" type="date" value={item.due_date || ''} onChange={(e) => set({ due_date: e.target.value || null })} />
                <label className="muted" htmlFor={`h-${item.key}`}>Hora</label>
                <input id={`h-${item.key}`} className="input input-time" type="time" value={item.due_time || ''} onChange={(e) => set({ due_time: e.target.value || null })} />
              </div>
              {item.due_date && (
                <label className="toggle-row">
                  <input type="checkbox" checked={!item.reminderOff} onChange={(e) => set({ reminderOff: !e.target.checked })} />
                  Avisar {item.due_time ? 'no horário' : 'às 9:00 do dia'}
                </label>
              )}
            </div>
          )}
          {item.notes && <div className="cap-notes">{item.notes}</div>}
        </div>
      )}
    </article>
  );
}

export default function Capture({ onClose, onManual, demandHint }) {
  const { cloud, activeDemands, addTask, showToast } = useStore();
  const [phase, setPhase] = useState('idle'); // idle | recording | typing | processing | review | empty | error
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState(() => Array(BARS).fill(0.08));
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState([]);
  const [source, setSource] = useState('voz');
  const [showHeard, setShowHeard] = useState(false);

  const recRef = useRef(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const cancelRef = useRef(false);
  const lastPayload = useRef(null);
  const textRef = useRef(null);

  const cleanup = () => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close?.().catch(() => {});
    streamRef.current = null; ctxRef.current = null;
  };
  useEffect(() => () => { cancelRef.current = true; try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch { /* */ } cleanup(); }, []);
  useEffect(() => { document.body.classList.add('no-scroll'); return () => document.body.classList.remove('no-scroll'); }, []);
  useEffect(() => { if (phase === 'typing') setTimeout(() => textRef.current?.focus(), 100); }, [phase]);

  const process = async (payload) => {
    lastPayload.current = payload;
    setPhase('processing'); setError('');
    setLabel(payload.audio ? 'Transcrevendo…' : 'Organizando…');
    const t = setTimeout(() => setLabel('Organizando…'), 3500);
    try {
      const res = await sendCapture({ ...payload, demands: activeDemands });
      clearTimeout(t);
      setTranscript(res.transcript || '');
      if (res.error) { setText(res.transcript || payload.text || ''); setError(res.error); setPhase('error'); return; }
      const list = (res.items || []).map((i) => ({
        ...i, key: ++seq, include: true,
        demand_id: i.demand_id ?? demandHint ?? null
      }));
      setItems(list);
      if (!list.length) { setText(res.transcript || payload.text || ''); setPhase(res.transcript ? 'empty' : 'error'); if (!res.transcript) setError('Não ouvi nada. Tente falar mais perto do microfone.'); }
      else setPhase('review');
    } catch (e) {
      clearTimeout(t);
      setError(e.message); setPhase('error');
    }
  };

  const startRec = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador não grava áudio. Use o Safari atualizado ou escreva.'); setPhase('error'); return;
    }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { setError(micMessage(e)); setPhase('error'); return; }
    streamRef.current = stream;
    cancelRef.current = false;
    const mime = pickMime();
    let rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch { rec = new MediaRecorder(stream); }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const type = rec.mimeType || mime || 'audio/mp4';
      cleanup();
      if (cancelRef.current) return;
      const blob = new Blob(chunks, { type });
      if (blob.size < 1200) { setError('A gravação ficou muito curta. Toque e fale por alguns segundos.'); setPhase('error'); return; }
      const audio = await blobToBase64(blob);
      setSource('voz');
      process({ audio, mime: type });
    };
    recRef.current = rec;
    rec.start(250);
    setSeconds(0); setPhase('recording');
    if (navigator.vibrate) navigator.vibrate(10);

    const started = Date.now();
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stopRec();
    }, 250);

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx(); ctxRef.current = ctx;
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      let last = 0;
      const tick = (ts) => {
        rafRef.current = requestAnimationFrame(tick);
        if (ts - last < 70) return; last = ts;
        an.getByteTimeDomainData(data);
        let sum = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
        setLevels((p) => [...p.slice(1), Math.max(0.08, rms)]);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* sem visualização, a gravação continua */ }
  };

  const stopRec = () => {
    clearInterval(timerRef.current);
    try { if (recRef.current?.state === 'recording') recRef.current.stop(); } catch { /* */ }
  };
  const cancelRec = () => { cancelRef.current = true; stopRec(); setPhase('idle'); };

  const submitText = () => {
    const t = text.trim(); if (!t) return;
    setSource('texto');
    process({ text: t });
  };

  const save = (status) => {
    const chosen = items.filter((i) => i.include && i.title.trim());
    chosen.forEach((i) => addTask({ ...itemToTask(i, { transcript, source }), status }));
    showToast(status === 'inbox'
      ? `${chosen.length} ${chosen.length === 1 ? 'item guardado' : 'itens guardados'} na Entrada`
      : `${chosen.length} ${chosen.length === 1 ? 'item salvo' : 'itens salvos'}`);
    onClose();
  };

  const saveRaw = () => {
    const t = (text || transcript).trim(); if (!t) return;
    addTask({ title: t.slice(0, 300), raw_input: t, source, status: 'inbox' });
    showToast('Guardado na Entrada');
    onClose();
  };

  const included = items.filter((i) => i.include).length;

  return (
    <div className="capture" role="dialog" aria-modal="true" aria-label="Capturar">
      <header className="capture-head">
        <h2 className="display cap-h">{phase === 'review' ? 'Confira' : 'Capturar'}</h2>
        <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => { cancelRef.current = true; stopRec(); onClose(); }}><IconClose /></button>
      </header>

      <div className="capture-body">
        {phase === 'idle' && (
          <div className="cap-center">
            {cloud ? (
              <>
                <button type="button" className="mic-btn" aria-label="Começar a falar" onClick={startRec}><IconMic size={46} /></button>
                <div className="cap-lead">
                  <div className="cap-lead-title">Fale o que precisa fazer</div>
                  <p>Pode misturar vários assuntos. Eu separo cada item e sugiro a demanda, o prazo e o aviso.</p>
                </div>
                <div className="cap-actions">
                  <button type="button" className="btn btn-soft" onClick={() => setPhase('typing')}>Escrever em vez de falar</button>
                  <button type="button" className="link-btn center" onClick={onManual}>Preencher formulário</button>
                </div>
              </>
            ) : (
              <div className="cap-lead">
                <div className="cap-lead-title">Captura inteligente indisponível</div>
                <p>Ela funciona quando o app está conectado à sua conta. Neste modo, use o formulário.</p>
                <button type="button" className="btn btn-primary" onClick={onManual}>Abrir formulário</button>
              </div>
            )}
          </div>
        )}

        {phase === 'recording' && (
          <div className="cap-center">
            <div className="wave" aria-hidden="true">
              {levels.map((l, i) => <span key={i} style={{ height: `${Math.round(l * 100)}%` }} />)}
            </div>
            <div className="rec-time" aria-live="off"><span className="rec-dot" />{fmt(seconds)} <span className="muted">/ {fmt(MAX_SECONDS)}</span></div>
            <button type="button" className="mic-btn is-rec" aria-label="Terminei de falar" onClick={stopRec}><span className="stop-sq" /></button>
            <p className="muted center">Toque quando terminar</p>
            <button type="button" className="link-btn center" onClick={cancelRec}>Cancelar gravação</button>
          </div>
        )}

        {phase === 'typing' && (
          <div className="cap-type">
            <label className="field-label" htmlFor="cap-text">Escreva livremente</label>
            <textarea id="cap-text" ref={textRef} className="input cap-textarea" rows={7} placeholder="Ex.: mandar o relatório do Nexo até terça, ligar para o fornecedor amanhã às 10 e marcar o médico" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="foot-row">
              <button type="button" className="btn btn-ghost" onClick={() => setPhase('idle')}>Voltar</button>
              <button type="button" className="btn btn-primary btn-grow" disabled={!text.trim()} onClick={submitText}>Organizar</button>
            </div>
          </div>
        )}

        {phase === 'processing' && (
          <div className="cap-center">
            <div className="spinner spinner-lg" />
            <div className="cap-lead-title" aria-live="polite">{label}</div>
          </div>
        )}

        {phase === 'review' && (
          <div className="cap-review">
            {transcript && (
              <div className="heard">
                <button type="button" className="heard-btn" aria-expanded={showHeard} onClick={() => setShowHeard(!showHeard)}>
                  {source === 'voz' ? 'O que eu ouvi' : 'O que você escreveu'} <span className={`caret${showHeard ? ' up' : ''}`} aria-hidden="true">›</span>
                </button>
                {showHeard && <div className="quote">“{transcript}”</div>}
              </div>
            )}
            <div className="muted cap-count">{items.length === 1 ? 'Encontrei 1 item.' : `Encontrei ${items.length} itens.`} Ajuste o que precisar.</div>
            {items.map((it) => (
              <ItemCard key={it.key} item={it} demands={activeDemands} onChange={(n) => setItems((p) => p.map((x) => (x.key === n.key ? n : x)))} />
            ))}
          </div>
        )}

        {phase === 'empty' && (
          <div className="cap-type">
            <div className="cap-lead-title">Não encontrei uma tarefa clara</div>
            <p className="muted">Você pode ajustar o texto e organizar de novo, ou guardar como está na Entrada.</p>
            <textarea className="input cap-textarea" rows={5} aria-label="Texto capturado" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="foot-row">
              <button type="button" className="btn btn-ghost btn-grow" onClick={saveRaw}>Guardar na Entrada</button>
              <button type="button" className="btn btn-primary btn-grow" disabled={!text.trim()} onClick={submitText}>Organizar de novo</button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="cap-type">
            <div className="cap-lead-title">Algo não deu certo</div>
            <p className="muted" role="alert">{error}</p>
            <div className="foot-row">
              {lastPayload.current && <button type="button" className="btn btn-primary btn-grow" onClick={() => process(lastPayload.current)}>Tentar de novo</button>}
              <button type="button" className="btn btn-ghost btn-grow" onClick={() => { setError(''); setPhase('idle'); }}>Voltar</button>
            </div>
            {(transcript || text) && <button type="button" className="link-btn" onClick={saveRaw}>Guardar o texto na Entrada</button>}
            <button type="button" className="link-btn" onClick={onManual}>Preencher formulário</button>
          </div>
        )}
      </div>

      {phase === 'review' && (
        <footer className="capture-foot">
          <button type="button" className="btn btn-ghost" onClick={() => save('inbox')} disabled={!included}>Revisar depois</button>
          <button type="button" className="btn btn-primary btn-grow" onClick={() => save('open')} disabled={!included}>
            {included === 1 ? 'Salvar 1 item' : `Salvar ${included} itens`}
          </button>
        </footer>
      )}
    </div>
  );
}
