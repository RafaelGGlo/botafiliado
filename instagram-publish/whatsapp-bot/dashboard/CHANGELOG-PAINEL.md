# Mudanças do painel — 16/10/2026

## Backup

O destino original já existia. Com autorização do usuário, foi preservado e criada a cópia integral:

`C:\Backups-Privados\garimpo\painel\dashboard-original-20261016-081321`

Nenhum arquivo foi alterado fora de `dashboard/`, exceto a criação desse backup autorizado. Servidor, endpoints, checagens Host/Origin/token, armazenamento e deduplicação foram preservados. Nenhum bot foi iniciado e nenhum envio ou publicação foi solicitado.

## Arquivos alterados

- `index.html`: tema aplicado cedo por asset permitido na CSP; color-scheme para os dois temas; confirmação com título e descrição acessíveis.
- `style.css`: sistema de cores escuro/claro, menu de 240px, conteúdo limitado a 1200px, cartões de 14px, tipografia, botões de 44px, grade, foco e layout móvel.
- `feed.js`: estrutura das seis abas, navegação por hash com aliases antigos e aba persistida, título/breadcrumb sincronizados, seletor de tema, confirmações, resultados por período, conexões, SVG por hora e três falhas com horário. Mantém os controles e endpoints de feed existentes.
- `app.js`: cartões de ofertas, busca e ordenação local, placeholders, ações indisponíveis desabilitadas e seleção de feed na aba Instagram. Preserva requisições autenticadas existentes, histórico, CSV e paginação; filtros de texto/resultado voltam à primeira página.
- `filters.js`: funções puras adicionais de tema, escape e filtragem/ordenação de ofertas; funções anteriores preservadas.
- `flash-sale.js`: aplicação antecipada do tema na carga clássica e montagem beta na carga como módulo; nome fiel ao recurso.
- `instagram.css`, `feed.css`: superfícies e controles adaptados às variáveis dos dois temas.

## Arquivos criados

- `design.test.js`: testes de busca/ordenação, escape, tema/persistência, aplicação no head sob a CSP e contraste de texto.
- `validation-20261016.log`: saída final da suíte existente.
- `panel-tests.log`: saída da execução dos dois testes preexistentes de CSV/período.
- `PROPOSTAS-PAINEL.md` e este documento.

## Abas

- **Operação:** conexões, controle com confirmação de Liberar/Parar, Resultados Hoje/7 dias/Total, quatro métricas, próximo envio, gráfico condicional e três falhas recentes. Detalhes reais do bot permanecem abaixo.
- **Ofertas:** título próprio, filtros locais, grade de quatro colunas em desktop, preço real, elegibilidade e explicação dos critérios disponíveis. Enviar/Pular ficam desabilitados porque não há endpoint por produto.
- **Instagram:** calendário existente e controles do feed reunidos; seleção das ofertas da última busca nesta aba. Seleção histórica existente permanece no histórico.
- **Histórico:** filtros existentes, tabela com rolagem própria, paginação de 20 eventos e CSV de todos os registros filtrados, independentemente da página visível.
- **Relâmpago (beta):** verificações experimentais existentes, sem adicionar publicação.
- **Configurações:** intervalo, categoria da próxima busca e filtros das ofertas enviados para esta aba.

## Validação

Antes das mudanças: `npm.cmd test` — **128 passaram, 0 falharam**.

Depois das mudanças: `npm.cmd test` — **128 passaram, 0 falharam**. Nenhum teste que passava regrediu.

Testes do painel: `node --test dashboard/panel.test.js dashboard/design.test.js` — **7 passaram, 0 falharam**.

Todos os arquivos JavaScript de dashboard passaram em `node --check`. Os pares de cores de texto normal testados atendem a 4,5:1. Não há dependências novas, CDN ou fontes externas.

Foi tentada conferência com Chrome usando a habilidade Computer Use. A ferramenta bloqueou o controle por não conseguir identificar a URL atual com confiança. Não foi possível obter screenshots finais; não se afirma equivalência visual verificada. Um servidor temporário isolado, somente leitura e com dados claramente de teste, foi encerrado. Não foram executados o bot nem o agendador Instagram para essa tentativa.

## Como abrir

Na pasta `instagram-publish\whatsapp-bot`, executar `npm.cmd run dashboard` e abrir `http://127.0.0.1:3210`. Se o painel já estiver rodando, atualizar a aba. Esse é o script existente de painel, não o script `start` do bot. A interface continua consultando os mesmos endpoints e enviando `X-Control-Token` nas ações existentes.

## Como voltar atrás

Fechar a aba do painel e parar somente o processo do painel se estiver em execução. Restaurar a cópia datada autorizada sobre `dashboard/`:

```powershell
Get-ChildItem -LiteralPath 'C:\Backups-Privados\garimpo\painel\dashboard-original-20261016-081321' -Force |
  Copy-Item -Destination '.\dashboard' -Recurse -Force
```

Executar dentro de `instagram-publish\whatsapp-bot`. Os arquivos novos de documentação/teste/log não são servidos pelo servidor e podem permanecer; removê-los é opcional. Usar o backup datado acima, pois o destino `dashboard-original` preexistente pode representar outra versão.

## Ajuste do Histórico — 16/10/2026

Backup integral anterior ao ajuste: `C:\Backups-Privados\garimpo\painel\dashboard-antes-ajuste-historico`. Para desfazer somente este ajuste, restaurar o conteúdo deste backup sobre dashboard/ usando Get-ChildItem e Copy-Item conforme o procedimento acima, trocando o caminho da origem.

Arquivos alterados: index.html, app.js, feed.js, feed.css e filters.js. Arquivos criados: history.test.js e validation-historico-20261016.log.

- Cabeçalho “Histórico de envios” e colunas “Envio ao WhatsApp” / “Publicação no Instagram” distinguem os dois canais.
- “Envio confirmado” descreve a confirmação do WhatsApp, independentemente do estado da publicação no Instagram.
- “Detalhes do envio ao WhatsApp” explica confirmação, preparação, falha ou timeout em português. Códigos técnicos não aparecem como motivo legível.
- A seleção tem rótulo visível e associado ao checkbox. Uma explicação informa que marcar não publica e que a seleção é revisada na aba Instagram.
- Incerteza de Instagram aparece uma vez, em destaque âmbar com orientação para conferir a conta. Os bloqueios de reenvio e todos os estados operacionais permanecem iguais.
- A tabela tem largura mínima de 1080px e rolagem horizontal própria; grupo, preço e horário não se fragmentam. Detalhes usam disclosure nativo e o cabeçalho adapta os filtros ao espaço disponível.
- O aviso de configuração salva fica restrito a Operação/Configurações, evitando um aviso sem relação no Histórico.
- Cores usam as variáveis já testadas dos dois temas; foco e áreas de rótulo/link têm alvo mínimo de 44px.

Validação: 128 testes existentes passaram, sem falhas; 9 testes do painel passaram, sem falhas. Incluem duas novas verificações de linguagem/estados do Histórico e o teste existente de seleção/publicação do feed passou. Todos os JS passaram em node --check. Nenhum bot, envio ou publicação foi iniciado. Nenhuma dependência instalada. Servidor e endpoints preservados.

O ajuste foi orientado pelo print enviado. A renderização final no navegador não foi conferida: a ferramenta de Computer Use havia interrompido o acesso por não conseguir identificar a URL do Chrome com segurança. Não há alegação de equivalência visual validada por screenshot.
