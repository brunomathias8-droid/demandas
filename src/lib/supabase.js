import { createClient } from '@supabase/supabase-js';

// Aceita a URL em qualquer formato colado (com /rest/v1, barra no fim, espaços) e usa só a origem.
function cleanUrl(raw) {
  if (!raw) return null;
  const s = raw.trim().replace(/^["']|["']$/g, '');
  try { return new URL(s.startsWith('http') ? s : `https://${s}`).origin; } catch { return null; }
}

const url = cleanUrl(import.meta.env.VITE_SUPABASE_URL);
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');

// Sem as variáveis configuradas, o app roda em "modo local" (dados só neste aparelho).
export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
