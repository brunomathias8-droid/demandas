import { useState } from 'react';
import { useStore } from '../lib/store';

export default function Login() {
  const { signIn, signUp } = useStore();
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fn = mode === 'in' ? signIn : signUp;
    const { data, error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      const m = error.message || '';
      setMsg({ err: true, text: /Invalid login/i.test(m) ? 'E-mail ou senha incorretos.' : /least 6/i.test(m) ? 'A senha precisa ter pelo menos 6 caracteres.' : m });
      return;
    }
    if (mode === 'up' && !data.session) setMsg({ text: 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre aqui.' });
  };

  return (
    <div className="login">
      <div className="login-mark" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="var(--accent)" /><path d="M21 32.5l8 8 14-15" fill="none" stroke="var(--accent-text)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <h1 className="display">Demandas</h1>
      <p className="lede">Fale, registre e não deixe nada passar.</p>
      <form className="login-form" onSubmit={submit}>
        <label className="field-label" htmlFor="email">E-mail</label>
        <input id="email" className="input input-lg" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="field-label" htmlFor="pw">Senha</label>
        <input id="pw" className="input input-lg" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {msg && <p className={msg.err ? 'form-msg tone-warn' : 'form-msg'} role="status">{msg.text}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}</button>
        <button type="button" className="link-btn center" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
          {mode === 'in' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta. Entrar'}
        </button>
      </form>
    </div>
  );
}
