import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { bucketize } from '../lib/dates';
import TaskRow from '../components/TaskRow';
import { IconBack, IconEdit, IconPlus } from '../components/Icons';

export default function DemandDetail({ demandId, onBack, onOpenTask, onNewTask, onEdit }) {
  const { demandById, tasks } = useStore();
  const demand = demandId ? demandById[demandId] : null;
  const [showDone, setShowDone] = useState(false);

  const mine = useMemo(() => tasks.filter((t) => (demandId ? t.demand_id === demandId : !t.demand_id) && t.status !== 'inbox'), [tasks, demandId]);
  const b = useMemo(() => bucketize(mine), [mine]);
  const open = [...b.late, ...b.today, ...b.next, ...b.later];
  const done = mine.filter((t) => t.status === 'done').sort((a, c) => new Date(c.completed_at) - new Date(a.completed_at));
  const name = demand ? demand.name : 'Sem demanda';
  const color = demand ? demand.color : 'var(--muted)';

  return (
    <div className="screen" style={{ '--c': color }}>
      <header className="detail-head">
        <button type="button" className="icon-btn" aria-label="Voltar" onClick={onBack}><IconBack /></button>
        {demand && <button type="button" className="icon-btn" aria-label="Editar demanda" onClick={() => onEdit(demand)}><IconEdit /></button>}
      </header>
      <div className="detail-title">
        <span className="dot dot-xl" />
        <h1 className="display">{name}</h1>
      </div>
      {demand?.description && <p className="lede">{demand.description}</p>}

      <button type="button" className="add-row" onClick={() => onNewTask({ demand_id: demandId })}>
        <span className="add-icon"><IconPlus size={16} /></span>Adicionar item em {name}
      </button>

      {open.length > 0 && (
        <section className="section">
          <h2 className="section-title tone-muted">Com prazo <span className="count">{open.length}</span></h2>
          <div className="card list">{open.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpenTask} hideDemand />)}</div>
        </section>
      )}
      {b.nodate.length > 0 && (
        <section className="section">
          <h2 className="section-title tone-muted">Sem data <span className="count">{b.nodate.length}</span></h2>
          <div className="card list">{b.nodate.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpenTask} hideDemand />)}</div>
        </section>
      )}
      {!open.length && !b.nodate.length && (
        <div className="empty small"><p>Nenhum item aberto nesta demanda.</p></div>
      )}
      {done.length > 0 && (
        <section className="section">
          <button type="button" className="section-title as-btn tone-muted" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            Concluídas <span className="count">{done.length}</span><span className={`caret${showDone ? ' up' : ''}`} aria-hidden="true">›</span>
          </button>
          {showDone && <div className="card list">{done.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpenTask} hideDemand />)}</div>}
        </section>
      )}
    </div>
  );
}
