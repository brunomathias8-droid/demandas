# Demandas

App pessoal de gestão de demandas: registre o que precisa fazer, falar ou lembrar, organize por assunto e receba alertas.

**Versão 0.3 — Etapa 3 (notificações)**

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 | Demandas, itens, tela Hoje, Entrada, busca, três estilos visuais | Pronta |
| 2 | Captura por voz e texto livre, com classificação automática | Pronta |
| 3 | Notificações no iPhone e resumo da manhã | Pronta |
| 4 | Atalho do iPhone para enviar mensagens e áudios do WhatsApp | Próxima |

## Como funciona

- **Sem configuração**, o app roda em modo local: os dados ficam só no navegador do aparelho.
- **Com o Supabase configurado**, os dados ficam na nuvem, com login, e sincronizam entre iPhone e computador.

## Instalação (uma vez, cerca de 20 minutos)

### 1. GitHub
1. Crie um repositório **privado** chamado `demandas`.
2. Envie estes arquivos para ele (ou peça ao Claude para enviar).

### 2. Supabase (banco de dados e login)
1. Em supabase.com, crie um projeto. Região sugerida: São Paulo.
2. Abra **SQL Editor**, cole o conteúdo de `supabase/migrations/001_nucleo.sql` e clique em **Run**.
3. Em **Authentication › Sign In / Providers › Email**, desative **Confirm email** (opcional, simplifica o primeiro acesso).
4. Em **Project Settings › API**, copie:
   - **Project URL**
   - **anon public key**

### 3. Vercel (hospedagem)
1. Em vercel.com, clique em **Add New › Project** e importe o repositório `demandas`.
2. Em **Environment Variables**, adicione:

   | Nome | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL do Supabase |
   | `VITE_SUPABASE_ANON_KEY` | anon public key do Supabase |

3. Clique em **Deploy**. Ao final, a Vercel mostra o endereço do app.

### 4. iPhone
1. Abra o endereço do app no **Safari**.
2. Toque em **Compartilhar › Adicionar à Tela de Início**.
3. Abra pelo ícone e crie sua conta (e-mail e senha).

As quatro demandas iniciais (Nexo, Café Verde, RM, Saúde) são criadas no primeiro acesso. Você pode renomear, excluir ou criar outras a qualquer momento.

## Segurança

- Cada usuário só acessa os próprios dados (regras de segurança no banco).
- A chave `anon` do Supabase pode ficar no app; ela só funciona dentro dessas regras.
- Chaves de IA (etapa 2) ficam no servidor, nunca no app nem no repositório.
- Ajustes › Exportar cópia de segurança gera um arquivo com todos os seus dados.

## Para desenvolvedores

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm run build      # gera a versão de produção em dist/
```

Estrutura:

```
src/
  lib/store.jsx        dados (local ou Supabase), operações otimistas, desfazer
  lib/dates.js         prazos, agrupamento da tela Hoje, rótulos em pt-BR
  screens/             Hoje, Demandas, Detalhe, Entrada, Buscar, Ajustes, Login
  components/          linha de item, folhas de edição, ícones
  styles.css           três temas por variáveis CSS (escuro é o padrão)
supabase/migrations/   SQL do banco
```

Modelo de dados:

- `demands`: nome, cor, descrição e palavras-chave (usadas pela IA na etapa 2).
- `tasks`: título, demanda, tipo (fazer, falar, lembrar), situação (entrada, aberta, concluída), prazo, lembrete, origem (texto, voz, WhatsApp) e texto original.

## Captura inteligente (etapa 2)

- Botão do centro abre a captura: fale (até 3 minutos) ou escreva livremente.
- O servidor (`api/capture.js`, função da Vercel) confere o login, transcreve o áudio (OpenAI) e separa os itens com o Claude, sugerindo demanda, tipo, prazo e aviso.
- Você confere e ajusta cada item antes de salvar, ou guarda tudo na Entrada para revisar depois.
- Aviso padrão: no horário do prazo, ou às 9:00 do dia do prazo.
- Variáveis na Vercel (só servidor): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. Opcional: `ANTHROPIC_MODEL` (padrão `claude-sonnet-5-5`).
- Dica: preencha a descrição e as palavras-chave de cada demanda para melhorar a classificação.

## Notificações (etapa 3)

- SQL: `supabase/migrations/002_notificacoes.sql` (assinaturas, perfil, segredo do agendador e agendamento a cada minuto via pg_cron + pg_net).
- Variável na Vercel (só servidor): `SUPABASE_SERVICE_ROLE_KEY` (chave secreta do Supabase).
- `api/notify.js`: chamado pelo agendador; envia lembretes vencidos e o resumo da manhã no fuso do usuário. Autorizado pelo segredo gerado no banco (`app_secrets.cron_secret`).
- `api/push.js`: entrega a chave pública e envia notificação de teste. As chaves VAPID são geradas no primeiro uso e guardadas em `app_secrets`.
- No iPhone, notificações exigem o app instalado na tela de início (iOS 16.4+). Ativação em Ajustes › Notificações.
