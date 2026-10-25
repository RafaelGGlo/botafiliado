# Diagnóstico do Instagram — somente leitura

Data da coleta: 16/10/2026, 09:00:43 (Brasília). Os bancos foram abertos com DatabaseSync({readOnly:true}); nenhuma migração, reparação ou rotina de inicialização do aplicativo foi executada. Não houve POST, publicação, reinício ou teste de envio. Único arquivo escrito: este relatório.

## Conclusão

Há dois problemas independentes com evidência direta: a Graph API bloqueia a consulta da conta (HTTP 400, code 200, “API access blocked.”); e o ambiente Python de Stories aponta para uma pasta antiga e não consegue iniciar. Cloudinary respondeu HTTP 200 no GET de uso. As flags do arquivo atual permitem publicação real na Graph API.

## 1. Configuração

Arquivo efetivo identificado no iniciador: whatsapp-bot/.env. O código está em instagram-publish/whatsapp-bot/src/. O iniciador scripts/iniciar-bots.mjs carrega esse .env, passa as variáveis ao processo e usa whatsapp-bot como diretório de trabalho. Não existe .env na pasta aninhada instagram-publish/whatsapp-bot.

| Variável secreta/identificador | Estado | Comprimento aproximado (caracteres) |
| --- | --- | --- |
| INSTAGRAM_ACCESS_TOKEN | preenchido | 180 |
| INSTAGRAM_ACCOUNT_ID | preenchido | 20 |
| CLOUDINARY_CLOUD_NAME | preenchido | 10 |
| CLOUDINARY_API_KEY | preenchido | 20 |
| CLOUDINARY_API_SECRET | preenchido | 30 |
| INSTAGRAM_APP_SECRET | vazio | 0 |

Comprimentos arredondados para cima em blocos de 10; nenhum valor de credencial foi copiado.

| Variável não secreta autorizada | Valor no arquivo |
| --- | --- |
| INSTAGRAM_TEST_MODE | false |
| INSTAGRAM_LIVE_APPROVED | true |
| INSTAGRAM_API_VERSION | v25.0 |
| INSTAGRAM_ACCOUNT_TYPE | MEDIA_CREATOR |
| INSTAGRAM_LOGIN_TYPE | instagram |

No código src/instagram.js, publicação real exige exatamente INSTAGRAM_LIVE_APPROVED=true E INSTAGRAM_TEST_MODE=false. Qualquer outra combinação (inclusive ausência, diferença de maiúsculas ou outra escrita) bloqueia. A combinação atual não bloqueia. Esta verificação é do arquivo atual, não uma leitura do ambiente privado do processo. Os Stories imediatos seguem a fila Python separada.

INSTAGRAM_APP_SECRET está vazio. O código usa esse segredo para validar webhooks e respostas a comentários; ele não é requisito direto da função graph() de publicação do feed. Portanto sua ausência não explica, isoladamente, o bloqueio atual do feed.

Configurações persistidas do calendário: manualEnabled=true, autoEnabled=false, manualPublish=false, autoPublish=false. Essas opções bloqueiam publicação pelo calendário/automático. O feed manual usa canPublish=live() && credentialsConfigured, separado desses quatro controles. Não atribuir a falha do feed manual exclusivamente ao calendário.

## 2. Bot e comparação de datas

Bot principal ativo: PID 6892; criação do processo em 16/10/2026, 08:52:23. O PID corresponde ao lock whatsapp-bot/bot.lock; o lock registra 16/10/2026, 08:52:28 (alguns segundos depois da criação do processo). Identificação por metadados de processo, sem reproduzir argumentos completos. Não havia python/pythonw persistente na coleta; o Python de Stories é acionado sob demanda, portanto sua ausência isolada não demonstra falha.

| Arquivo | Última modificação (Brasília) | Comparação com início do Node |
| --- | --- | --- |
| whatsapp-bot/.env | 13/10/2026, 14:39:59 | Anterior ao início |
| instagram-publisher/.env | 14/10/2026, 14:45:28 | Anterior ao início |
| instagram-publisher/state/session.json | 15/10/2026, 16:43:14 | Anterior ao início |

Não há evidência de .env alterado depois do início atual. Pelo mecanismo de carregamento e pelas datas, o Node foi iniciado após a versão atual do .env. Não foi inspecionado o ambiente em memória do processo, portanto não se pode provar igualdade de cada variável. O Python chama load_dotenv(..., override=False): variáveis herdadas têm prioridade sobre seu .env; a sessão seria carregada a cada execução, se o interpretador funcionasse.

## 3. Banco instagram.sqlite

Banco examinado: instagram-publish/whatsapp-bot/instagram.sqlite.

### ig_posts (calendário)

Tabela vazia: 0 registros em todos os status. Não existem 15 posts recentes para listar. Campos solicitados (at, mode, format, status, attempted, container_id, published_id, error): nenhuma linha disponível. Não há post preso nem publicação real registrada nessa tabela. Não confundir isso com ausência de publicação em outras tabelas.

### ig_feed_jobs (feed manual efetivamente utilizado)

| Status | dry_run (1 = prévia) | Quantidade |
| --- | --- | --- |
| failed | 0 | 1 |
| preview | 1 | 4 |
| published | 0 | 7 |
| uncertain | 0 | 8 |

Último feed confirmado de verdade: 15/10/2026, 08:44:34 (published, dry_run=0 e media_id preenchido). Há 7 publicações reais confirmadas no total; não foi feita consulta pública dos posts.

Os 8 incertos têm attempted=1 e container_id vazio. Isso sugere falha depois da reserva local, antes de obter/gravar a confirmação de criação do container; ainda não prova que a Meta não recebeu a requisição. O código genérico apaga a causa original e mantém a reserva. Não há jobs atualmente em queued/preparing/rendering/publishing; uncertain é um estado de reconciliação, não um worker comprovadamente travado.

15 jobs mais recentes por criação; datas em Brasília. Esta tabela não tem mode/format: é o fluxo de feed manual; o identificador publicado chama-se media_id.

| Criado | Atualizado | Publicado | status | dry_run | attempted | container_id | media_id | error (mascarado) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 16/10/2026, 08:52:41 | 16/10/2026, 08:52:45 | — | uncertain | 0 | 1 | vazio | vazio | Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar. |
| 16/10/2026, 08:32:19 | 16/10/2026, 08:32:23 | — | uncertain | 0 | 1 | vazio | vazio | Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar. |
| 16/10/2026, 08:31:45 | 16/10/2026, 08:31:49 | — | uncertain | 0 | 1 | vazio | vazio | Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar. |
| 15/10/2026, 15:17:08 | 15/10/2026, 15:17:13 | — | uncertain | 0 | 1 | vazio | vazio | Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar. |
| 15/10/2026, 13:00:16 | 15/10/2026, 13:00:20 | — | uncertain | 0 | 1 | vazio | vazio | Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar. |
| 15/10/2026, 09:56:13 | 15/10/2026, 09:56:18 | — | uncertain | 0 | 1 | vazio | vazio | Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar. |
| 15/10/2026, 09:56:12 | 15/10/2026, 09:56:16 | — | uncertain | 0 | 1 | vazio | vazio | Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar. |
| 15/10/2026, 08:44:24 | 15/10/2026, 08:44:34 | 15/10/2026, 08:44:34 | published | 0 | 1 | preenchido | preenchido | — |
| 15/10/2026, 06:11:25 | 15/10/2026, 06:11:37 | 15/10/2026, 06:11:37 | published | 0 | 1 | preenchido | preenchido | — |
| 14/10/2026, 23:55:57 | 14/10/2026, 23:56:09 | 14/10/2026, 23:56:09 | published | 0 | 1 | preenchido | preenchido | — |
| 14/10/2026, 23:54:53 | 14/10/2026, 23:55:04 | 14/10/2026, 23:55:04 | published | 0 | 1 | preenchido | preenchido | — |
| 14/10/2026, 23:32:07 | 14/10/2026, 23:32:18 | 14/10/2026, 23:32:18 | published | 0 | 1 | preenchido | preenchido | — |
| 14/10/2026, 23:31:03 | 16/10/2026, 08:31:03 | — | uncertain | 0 | 1 | vazio | vazio | Resultado incerto. Não reenviar: confira a conta e o container antes de reconciliar. |
| 14/10/2026, 23:31:03 | 14/10/2026, 23:31:12 | — | failed | 0 | 0 | vazio | vazio | Oferta não está mais disponível no catálogo. |
| 14/10/2026, 23:31:02 | 14/10/2026, 23:31:12 | 14/10/2026, 23:31:12 | published | 0 | 1 | preenchido | preenchido | — |

## 4. Últimas 300 linhas dos logs

Coleta em 16/10/2026, 08:57:54. O bot continuou rodando; os arquivos podem receber novas linhas após esta leitura.

| Arquivo | Linhas examinadas | Erros Instagram/Graph/Meta/Cloudinary/instagrapi | Primeira ocorrência | Última ocorrência |
| --- | --- | --- | --- | --- |
| whatsapp-bot/bot-output.log | 300 | 0 | Não encontrada | Não encontrada |
| whatsapp-bot/bot-error.log | 2 | 0 | Não encontrada | Não encontrada |

Não há grupos de erros dessas integrações no recorte solicitado, nem code/error_subcode da Meta nos logs consultados. O stdout recente contém predominantemente seleção de produtos e resumo de busca. O stderr tem apenas dois avisos NODE-CRON de execução perdida: 14/10/2026, 22:15:01 e 15/10/2026, 13:52:01. Esses avisos não identificam falha da Meta ou do Python. Não foram apresentados logs antigos fora das 300 linhas como se pertencessem ao recorte.

Erros persistidos, separados dos logs: feed incerto (8 registros, mensagem genérica); catálogo indisponível (1); Stories publisher_result_missing (20). O banco não guarda a primeira ocorrência exata dos erros de Stories; next_at é prazo de nova tentativa, não data do erro.

## 5. Testes GET autorizados

- Graph, host escolhido pelo código para Instagram Login, versão v25.0, conta configurada, fields=id,username, token enviado somente em Authorization: **HTTP 400; code=200; error_subcode não informado; mensagem: API access blocked.** Nenhum id/username retornado foi impresso.
- Cloudinary /usage, autenticação básica com as credenciais configuradas: **HTTP 200**. O corpo foi descartado. Esse GET confirma acesso ao endpoint de uso, não valida upload de imagem nem publicação.

A primeira tentativa na sandbox foi impedida localmente (EACCES); os dois GETs foram repetidos com autorização de rede e produziram os status acima. Nenhum POST foi feito, nenhum token foi colocado em URL, argumento de shell ou relatório.

O erro Graph demonstra bloqueio de acesso para esta chamada. Ele não identifica sozinho expiração de token, permissão específica, restrição do aplicativo ou restrição da conta; essas causas precisam de verificação no painel da Meta. Não foi recebido code 190 de token expirado.

## 6. Stories / instagrapi

Sessão: instagram-publisher/state/session.json; última modificação 15/10/2026, 16:43:14. O conteúdo da sessão não foi lido nem impresso.

O launcher .venv/Scripts/python.exe existe, mas falha com “No Python at ...”. pyvenv.cfg aponta para a cópia antiga afilicadoshoppe-main (2), não para a pasta atual afilicadoshoppe-main Novo.

Foi executada somente uma inspeção local com o interpretador (-B -c, sem importar publisher.py, sem login, sem rede e sem gerar bytecode). O launcher falhou antes de iniciar o código. Não foi possível verificar dotenv/PIL/instagrapi: o interpretador falhou antes de executar o código de inspeção. O publicador não foi executado.

src/instagrapi-stories.js ignora stderr do Python e converte stdout não JSON/ausente em publisher_result_missing. Essa combinação é compatível diretamente com o erro local encontrado. O executável existe, mas seu Python-base configurado não é encontrado no local antigo.

Outbox (somente leitura):

| Status | Quantidade |
| --- | --- |
| published | 60 |
| uncertain | 20 |

Todos os 20 incertos têm error=publisher_result_missing. Nenhum desses 20 tem recibo correspondente em receipts.sqlite; não foram liberados nem reenviados. receipts.sqlite contém 67 recibos com status published e storyId preenchido, sem error. A diferença entre 60 publicados na outbox e 67 recibos não prova perda: as tabelas atendem fluxos/registros distintos. Nenhum account-blocked.json foi encontrado. Não há log .log separado na raiz de instagram-publisher.

As tabelas não armazenam timestamp de publicação/erro confiável nos recibos de Stories; não é possível informar a data exata do último Story publicado. A modificação de receipts.sqlite em 15/10/2026, 16:43:37 é apenas uma evidência de atividade do arquivo, não horário garantido de publicação. next_at não foi usado como se fosse published_at.

15 entradas mais recentes da outbox pela ordem de inserção (rowid, não data de publicação):

| status | attempts | error | story_id | link_verified |
| --- | --- | --- | --- | --- |
| uncertain | 1 | publisher_result_missing | vazio | 0 |
| uncertain | 1 | publisher_result_missing | vazio | 0 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |
| published | 1 | — | preenchido | 1 |

## 7. Causas prováveis e correções sugeridas — NÃO aplicadas

1. **Stories: ambiente Python quebrado após mudança de pasta — confiança alta.** Evidência: .venv aponta para a cópia antiga “(2)”; iniciar apenas o interpretador retorna “No Python at”; 20 jobs terminam em publisher_result_missing e não têm recibo. Sugestão: com autorização futura, reconstruir/reconfigurar o ambiente para o Python existente na pasta atual e validar imports/saída JSON sem login/publicação antes de reativar tentativas. Não editar nem apagar recibos ou reservas automaticamente.
2. **Feed: bloqueio de acesso à Graph API — confiança alta sobre o bloqueio, causa administrativa ainda desconhecida.** Evidência: GET da conta retorna HTTP 400, code 200, API access blocked.; 8 jobs incertos não têm container confirmado; último feed confirmado em 15/10/2026, 08:44:34. Sugestão: verificar restrições/estado do aplicativo e conta, tipo e permissões do token de Instagram Login; corrigir apenas depois de identificar o bloqueio e repetir o GET. Não afirmar que basta renovar o token.
3. **Calendário/automático desativados — confirmado, se esse for o fluxo esperado.** Evidência: autoEnabled=false, manualPublish=false e autoPublish=false; ig_posts vazia. Sugestão: confirmar qual fluxo deve publicar e, só com autorização posterior, habilitar as opções correspondentes. Isso não explica sozinho o bloqueio do feed manual nem o Python de Stories.
4. **Reservas incertas impedem novas tentativas — confirmado como efeito secundário.** Evidência: attempted=1 nos 8 feeds incertos e 20 Stories uncertain; código bloqueia repetição cega. Sugestão: reconciliar cada item com a conta/recibos antes de qualquer liberação. Não limpar flags ou deduplicação para forçar publicação.
5. **Registro insuficiente da causa original — confirmado.** Evidência: manual-feed.js substitui erros pós-reserva por mensagem genérica; bridge Python ignora stderr; últimos 300 logs não mostram falhas relevantes. Sugestão: futura melhoria de observabilidade com código/subcode/etapa e stderr sanitizado, sem tokens, mantendo reservas. Não há mudança aplicada neste diagnóstico.

Pouco sustentadas pela coleta: Cloudinary inválido (GET HTTP 200), .env alterado sem reinício (todos os arquivos são anteriores ao processo atual), falta de APP_SECRET como causa direta do feed (usado nos webhooks, não na chamada de publicação).

## O que precisa de confirmação

Confirmar qual fluxo deve funcionar: feed manual, calendário/automático, Stories ou todos. Para uma etapa posterior de correção, autorizar separadamente o reparo do ambiente Python e a revisão do acesso Meta. Antes de qualquer reenvio, confirmar a reconciliação dos itens incertos. Este diagnóstico termina aqui sem aplicar correções.
