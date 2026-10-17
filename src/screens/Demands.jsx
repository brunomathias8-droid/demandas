import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { bucketize, dueLabel } from '../lib/dates';
import { IconChevron, IconPlus } from '../components/Icons';

export default function Demands({ onOpenDemand, onNewDemand }) {
  const { activeDemands, tasks } = useStore();

  const stats = useMemo(() => {
    const m = {};
    for (const d of activeDemands) {
      const mine = tasks.filter((t) => t.demand_id === d.id);
      const open = mine.filter((t) => t.status === 'open');
      const done = mine.filter((t) => t.status === 'done').length;
      const b = bucketize(open);
      const next = b.late[0] || b.today[0] || b.next[0] || b.later[0] || b.nodate[0];
      m[d.id] = { open: open.length, late: b.late.length, done, next, pct: open.length + done ? Math.round((done / (open.length + done)) * 100) : 0 };
    }
    return m;
  }, [activeDemands, tasks]);

  const loose = tasks.filter((t) => t.status === 'open' && !t.demand_id).length;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="display">Demandas</h1>
        <button type="button" className="btn btn-soft" onClick={onNewDemand}><IconPlus size={16} />Nova</button>
      </header>
      <p className="lede">Cada assunto guarda o histórico do que você precisa fazer, falar e lembrar.</p>

      <div className="stack">
        {activeDemands.map((d) => {
          const s = stats[d.id];
          return (
            <button key={d.id} type="button" className="card demand-card" style={{ '--c': d.color }} onClick={() => onOpenDemand(d.id)}>
              <div className="demand-top">
                <span className="demand-badge"><span className="dot dot-lg" /></span>
                <span className="demand-info">
                  <span className="demand-name">{d.name}</span>
                  <span className="demand-sub">
                    {s.open} {s.open === 1 ? 'aberta' : 'abertas'}
                    {s.late > 0 && <span className="tone-warn"> · {s.late} {s.late === 1 ? 'atrasada' : 'atrasadas'}</span>}
                  </span>
                </span>
                <IconChevron />
              </div>
              <span className="progress" aria-hidden="true"><span style={{ width: `${s.pct}%` }} /></span>
              <span className="demand-next">
                {s.next ? (<>Próxima: <strong>{s.next.title}</strong>{s.next.due_at ? ` · ${dueLabel(s.next)}` : ''}</>) : 'Nada pendente aqui.'}
              </span>
            </button>
          );
        })}
        {loose > 0 && (
          <button type="button" className="card demand-card" style={{ '--c': 'var(--muted)' }} onClick={() => onOpenDemand(null)}>
            <div className="demand-top">
              <span className="demand-badge"><span className="dot dot-lg" /></span>
              <span className="demand-info">
                <span className="demand-name">Sem demanda</span>
                <span className="demand-sub">{loose} {loose === 1 ? 'item' : 'itens'} para classificar</span>
              </span>
              <IconChevron />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
