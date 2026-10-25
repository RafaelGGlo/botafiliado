# Publicação manual no feed

Depois de reiniciar normalmente o serviço, abra http://127.0.0.1:3210.
Nas últimas ofertas e na atividade recente, a coluna Instagram permite selecionar
produtos e usar **Publicar no feed** ou **Publicar selecionados**.
Cada produto gera uma foto separada, nunca um carrossel ou Story.

**Publicar no feed** atualiza a oferta, gera a imagem 1080×1350, envia ao Cloudinary
e publica automaticamente, sem etapa adicional de aprovação ou prévia.
**Publicar selecionados** faz o mesmo para cada produto, em posts separados.
Se quiser apenas conferir as imagens, marque **Apenas gerar prévias, sem publicar**;
os botões passam a dizer **Gerar prévia**. Essa opção vem desmarcada.
As credenciais Meta, Cloudinary e Shopee devem estar configuradas no servidor;
os bloqueios existentes de modo de teste e aprovação inicial continuam valendo.
Os modos do calendário não controlam esta fila de seleção explícita. O recurso não
altera as opções dos fluxos automáticos.

A fila armazena status, dados atualizados, legenda, IDs do container e da mídia,
horários, erros e permalink em `ig_feed_jobs` no banco Instagram existente.
Produtos reservados/publicados compartilham a proteção permanente de feed
`ig_publications` com o publicador existente. WhatsApp e Stories têm seus
próprios registros. Respostas incertas nunca são repetidas automaticamente;
confira a conta e o container antes de reconciliar. Uma falha não interrompe
os outros produtos da seleção. Fontes sem atualização suportada são recusadas.
Falhas sem tentativa de publicação exibem **Tentar novamente**, sempre por
ação manual, com nova consulta à fonte. Itens publicados ou incertos não podem
ser repetidos por esse botão.

Prévia por terminal, com atualização real na fonte e fila isolada:

```powershell
node scripts/preview-manual-feed.mjs
```

Resultados: `output/instagram-feed/feed.jpg`, `feed-long-title.jpg` e
`dry-run-results.json`. O script usa a configuração local do servidor e NÃO
invoca upload ou publicação. A fonte não fornece preço anterior da mesma
variante; não se usa preço máximo ou desconto declarado para inventar esse dado.

Arquivos principais: `src/manual-feed.js`, `src/feed-refresh.js`,
`src/feed-image.js`, `src/instagram.js`, `src/dashboard-server.js`,
`dashboard/feed.js` e `dashboard/app.js`, todos sob `instagram-publish/whatsapp-bot`.
`src/index.js` inclui IDs nas ofertas recentes; `src/story-template.js` exporta
a medição de texto para compartilhar a tipografia sem alterar o layout Story.

Validação da fila/API e seleção: `node --test instagram-publish/whatsapp-bot/test/manual-feed.test.js instagram-publish/whatsapp-bot/test/feed-selection.test.js`.
