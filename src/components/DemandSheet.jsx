import { useState } from 'react';
import Sheet from './Sheet';
import { DEMAND_COLORS, useStore } from '../lib/store';
import { IconCheck, IconTrash } from './Icons';

export default function DemandSheet({ demand, onClose, onDeleted }) {
  const { addDemand, updateDemand, deleteDemand, showToast, tasks } = useStore();
  const editing = !!demand;
  const [name, setName] = useState(demand?.name || '');
  const [color, setColor] = useState(demand?.color || DEMAND_COLORS[0]);
  const [description, setDescription] = useState(demand?.description || '');
  const [keywords, setKeywords] = useState((demand?.keywords || []).join(', '));
  const [confirmDel, setConfirmDel] = useState(false);

  const openCount = editing ? tasks.filter((t) => t.demand_id === demand.id && t.status !== 'done').length : 0;

  const save = () => {
    const n = name.trim();
    if (!n) return;
    const data = {
      name: n, color,
      description: description.trim(),
      keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean)
    };
    if (editing) { updateDemand(demand.id, data); showToast('Demanda salva'); }
    else { addDemand(data); showToast('Demanda criada'); }
    onClose();
  };

  const footer = (
    <div className="foot-row">
      {editing && (
        <button type="button" className="btn btn-ghost btn-danger" aria-label="Excluir demanda" onClick={() => setConfirmDel(true)}><IconTrash /></button>
      )}
      <button type="button" className="btn btn-primary btn-grow" disabled={!name.trim()} onClick={save}>{editing ? 'Salvar' : 'Criar demanda'}</button>
    </div>
  );

  return (
    <Sheet title={editing ? 'Editar demanda' : 'Nova demanda'} onClose={onClose} footer={footer}>
      <div className="field">
        <label className="field-label" htmlFor="dm-name">Nome</label>
        <input id="dm-name" className="input input-lg" autoFocus={!editing} maxLength={60} placeholder="Ex.: Nexo, Casa, Saúde" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>

      <div className="field">
        <div className="field-label">Cor</div>
        <div className="swatches" role="radiogroup" aria-label="Cor">
          {DEMAND_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Cor ${c}`} className="swatch" style={{ background: c }} onClick={() => setColor(c)}>
              {color === c && <IconCheck size={16} />}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="dm-desc">Do que se trata</label>
        <textarea id="dm-desc" className="input notes" rows={2} placeholder="Uma frase sobre este assunto. Ajuda a IA a classificar o que você falar." value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="dm-kw">Palavras que indicam este assunto</label>
        <input id="dm-kw" className="input" placeholder="Separadas por vírgula: fornecedor, lote, torra…" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        <div className="hint">Pessoas, projetos, termos que você costuma usar quando fala dele.</div>
      </div>

      {confirmDel && (
        <div className="confirm-box" role="alert">
          <p>Excluir “{demand.name}”? {openCount > 0 ? `Os ${openCount} itens abertos ficarão sem demanda.` : 'Não há itens abertos nela.'}</p>
          <div className="foot-row">
            <button type="button" className="btn btn-ghost btn-grow" onClick={() => setConfirmDel(false)}>Cancelar</button>
            <button type="button" className="btn btn-danger-solid btn-grow" onClick={() => { deleteDemand(demand.id); onClose(); onDeleted?.(); }}>Excluir</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
