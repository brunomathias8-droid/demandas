// GET  /api/push            -> chave pública para assinar notificações
// POST /api/push {op:'test'} -> envia uma notificação de teste para os aparelhos do usuário
import { adminClient, getUser, sendToUser, vapidKeys } from './_lib/server.js';

export default async function handler(req, res) {
  try {
    const db = adminClient();
    const keys = await vapidKeys(db);
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ publicKey: keys.publicKey });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    const user = await getUser(req);
    if (!user?.id) return res.status(401).json({ error: 'Faça login novamente.' });
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', user.id);
    if (!subs?.length) return res.status(200).json({ sent: 0, error: 'Nenhum aparelho com notificações ativas.' });
    const sent = await sendToUser(db, keys, subs, {
      title: 'Notificações ativas',
      body: 'Você vai receber aqui os lembretes das suas demandas.',
      tag: 'teste', url: '/'
    });
    return res.status(200).json({ sent });
  } catch (e) {
    console.error(e);
    const msg = e.code === 'config'
      ? 'Falta a chave SUPABASE_SERVICE_ROLE_KEY na Vercel.'
      : 'Não consegui configurar as notificações agora.';
    return res.status(500).json({ error: msg });
  }
}
