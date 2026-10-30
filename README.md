# Protótipo — Controle de EPIs

- `/` → app da operação (celular): retirada com foto automática
- `/painel.html` → painel de gestão (computador)

## Publicar na Vercel

1. Dentro desta pasta: `npx vercel` e depois `npx vercel --prod`
   (ou suba a pasta num repositório GitHub e importe em vercel.com/new — Framework: **Other**, sem build).
2. No projeto da Vercel: **Storage → Create Database → Upstash for Redis → plano Free → Connect**.
   Isso cria as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` sozinho.
3. Publique de novo (`npx vercel --prod` ou *Redeploy* no painel) para a API enxergar o banco.
4. Confira: bolinha **verde** no topo do app e **"Ao vivo" verde** no painel.

Sem o passo 2 tudo funciona, mas em **modo local**: cada aparelho só vê os próprios registros
(bolinha amarela no app).

## Observações

- Os dados "exemplo" do painel são gerados no navegador e não ocupam o banco.
- "Limpar retiradas de teste", no rodapé do painel, apaga só o que foi registrado pelo app.
- A API não tem autenticação. É um protótipo: não use com dados reais.
- Empresas, áreas, materiais, funcionários e prazos ficam em `data.js` (`EMPRESAS`).
