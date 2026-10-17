import { useStore } from '../lib/store';
import { DemandChip } from '../components/TaskRow';
import { IconChat, IconMic } from '../components/Icons';

const SRC = { whatsapp: 'WhatsApp', voz: 'Áudio', texto: 'Texto' };

export default function Inbox({ onOpenTask }) {
  const { tasks, demandById, updateTask, showToast } = useStore();
  const items = tasks.filter((t) => t.status === 'inbox').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const accept = (t) => {
    updateTask(t.id, { status: 'open' });
    showToast(t.demand_id ? `Adicionado em ${demandById[t.demand_id]?.name}` : 'Adicionado');
  };

  return (
    <div className="screen">
      <header className="screen-head"><h1 className="display">Entrada</h1></header>
      <p className="lede">O que chegou do WhatsApp ou por áudio e ainda precisa da sua confirmação.</p>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Entrada vazia.</div>
          <p>Mensagens e áudios encaminhados do WhatsApp aparecem aqui, já com a demanda sugerida.</p>
        </div>
      ) : (
        <div className="stack">
          {items.map((t) => (
            <article key={t.id} className="card inbox-card">
              <div className="inbox-src">
                {t.source === 'voz' ? <IconMic size={14} /> : <IconChat size={14} />}
                {SRC[t.source] || 'Texto'}
              </div>
              {t.raw_input && t.raw_input !== t.title && <div className="quote">“{t.raw_input}”</div>}
              <div className="inbox-suggest">
                <div className="field-label tone-accent">Sugestão</div>
                <div className="inbox-title">{t.title}</div>
                <div className="task-meta"><DemandChip demand={demandById[t.demand_id]} /></div>
              </div>
              <div className="foot-row">
                <button type="button" className="btn btn-primary btn-grow" onClick={() => (t.demand_id ? accept(t) : onOpenTask(t))}>Confirmar</button>
                <button type="button" className="btn btn-ghost btn-grow" onClick={() => onOpenTask(t)}>Ajustar</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="tip">
        No WhatsApp: segure a mensagem ou o áudio › Compartilhar › <strong>Enviar para Demandas</strong>. Disponível na etapa 4.
      </div>
    </div>
  );
}
