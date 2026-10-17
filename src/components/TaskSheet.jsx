import { useEffect, useMemo, useRef, useState } from 'react';
import Sheet from './Sheet';
import { useStore } from '../lib/store';
import { addDays, nextWeekday, startOfDay, toDateInput, toISO, toTimeInput, weekdayShort, reminderLabel } from '../lib/dates';
import { IconTrash } from './Icons';

const KINDS = [
  { id: 'fazer', label: 'Fazer' },
  { id: 'falar', label: 'Falar com' },
  { id: 'lembrar', label: 'Lembrar' }
];

function toLocalDT(iso) {
  return iso ? `${toDateInput(iso)}T${toTimeInput(iso)}` : '';
}

export default function TaskSheet({ task, defaults = {}, onClose }) {
  const { activeDemands, addTask, updateTask, deleteTask, showToast } = useStore();
  const editing = !!task;
  const isInbox = task?.status === 'inbox';
  const src = task || defaults;

  const [title, setTitle] = useState(src.title || '');
  const [notes, setNotes] = useState(src.notes || '');
  const [demandId, setDemandId] = useState(src.demand_id ?? null);
  const [kind, setKind] = useState(src.kind || 'fazer');
  const [dueDate, setDueDate] = useState(toDateInput(src.due_at));
  const [dueTime, setDueTime] = useState(src.due_at && src.due_all_day === false ? toTimeInput(src.due_at) : '');
  const [pickDate, setPickDate] = useState(false);
  const [remMode, setRemMode] = useState(src.remind_at ? 'custom' : 'none');
  const [remCustom, setRemCustom] = useState(toLocalDT(src.remind_at));
  const [showNotes, setShowNotes] = useState(!!src.notes);
  const titleRef = useRef(null);

  useEffect(() => { if (!editing) setTimeout(() => titleRef.current?.focus(), 250); }, [editing]);
  useEffect(() => {
    const el = titleRef.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const today = startOfDay();
  const presets = useMemo(() => {
    const mon = nextWeekday(1);
    return [
      { id: 'none', label: 'Sem data', value: '' },
      { id: 'today', label: 'Hoje', value: toDateInput(today) },
      { id: 'tomorrow', label: 'Amanhã', value: toDateInput(addDays(today, 1)) },
      { id: 'mon', label: weekdayShort(mon), value: toDateInput(mon) }
    ];
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const activePreset = presets.find((p) => p.value === dueDate && !pickDate)?.id;

  const reminderISO = () => {
    if (remMode === 'none') return null;
    if (remMode === 'custom') return remCustom ? new Date(remCustom).toISOString() : null;
    if (!dueDate) return null;
    if (remMode === 'at') return toISO(dueDate, dueTime || '09:00');
    if (remMode === 'hour') { const d = new Date(toISO(dueDate, dueTime)); d.setHours(d.getHours() - 1); return d.toISOString(); }
    if (remMode === 'eve') { const d = new Date(toISO(dueDate, '18:00')); d.setDate(d.getDate() - 1); return d.toISOString(); }
    return null;
  };

  const remOptions = [
    { id: 'none', label: 'Sem lembrete', show: true },
    { id: 'at', label: dueTime ? 'No horário' : 'No dia, 9:00', show: !!dueDate },
    { id: 'hour', label: '1 h antes', show: !!dueDate && !!dueTime },
    { id: 'eve', label: 'Véspera, 18:00', show: !!dueDate },
    { id: 'custom', label: 'Escolher', show: true }
  ].filter((o) => o.show);

  useEffect(() => {
    if (!remOptions.find((o) => o.id === remMode)) setRemMode('none');
  }, [dueDate, dueTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (confirm) => {
    const t = title.trim();
    if (!t) { titleRef.current?.focus(); return; }
    const data = {
      title: t,
      notes: notes.trim() || null,
      demand_id: demandId,
      kind,
      due_at: dueDate ? toISO(dueDate, dueTime || null) : null,
      due_all_day: !dueTime,
      remind_at: reminderISO()
    };
    if (editing) {
      if (confirm) data.status = 'open';
      updateTask(task.id, data);
      showToast(confirm ? 'Confirmado' : 'Salvo');
    } else {
      addTask({ ...data, status: 'open', source: defaults.source || 'texto' });
      showToast('Adicionado');
    }
    onClose();
  };

  const onTitleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(isInbox); } };

  const rem = reminderISO();
  const footer = (
    <div className="foot-row">
      {editing && (
        <button type="button" className="btn btn-ghost btn-danger" aria-label="Excluir item" onClick={() => { deleteTask(task); onClose(); }}>
          <IconTrash />
        </button>
      )}
      <button type="button" className="btn btn-primary btn-grow" disabled={!title.trim()} onClick={() => save(isInbox)}>
        {isInbox ? 'Confirmar' : editing ? 'Salvar' : 'Adicionar'}
      </button>
    </div>
  );

  return (
    <Sheet title={isInbox ? 'Confirmar item' : editing ? 'Editar item' : 'Novo item'} onClose={onClose} footer={footer}>
      {isInbox && task.raw_input && (
        <div className="quote">“{task.raw_input}”</div>
      )}
      <label className="sr-only" htmlFor="task-title">O que precisa ser feito</label>
      <textarea
        id="task-title"
        ref={titleRef}
        className="title-input"
        rows={1}
        placeholder="O que precisa ser feito?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onTitleKey}
      />

      <div className="field">
        <div className="field-label">Demanda</div>
        <div className="chips-scroll">
          <button type="button" className={`pill${demandId === null ? ' is-on' : ''}`} onClick={() => setDemandId(null)}>Nenhuma</button>
          {activeDemands.map((d) => (
            <button key={d.id} type="button" className={`pill${demandId === d.id ? ' is-on' : ''}`} style={{ '--c': d.color }} onClick={() => setDemandId(d.id)}>
              <span className="dot" />{d.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-label">Tipo</div>
        <div className="segmented" role="group" aria-label="Tipo">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} className={kind === k.id ? 'is-on' : ''} onClick={() => setKind(k.id)}>{k.label}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-label">Prazo</div>
        <div className="chips-wrap">
          {presets.map((p) => (
            <button key={p.id} type="button" className={`pill${activePreset === p.id ? ' is-on' : ''}`} onClick={() => { setPickDate(false); setDueDate(p.value); if (!p.value) setDueTime(''); }}>{p.label}</button>
          ))}
          <button type="button" className={`pill${pickDate || (dueDate && !activePreset) ? ' is-on' : ''}`} onClick={() => setPickDate(true)}>Outra data</button>
        </div>
        {(pickDate || (dueDate && !activePreset)) && (
          <input className="input" type="date" aria-label="Data do prazo" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        )}
        {dueDate && (
          <div className="inline-row">
            <label htmlFor="due-time" className="muted">Horário (opcional)</label>
            <input id="due-time" className="input input-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            {dueTime && <button type="button" className="link-btn" onClick={() => setDueTime('')}>Limpar</button>}
          </div>
        )}
      </div>

      <div className="field">
        <div className="field-label">Lembrete</div>
        <div className="chips-wrap">
          {remOptions.map((o) => (
            <button key={o.id} type="button" className={`pill${remMode === o.id ? ' is-on' : ''}`} onClick={() => setRemMode(o.id)}>{o.label}</button>
          ))}
        </div>
        {remMode === 'custom' && (
          <input className="input" type="datetime-local" aria-label="Data e hora do lembrete" value={remCustom} onChange={(e) => setRemCustom(e.target.value)} />
        )}
        {rem && <div className="hint">Aviso em: {reminderLabel(rem)}</div>}
      </div>

      {showNotes ? (
        <div className="field">
          <label className="field-label" htmlFor="task-notes">Notas</label>
          <textarea id="task-notes" className="input notes" rows={3} placeholder="Detalhes, contexto, com quem falar…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      ) : (
        <button type="button" className="link-btn" onClick={() => setShowNotes(true)}>+ Adicionar notas</button>
      )}
    </Sheet>
  );
}
