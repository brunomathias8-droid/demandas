import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import TaskRow from '../components/TaskRow';

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Search({ onOpenTask }) {
  const { tasks, demandById } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('open');

  const results = useMemo(() => {
    const nq = norm(q.trim());
    return tasks
      .filter((t) => (filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done'))
      .filter((t) => !nq || norm(t.title).includes(nq) || norm(t.notes).includes(nq) || norm(demandById[t.demand_id]?.name).includes(nq))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 200);
  }, [tasks, q, filter, demandById]);

  return (
    <div className="screen">
      <header className="screen-head"><h1 className="display">Buscar</h1></header>
      <label className="sr-only" htmlFor="search">Buscar itens</label>
      <input id="search" className="input input-lg" type="search" placeholder="Palavra, pessoa ou demanda" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="segmented" role="group" aria-label="Filtro">
        {[['open', 'Abertos'], ['done', 'Concluídos'], ['all', 'Todos']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {results.length ? (
        <div className="card list">{results.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpenTask} />)}</div>
      ) : (
        <div className="empty small"><p>Nada encontrado.</p></div>
      )}
    </div>
  );
}
