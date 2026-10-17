import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { bucketize, dayDiff, greeting, todayLabel } from '../lib/dates';
import TaskRow from '../components/TaskRow';
import { IconGear, IconPlus } from '../components/Icons';

function Section({ title, tone, tasks, onOpen, collapsible, initiallyOpen = true }) {
  const [open, setOpen] = useState(initiallyOpen);
  if (!tasks.length) return null;
  return (
    <section className="section">
      {collapsible ? (
        <button type="button" className={`section-title as-btn tone-${tone || 'muted'}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {title} <span className="count">{tasks.length}</span><span className={`caret${open ? ' up' : ''}`} aria-hidden="true">›</span>
        </button>
      ) : (
        <h2 className={`section-title tone-${tone || 'muted'}`}>{title} <span className="count">{tasks.length}</span></h2>
      )}
      {open && (
        <div className="card list">
          {tasks.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} />)}
        </div>
      )}
    </section>
  );
}

export default function Today({ onOpenTask, onNewTask, onGoInbox, onSettings, userName }) {
  const { tasks } = useStore();
  const now = new Date();
  const b = useMemo(() => bucketize(tasks, now), [tasks]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneToday = useMemo(() => tasks.filter((t) => t.status === 'done' && t.completed_at && dayDiff(t.completed_at, now) === 0), [tasks]); // eslint-disable-line react-hooks/exhaustive-deps
  const inboxCount = tasks.filter((t) => t.status === 'inbox').length;
  const nothing = !b.late.length && !b.today.length && !b.next.length && !b.nodate.length && !b.later.length;

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <div className="eyebrow">{todayLabel(now)}</div>
          <h1 className="display">{greeting(now)}{userName ? `, ${userName}` : ''}</h1>
        </div>
        <button type="button" className="icon-btn" aria-label="Ajustes" onClick={onSettings}><IconGear /></button>
      </header>

      <div className="stats">
        <div className="stat">
          <div className={`stat-n${b.late.length ? ' tone-warn' : ''}`}>{b.late.length}</div>
          <div className="stat-l">{b.late.length === 1 ? 'atrasada' : 'atrasadas'}</div>
        </div>
        <div className="stat">
          <div className="stat-n">{b.today.length}</div>
          <div className="stat-l">para hoje</div>
        </div>
        <button type="button" className="stat stat-accent" onClick={onGoInbox}>
          <div className="stat-n tone-accent">{inboxCount}</div>
          <div className="stat-l">na entrada</div>
        </button>
      </div>

      {nothing ? (
        <div className="empty">
          <div className="empty-title">Tudo em dia.</div>
          <p>Quando lembrar de algo, toque no botão do centro e registre na hora.</p>
          <button type="button" className="btn btn-primary" onClick={() => onNewTask({})}><IconPlus size={18} />Novo item</button>
        </div>
      ) : (
        <>
          <Section title="Atrasadas" tone="warn" tasks={b.late} onOpen={onOpenTask} />
          <Section title="Hoje" tone="accent" tasks={b.today} onOpen={onOpenTask} />
          <Section title="Próximos 7 dias" tasks={b.next} onOpen={onOpenTask} />
          <Section title="Sem data" tasks={b.nodate} onOpen={onOpenTask} collapsible initiallyOpen={b.nodate.length <= 5} />
          <Section title="Mais adiante" tasks={b.later} onOpen={onOpenTask} collapsible initiallyOpen={false} />
        </>
      )}
      <Section title="Concluídas hoje" tasks={doneToday} onOpen={onOpenTask} collapsible initiallyOpen={false} />
    </div>
  );
}
