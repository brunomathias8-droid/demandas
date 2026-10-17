import { useEffect, useState } from 'react';
import { useStore } from './lib/store';
import Today from './screens/Today';
import Demands from './screens/Demands';
import DemandDetail from './screens/DemandDetail';
import Inbox from './screens/Inbox';
import Search from './screens/Search';
import Settings from './screens/Settings';
import Login from './screens/Login';
import TaskSheet from './components/TaskSheet';
import DemandSheet from './components/DemandSheet';
import { IconGrid, IconInbox, IconPlus, IconSearch, IconSun } from './components/Icons';

const THEME_COLOR = { escuro: '#0D0E11', calmo: '#F6F6F3', quente: '#F3ECE2' };
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export default function App() {
  const store = useStore();
  const { cloud, session, authReady, loading, tasks, toast, hideToast } = store;

  const [theme, setTheme] = useState(() => read('demandas.theme', 'escuro'));
  const [name, setName] = useState(() => read('demandas.name', 'Bruno'));
  const [tab, setTab] = useState('hoje');
  const [detail, setDetail] = useState(undefined); // undefined = fechado; null = "sem demanda"; id
  const [settings, setSettings] = useState(false);
  const [taskSheet, setTaskSheet] = useState(null);
  const [demandSheet, setDemandSheet] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
    write('demandas.theme', theme);
  }, [theme]);
  useEffect(() => { write('demandas.name', name); }, [name]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab, detail, settings]);

  if (cloud && !authReady) return <div className="splash" aria-busy="true" />;
  if (cloud && !session) return <Login />;
  if (loading) return <div className="splash" aria-busy="true"><div className="spinner" /></div>;

  const inboxCount = tasks.filter((t) => t.status === 'inbox').length;
  const openTask = (task) => setTaskSheet({ task });
  const newTask = (defaults = {}) => setTaskSheet({ defaults });
  const go = (t) => { setTab(t); setDetail(undefined); setSettings(false); };

  let screen;
  if (settings) {
    screen = <Settings theme={theme} setTheme={setTheme} name={name} setName={setName} onBack={() => setSettings(false)} />;
  } else if (detail !== undefined) {
    screen = (
      <DemandDetail
        demandId={detail}
        onBack={() => setDetail(undefined)}
        onOpenTask={openTask}
        onNewTask={newTask}
        onEdit={(d) => setDemandSheet({ demand: d })}
      />
    );
  } else if (tab === 'hoje') {
    screen = <Today onOpenTask={openTask} onNewTask={newTask} onGoInbox={() => go('entrada')} onSettings={() => setSettings(true)} userName={name.trim()} />;
  } else if (tab === 'demandas') {
    screen = <Demands onOpenDemand={(id) => setDetail(id)} onNewDemand={() => setDemandSheet({})} />;
  } else if (tab === 'entrada') {
    screen = <Inbox onOpenTask={openTask} />;
  } else {
    screen = <Search onOpenTask={openTask} />;
  }

  const fabDefaults = detail ? { demand_id: detail } : {};
  const navItem = (id, label, Icon, badge) => (
    <button type="button" className={`nav-item${tab === id && detail === undefined && !settings ? ' is-on' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
      <Icon />
      <span>{label}</span>
      {badge > 0 && <span className="nav-badge" aria-label={`${badge} itens`}>{badge}</span>}
    </button>
  );

  return (
    <div className="app">
      <main className="main">{screen}</main>

      <nav className="tabbar" aria-label="Navegação principal">
        {navItem('hoje', 'Hoje', IconSun)}
        {navItem('demandas', 'Demandas', IconGrid)}
        <button type="button" className="fab" aria-label="Adicionar item" onClick={() => newTask(fabDefaults)}>
          <IconPlus size={26} sw={2.6} />
        </button>
        {navItem('entrada', 'Entrada', IconInbox, inboxCount)}
        {navItem('buscar', 'Buscar', IconSearch)}
      </nav>

      {taskSheet && <TaskSheet key={taskSheet.task?.id || 'new'} task={taskSheet.task} defaults={taskSheet.defaults} onClose={() => setTaskSheet(null)} />}
      {demandSheet && <DemandSheet demand={demandSheet.demand} onClose={() => setDemandSheet(null)} onDeleted={() => setDetail(undefined)} />}

      {toast && (
        <div className="toast" role="status" key={toast.key}>
          <span>{toast.msg}</span>
          {toast.action && (
            <button type="button" className="toast-btn" onClick={() => { toast.action.fn(); hideToast(); }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </div>
  );
}
