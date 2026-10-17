import { supabase } from './supabase';

export function pushStatus() {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return { supported, standalone, isIOS, permission: supported ? Notification.permission : 'unsupported' };
}

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// Precisa ser chamada direto do toque no botão (exigência do iPhone)
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied'
    ? 'As notificações foram bloqueadas. No iPhone: Ajustes › Notificações › Demandas › Permitir.'
    : 'Permissão não concedida.');
  const reg = await navigator.serviceWorker.ready;
  const r = await fetch('/api/push', { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.publicKey) throw new Error(j.error || 'Não consegui configurar as notificações agora.');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(j.publicKey) });
  const k = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: k.endpoint, p256dh: k.keys.p256dh, auth: k.keys.auth, user_agent: navigator.userAgent.slice(0, 300) },
    { onConflict: 'endpoint' }
  );
  if (error) throw new Error('Não consegui registrar este aparelho. Confira se o SQL da etapa 3 foi executado.');
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
}

export async function sendTest() {
  const { data } = await supabase.auth.getSession();
  const r = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify({ op: 'test' })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'Falha ao enviar o teste.');
  return j;
}

export async function loadProfile() {
  const { data } = await supabase.from('profiles').select('*').maybeSingle();
  return data;
}

export async function saveProfile(patch) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Fortaleza';
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.from('profiles')
    .upsert({ user_id: uid, tz, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('*').maybeSingle();
  if (error) throw error;
  return data;
}
