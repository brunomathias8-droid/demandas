import { useStore } from '../lib/store';
import { IconBack, IconCheck } from '../components/Icons';

export const THEMES = [
  { id: 'escuro', label: 'Escuro', desc: 'Preto com verde-limão', bg: '#0D0E11', fg: '#F1F2F4', ac: '#C8F25A' },
  { id: 'calmo', label: 'Calmo', desc: 'Claro, limpo, azul', bg: '#F6F6F3', fg: '#1B1C1F', ac: '#2557D6' },
  { id: 'quente', label: 'Quente', desc: 'Tons terrosos', bg: '#F3ECE2', fg: '#2A1F18', ac: '#A9471F' }
];

export default function Settings({ theme, setTheme, onBack, name, setName }) {
  const { cloud, session, signOut, exportData, resetLocal } = useStore();

  return (
    <div className="screen">
      <header className="detail-head">
        <button type="button" className="icon-btn" aria-label="Voltar" onClick={onBack}><IconBack /></button>
      </header>
      <h1 className="display">Ajustes</h1>

      <section className="section">
        <h2 className="section-title tone-muted">Estilo</h2>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button key={t.id} type="button" className={`theme-card${theme === t.id ? ' is-on' : ''}`} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
              <span className="theme-preview" style={{ background: t.bg, color: t.fg }}>
                <span className="tp-line" style={{ background: t.fg }} />
                <span className="tp-line short" style={{ background: t.fg }} />
                <span className="tp-dot" style={{ background: t.ac }} />
              </span>
              <span className="theme-name">{t.label}{theme === t.id && <IconCheck size={14} />}</span>
              <span className="theme-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title tone-muted">Seu nome</h2>
        <input className="input" placeholder="Como quer ser chamado" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
      </section>

      <section className="section">
        <h2 className="section-title tone-muted">Dados</h2>
        <div className="card settings-list">
          <div className="settings-row">
            <span>Onde ficam</span>
            <strong>{cloud ? 'Nuvem (sincronizado)' : 'Só neste aparelho'}</strong>
          </div>
          {cloud && session && (
            <div className="settings-row"><span>Conta</span><strong className="ellipsis">{session.user.email}</strong></div>
          )}
          <button type="button" className="settings-row as-btn" onClick={exportData}><span>Exportar cópia de segurança</span><span className="muted">.json</span></button>
          {!cloud && (
            <button type="button" className="settings-row as-btn" onClick={() => { if (confirm('Apagar tudo e voltar aos exemplos?')) resetLocal(); }}>
              <span className="tone-warn">Restaurar exemplos</span>
            </button>
          )}
          {cloud && session && (
            <button type="button" className="settings-row as-btn" onClick={signOut}><span className="tone-warn">Sair</span></button>
          )}
        </div>
        {!cloud && <p className="hint">Modo local: os dados ficam salvos só neste navegador. Com o Supabase configurado, passam a sincronizar entre aparelhos.</p>}
      </section>

      <p className="hint center">Demandas · versão 0.1 (núcleo)</p>
    </div>
  );
}
