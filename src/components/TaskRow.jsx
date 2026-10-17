import { useStore } from '../lib/store';
import { dueLabel, isLate, reminderLabel } from '../lib/dates';
import { IconBell, IconCheck, IconChat, IconClock, IconMic } from './Icons';

export const KIND_LABEL = { fazer: 'Fazer', falar: 'Falar com', lembrar: 'Lembrar' };

export function DemandChip({ demand }) {
  if (!demand) return <span className="chip chip-none">Sem demanda</span>;
  return (
    <span className="chip" style={{ '--c': demand.color }}>
      <span className="dot" />{demand.name}
    </span>
  );
}

export default function TaskRow({ task, onOpen, hideDemand }) {
  const { demandById, toggleDone } = useStore();
  const done = task.status === 'done';
  const late = isLate(task);
  const demand = demandById[task.demand_id];
  const due = dueLabel(task);

  return (
    <div className={`task-row${done ? ' is-done' : ''}`}>
      <button
        type="button"
        className={`check${late ? ' is-late' : ''}`}
        aria-label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
        aria-pressed={done}
        onClick={() => toggleDone(task)}
      >
        <span className="check-box">{done && <IconCheck />}</span>
      </button>
      <button type="button" className="task-body" onClick={() => onOpen(task)}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {!hideDemand && <DemandChip demand={demand} />}
          {task.kind !== 'fazer' && <span>{KIND_LABEL[task.kind]}</span>}
          {due && (
            <span className={`meta-due${late ? ' is-late' : ''}`}><IconClock />{due}</span>
          )}
          {task.remind_at && !done && (
            <span className="meta-due"><IconBell />{reminderLabel(task.remind_at)}</span>
          )}
          {task.source === 'whatsapp' && <span className="badge"><IconChat size={11} />WhatsApp</span>}
          {task.source === 'voz' && <span className="badge"><IconMic size={11} />Voz</span>}
        </span>
      </button>
    </div>
  );
}
