# Instagram: comentario QUERO para mensagem privada

Implementacao: `src/instagram-comment-replies.js`, integrada ao mesmo banco SQLite e servidor do Instagram. Desativada por padrao. Nao requer IA nem uma nova assinatura de IA.

## Comportamento

- Comentarios novos cujo texto seja somente QUERO ou QQUERO (sem diferenca entre maiusculas e minusculas; aceita repeticao do Q inicial, aspas, espacos e pontuacao) entram em uma fila persistente.
- Somente posts de feed publicados pelo bot e registrados em `ig_posts.published_id` sao reconhecidos. Posts externos, Stories, lives, respostas a comentarios e comentarios da propria conta sao ignorados.
- A mensagem privada contem o link de afiliado do snapshot daquele post. Nenhuma resposta publica nem sequencia de mensagens e enviada.
- Antes do envio, a API consulta o comentario e confere texto, post e data. Comentarios com 7 dias ou mais, ofertas expiradas e ofertas de teste sao bloqueados.
- Cada comentario tem uma reserva unica. Resultados incertos e interrupcoes ficam bloqueados para evitar repeticao: conferir na Meta antes de qualquer intervencao manual. A fila processa no maximo um comentario a cada 5 segundos; ao atingir 1.000 pendentes o webhook retorna 503 sem confirmar eventos perdidos.
- A assinatura HMAC SHA-256 e validada sobre os bytes originais. Nenhum token e devolvido pelo painel. O status `commentReplies` da API local mostra configuracao, bloqueios locais em `blockers` e contagens por estado. Esses bloqueios nao validam a assinatura externa na Meta.

## Configuracao necessaria antes de ativar

Esta implementacao inicial suporta **Instagram Login** (`INSTAGRAM_LOGIN_TYPE=instagram`). Um token de Facebook Login nao deve ser reutilizado mudando apenas esse campo. Obtenha o token correto pelo fluxo autorizado da Meta.

1. Conta profissional e aplicativo Meta com acesso adequado aos comentarios e Private Replies. Na documentacao do fluxo Instagram Login, conferir `instagram_business_basic` e `instagram_business_manage_comments`, niveis de acesso e revisao do aplicativo para usuarios reais. Publicar posts com sucesso nao comprova acesso a mensagens privadas.
2. Reutilizar ID da conta e versao configurados no bot, com um token Instagram autorizado. Definir `INSTAGRAM_APP_SECRET` (secret do aplicativo Meta) e `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (segredo aleatorio exclusivo escolhido para verificacao).
3. Disponibilizar HTTPS publico **apenas** para `/webhooks/instagram`, encaminhando para `http://127.0.0.1:3210/webhooks/instagram`. Preservar corpo original e cabecalho `X-Hub-Signature-256`. Nao publicar o painel nem rotas `/api/*` na internet. Nao registrar tokens ou corpos de comentarios em logs do proxy.
4. Apos aprovacao para configurar o servico externo, cadastrar a callback URL no aplicativo Meta e assinar o campo `comments` para a conta. Essas operacoes nao foram realizadas pelo codigo nem durante os testes.
5. Definir `INSTAGRAM_COMMENT_DM_ENABLED=true`. Com `INSTAGRAM_TEST_MODE=true`, verificacao e recebimento podem funcionar, mas o worker nao faz chamadas externas. Para envio real, sao necessarios tambem `INSTAGRAM_LIVE_APPROVED=true` e `INSTAGRAM_TEST_MODE=false`. Ativacao e reinicio nao foram realizados nesta entrega.
6. Usar legenda: "Comente QUERO para receber o link por mensagem privada". Essa frase nao e adicionada automaticamente antes de a funcao estar habilitada.

Se um comentario foi recebido no modo de teste, ele fica na fila e pode ser processado ao ativar o modo real, se ainda for elegivel. Nao use eventos reais para teste sem considerar esse comportamento.

## Testes locais

`npm test --prefix instagram-publish/whatsapp-bot`

A suite usa banco temporario/em memoria e transporte Meta simulado. Cobre assinatura, desafio, isolamento de conta e post, palavra-chave, duplicacao, janela temporal, ofertas invalidas, modo desativado, falhas e acesso publico restrito ao webhook. Nenhuma mensagem real foi enviada.

## Referencias para ativacao

- https://developers.facebook.com/docs/instagram-platform/private-replies/
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/

As paginas Meta retornaram HTTP 429 na consulta desta implementacao. O formato usado e `POST /{ig_account_id}/messages` com JSON `recipient.comment_id` e `message.text`. Confirmar permissoes e compatibilidade da versao da API no aplicativo antes do teste real autorizado. O transporte foi verificado localmente com mocks; nao houve validacao ponta a ponta contra a Meta.

## Convite para o grupo na mesma mensagem

Defina `INSTAGRAM_DM_GROUP_URL` com o convite HTTPS completo de `chat.whatsapp.com`. A resposta inclui o link de afiliado solicitado e, em seguida, "Quer receber mais ofertas? Entre no nosso grupo do WhatsApp:" com o convite. E uma unica mensagem privada, sem iniciar uma sequencia automatica. Se a variavel estiver vazia, somente o produto e enviado. Convites invalidos bloqueiam o envio. O link real nao foi configurado: aguardando o convite fornecido pelo usuario.
