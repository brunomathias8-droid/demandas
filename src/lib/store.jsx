import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { addDays, startOfDay } from './dates';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const LOCAL_KEY = 'demandas.data.v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const nowISO = () => new Date().toISOString();

export const DEMAND_COLORS = ['#C8F25A', '#5B9CFF', '#3DDC97', '#FF5C93', '#FFB020', '#B38CFF', '#2FD4E6', '#FF7A45'];

const SEED_DEMANDS = [
  { name: 'Nexo', color: '#5B9CFF' },
  { name: 'Café Verde', color: '#3DDC97' },
  { name: 'RM', color: '#FF5C93' },
  { name: 'Saúde', color: '#FFB020' }
];

function demandRow(d, i) {
  return { id: uid(), name: d.name, color: d.color, description: '', keywords: [], position: i, archived: false, created_at: nowISO() };
}

function taskRow(data) {
  return {
    id: uid(), demand_id: null, title: '', notes: '', kind: 'fazer', status: 'open',
    due_at: null, due_all_day: true, remind_at: null, source: 'texto', raw_input: null,
    completed_at: null, created_at: nowISO(), ...data
  };
}

// Exemplos só para o modo local, para a primeira abertura não ficar vazia
function demoData() {
  const demands = SEED_DEMANDS.map(demandRow);
  const [nexo, cafe, rm, saude] = demands;
  const at = (days, h, m = 0) => { const d = addDays(startOfDay(), days); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const tasks = [
    taskRow({ title: 'Toque no círculo para concluir um item', demand_id: nexo.id, due_at: at(0, 12), due_all_day: true }),
    taskRow({ title: 'Toque no texto para editar, mudar a demanda ou o prazo', demand_id: cafe.id, kind: 'lembrar', due_at: at(0, 17), due_all_day: false }),
    taskRow({ title: 'Botão do centro: adicionar algo novo', demand_id: rm.id, due_at: at(1, 9), due_all_day: false }),
    taskRow({ title: 'Exemplo de item sem data', demand_id: saude.id }),
    taskRow({ title: 'Bruno, consegue me mandar a planilha de custos até quinta?', status: 'inbox', source: 'whatsapp', raw_input: 'Bruno, consegue me mandar a planilha de custos até quinta?' })
  ];
  return { demands, tasks };
}

export function StoreProvider({ children }) {
  const cloud = !!supabase;
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!cloud);
  const [loading, setLoading] = useState(true);
  const [demands, setDemands] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg, action) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, action, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2600);
  }, []);
  const hideToast = useCallback(() => setToast(null), []);

  const fail = useCallback((err) => {
    console.error(err);
    showToast('Não consegui salvar. Verifique a conexão.');
  }, [showToast]);

  // ---------- carregamento ----------
  useEffect(() => {
    if (cloud) return;
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const data = raw ? JSON.parse(raw) : demoData();
      setDemands(data.demands); setTasks(data.tasks);
    } catch { const d = demoData(); setDemands(d.demands); setTasks(d.tasks); }
    setLoading(false);
  }, [cloud]);

  useEffect(() => {
    if (cloud || loading) return;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ demands, tasks })); } catch { /* sem espaço */ }
  }, [cloud, loading, demands, tasks]);

  useEffect(() => {
    if (!cloud) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [cloud]);

  const fetchAll = useCallback(async () => {
    if (!cloud || !session) return;
    const since = addDays(new Date(), -45).toISOString();
    const [d, t] = await Promise.all([
      supabase.from('demands').select('*').order('position').order('created_at'),
      supabase.from('tasks').select('*').or(`status.neq.done,completed_at.gte.${since}`).order('created_at', { ascending: false })
    ]);
    if (d.error || t.error) { fail(d.error || t.error); setLoading(false); return; }
    let ds = d.data;
    if (ds.length === 0) {
      const seed = SEED_DEMANDS.map((x, i) => ({ name: x.name, color: x.color, position: i }));
      const ins = await supabase.from('demands').insert(seed).select('*');
      if (!ins.error) ds = ins.data;
    }
    setDemands(ds); setTasks(t.data); setLoading(false);
  }, [cloud, session, fail]);

  useEffect(() => {
    if (!cloud) return;
    if (!session) { setDemands([]); setTasks([]); setLoading(false); return; }
    setLoading(true);
    fetchAll();
    const onVis = () => { if (document.visibilityState === 'visible') fetchAll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [cloud, session, fetchAll]);

  // ---------- operações (otimistas) ----------
  const clean = (row) => { const { user_id, ...rest } = row; return rest; };

  const addTask = useCallback(async (data) => {
    const row = taskRow(data);
    setTasks((p) => [row, ...p]);
    if (cloud) {
      const { error } = await supabase.from('tasks').insert(clean(row));
      if (error) { setTasks((p) => p.filter((x) => x.id !== row.id)); fail(error); }
    }
    return row;
  }, [cloud, fail]);

  const updateTask = useCallback(async (id, patch) => {
    let before;
    setTasks((p) => p.map((x) => (x.id === id ? ((before = x), { ...x, ...patch }) : x)));
    if (cloud) {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id);
      if (error) { setTasks((p) => p.map((x) => (x.id === id && before ? before : x))); fail(error); }
    }
  }, [cloud, fail]);

  const restoreTask = useCallback(async (row) => {
    setTasks((p) => [row, ...p.filter((x) => x.id !== row.id)]);
    if (cloud) {
      const { error } = await supabase.from('tasks').upsert(clean(row));
      if (error) fail(error);
    }
  }, [cloud, fail]);

  const deleteTask = useCallback(async (task) => {
    setTasks((p) => p.filter((x) => x.id !== task.id));
    showToast('Item excluído', { label: 'Desfazer', fn: () => restoreTask(task) });
    if (cloud) {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) { restoreTask(task); fail(error); }
    }
  }, [cloud, fail, showToast, restoreTask]);

  const toggleDone = useCallback((task) => {
    const done = task.status !== 'done';
    const patch = done ? { status: 'done', completed_at: nowISO() } : { status: 'open', completed_at: null };
    updateTask(task.id, patch);
    if (done) {
      if (navigator.vibrate) navigator.vibrate(12);
      showToast('Concluído', { label: 'Desfazer', fn: () => updateTask(task.id, { status: task.status, completed_at: task.completed_at }) });
    }
  }, [updateTask, showToast]);

  const addDemand = useCallback(async (data) => {
    const row = { ...demandRow({ name: data.name, color: data.color }, demands.length), ...data };
    setDemands((p) => [...p, row]);
    if (cloud) {
      const { error } = await supabase.from('demands').insert(clean(row));
      if (error) { setDemands((p) => p.filter((x) => x.id !== row.id)); fail(error); }
    }
    return row;
  }, [cloud, fail, demands.length]);

  const updateDemand = useCallback(async (id, patch) => {
    let before;
    setDemands((p) => p.map((x) => (x.id === id ? ((before = x), { ...x, ...patch }) : x)));
    if (cloud) {
      const { error } = await supabase.from('demands').update(patch).eq('id', id);
      if (error) { setDemands((p) => p.map((x) => (x.id === id && before ? before : x))); fail(error); }
    }
  }, [cloud, fail]);

  const deleteDemand = useCallback(async (id) => {
    setDemands((p) => p.filter((x) => x.id !== id));
    setTasks((p) => p.map((t) => (t.demand_id === id ? { ...t, demand_id: null } : t)));
    if (cloud) {
      const { error } = await supabase.from('demands').delete().eq('id', id);
      if (error) { fail(error); fetchAll(); }
    }
    showToast('Demanda excluída. Os itens dela ficaram sem demanda.');
  }, [cloud, fail, fetchAll, showToast]);

  const signIn = async (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signUp = async (email, password) => supabase.auth.signUp({ email, password });
  const signOut = async () => { if (cloud) await supabase.auth.signOut(); };

  const resetLocal = () => {
    const d = demoData(); setDemands(d.demands); setTasks(d.tasks);
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exported_at: nowISO(), demands, tasks }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `demandas-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const demandById = useMemo(() => Object.fromEntries(demands.map((d) => [d.id, d])), [demands]);
  const activeDemands = useMemo(() => demands.filter((d) => !d.archived).sort((a, b) => a.position - b.position), [demands]);

  const value = {
    cloud, session, authReady, loading,
    demands, activeDemands, demandById, tasks,
    addTask, updateTask, deleteTask, toggleDone, restoreTask,
    addDemand, updateDemand, deleteDemand,
    signIn, signUp, signOut, resetLocal, exportData, refresh: fetchAll,
    toast, showToast, hideToast
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
