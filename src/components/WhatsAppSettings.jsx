import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

const ENDPOINT = `${location.origin}/api/inbox`;

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function CopyField({ id, label, value }) {
  const { showToast } = useStore();
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); showToast('Copiado'); }
    catch { document.getElementById(id)?.select(); showToast('Selecione e copie'); }
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="copy-row">
        <input id={id} className="input mono" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-soft" onClick={copy}>Copiar</button>
      </div>
    </div>
  );
}

export default function WhatsAppSettings() {
  const { showToast } = useStore();
  const [hasToken, setHasToken] = useState(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.from('inbox_tokens').select('created_at').maybeSingle()
      .then(({ data, error }) => setHasToken(error ? 'missing-table' : !!data));
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const t = newToken();
      const { data: s } = await supabase.auth.getSession();
      const { error } = await supabase.from('inbox_tokens')
        .upsert({ user_id: s.session.user.id, token_hash: await sha256Hex(t), created_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      setToken(t); setHasToken(true); setOpen(true);
    } catch {
      showToast('Não consegui gerar o código. Confira se o SQL da etapa 4 foi executado.');
    }
    setBusy(false);
  };

  return (
    <section className="section">
      <h2 className="section-title tone-muted">WhatsApp</h2>
      <div className="card settings-list">
        <div className="settings-row">
          <span>Atalho “Enviar para Demandas”</span>
          <strong className={hasToken === true ? 'tone-accent' : 'muted'}>{hasToken === true ? 'Código criado' : hasToken === 'missing-table' ? 'Falta o SQL' : 'Não configurado'}</strong>
        </div>
        {hasToken !== 'missing-table' && (
          <div className="settings-row settings-cta">
            <button type="button" className={`btn btn-grow ${hasToken ? 'btn-ghost' : 'btn-primary'}`} disabled={busy} onClick={generate}>
              {busy ? 'Gerando…' : hasToken ? 'Gerar novo código' : 'Gerar código do atalho'}
            </button>
          </div>
        )}
        <button type="button" className="settings-row as-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>Como montar o atalho</span><span className={`caret${open ? ' up' : ''}`} aria-hidden="true">›</span>
        </button>
      </div>

      {token && (
        <div className="card wa-box">
          <p className="hint tone-warn">Copie o código agora. Por segurança, ele só aparece desta vez. Gerar um novo invalida o anterior.</p>
          <CopyField id="wa-url" label="Endereço" value={ENDPOINT} />
          <CopyField id="wa-token" label="Código" value={`Bearer ${token}`} />
        </div>
      )}

      {open && (
        <ol className="wa-steps">
          <li>Abra o app <strong>Atalhos</strong> no iPhone e toque em <strong>+</strong>.</li>
          <li>Toque no nome no topo e chame de <strong>Enviar para Demandas</strong>.</li>
          <li>Toque no <strong>ⓘ</strong> e ligue <strong>Mostrar na Planilha de Compartilhamento</strong>. Depois, no bloco <strong>Receber … da Planilha de Compartilhamento</strong> no topo do atalho, toque nos tipos e marque <strong>todos</strong>.</li>
          <li>Adicione a ação <strong>Obter Conteúdo do URL</strong>. Em URL, cole o <strong>Endereço</strong>.</li>
          <li>Toque em <strong>Mostrar Mais</strong>: Método <strong>POST</strong>. Em Cabeçalhos, adicione <strong>Authorization</strong> com o valor do <strong>Código</strong> (inclui a palavra Bearer).</li>
          <li>Em Corpo da Solicitação, escolha <strong>Formulário</strong>, adicione um campo do tipo <strong>Arquivo</strong>, chame de <strong>conteudo</strong> e escolha como valor <strong>Entrada do Atalho</strong>.</li>
          <li>Adicione a ação <strong>Mostrar Notificação</strong> com o resultado de <strong>Conteúdo do URL</strong>.</li>
          <li>No WhatsApp: segure uma mensagem ou áudio › <strong>Encaminhar</strong> › ícone de compartilhar (canto inferior esquerdo) › role até o fim › <strong>Enviar para Demandas</strong>. Use <strong>Editar Ações</strong> para deixá-lo no topo.</li>
        </ol>
      )}
    </section>
  );
}
