import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { currentSubscription, disablePush, enablePush, loadProfile, pushStatus, saveProfile, sendTest } from '../lib/push';

export default function NotificationSettings() {
  const { showToast } = useStore();
  const [st, setSt] = useState(pushStatus());
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    currentSubscription().then((s) => setActive(!!s && Notification.permission === 'granted')).catch(() => {});
    loadProfile().then(setProfile).catch(() => {});
  }, []);

  const turnOn = async () => {
    setBusy(true); setMsg(null);
    try {
      await enablePush();
      setActive(true); setSt(pushStatus());
      if (!profile) setProfile(await saveProfile({}));
      showToast('Notificações ativadas');
    } catch (e) { setMsg({ err: true, text: e.message }); setSt(pushStatus()); }
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true); setMsg(null);
    try { await disablePush(); setActive(false); showToast('Notificações desativadas neste aparelho'); }
    catch (e) { setMsg({ err: true, text: e.message }); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    try { await sendTest(); setMsg({ text: 'Teste enviado. Deve chegar em alguns segundos.' }); }
    catch (e) { setMsg({ err: true, text: e.message }); }
    setBusy(false);
  };
  const updateProfile = async (patch) => {
    setProfile((p) => ({ ...(p || {}), ...patch }));
    try { await saveProfile(patch); } catch { showToast('Não consegui salvar a preferência.'); }
  };

  let body;
  if (!st.supported && st.isIOS && !st.standalone) {
    body = <p className="hint">Para receber notificações no iPhone, abra o app pelo ícone da tela de início (Safari › Compartilhar › Adicionar à Tela de Início).</p>;
  } else if (!st.supported) {
    body = <p className="hint">Este navegador não oferece notificações. No iPhone, use o app instalado na tela de início (iOS 16.4 ou mais novo).</p>;
  } else if (st.permission === 'denied') {
    body = <p className="hint tone-warn">As notificações estão bloqueadas. No iPhone: Ajustes › Notificações › Demandas › Permitir Notificações.</p>;
  } else {
    body = (
      <>
        <div className="settings-row">
          <span>Lembretes neste aparelho</span>
          <strong className={active ? 'tone-accent' : 'muted'}>{active ? 'Ativos' : 'Desligados'}</strong>
        </div>
        {active ? (
          <>
            <button type="button" className="settings-row as-btn" disabled={busy} onClick={test}><span>Enviar notificação de teste</span></button>
            <label className="settings-row">
              <span>Resumo da manhã</span>
              <input type="checkbox" className="switch" checked={profile?.morning_enabled !== false} onChange={(e) => updateProfile({ morning_enabled: e.target.checked })} />
            </label>
            {profile?.morning_enabled !== false && (
              <label className="settings-row">
                <span>Horário do resumo</span>
                <input type="time" className="input input-time" value={profile?.morning_time || '07:30'} onChange={(e) => e.target.value && updateProfile({ morning_time: e.target.value })} />
              </label>
            )}
            <button type="button" className="settings-row as-btn" disabled={busy} onClick={turnOff}><span className="tone-warn">Desativar neste aparelho</span></button>
          </>
        ) : (
          <div className="settings-row settings-cta">
            <button type="button" className="btn btn-primary btn-grow" disabled={busy} onClick={turnOn}>{busy ? 'Ativando…' : 'Ativar notificações'}</button>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="section">
      <h2 className="section-title tone-muted">Notificações</h2>
      <div className="card settings-list">{body}</div>
      {msg && <p className={`hint${msg.err ? ' tone-warn' : ''}`} role="status">{msg.text}</p>}
      {active && <p className="hint">O resumo da manhã mostra o que vence hoje e o que está atrasado. Só é enviado quando há algo.</p>}
    </section>
  );
}
