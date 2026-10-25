# Pendências do painel

Atualizado em 16/10/2026. Nenhuma proposta abaixo foi implementada no servidor.

## Dados e ações que faltam

- **Enviar/Pular uma oferta no WhatsApp:** não há endpoint de ação por produto. `/api/control` com `publishNow` dispara o ciclo completo, portanto não foi usado como se enviasse o cartão escolhido. Os dois botões aparecem desabilitados, com explicação.
- **Fotos, desconto, vendas e categoria por oferta:** `src/index.js` limita `latestOffers` a cinco itens com `id`, `title` e `price`. Os cartões usam placeholder e não simulam os campos ausentes. Filtro por categoria e ordenação por desconto dependem desses dados; categoria fica desabilitada e a ordenação usa preço ou ordem original.
- **Motivo individual de elegibilidade:** o relatório registra que a oferta passou pela busca, mas não detalha desconto, vendas, cooldown e filtros por produto. O primeiro cartão explica esse limite. Seria necessário fornecer esses critérios junto à oferta.
- **Situações de ofertas:** o relatório não fornece uma fila completa de produtos enviados ou descartados. O filtro contempla somente as ofertas elegíveis disponíveis. O histórico continua distinguindo os resultados das tentativas reais.
- **Hoje/7 dias completos:** atividade contém no máximo 200 eventos e `cycles` no máximo 60 ciclos. Os contadores acumulados não têm recorte temporal. Envios e falhas são calculados pelos eventos disponíveis e mostram o aviso de base parcial; consultas, descartes, falhas de API e percentual por período aparecem como indisponíveis. Para resultados completos, guardar agregados por dia/hora com fuso, consultas, descartes, envios e falhas por tipo, independentemente do limite da lista recente.
- **Gráfico completo:** o SVG agrupa os envios confirmados do histórico disponível por hora de Brasília (ou fuso do relatório). O gráfico é omitido se não há envios nesse recorte. Agregados históricos seriam necessários para cobrir todo o período.
- **Conexão Shopee/Instagram e validade de credenciais:** a interface mostra somente o estado observado: última busca, erro conhecido ou credenciais configuradas. Configuração não equivale a conexão externa verificada. Validade de token e estado de conexão externa não são inventados.
- **Fotos externas:** além de faltar imagem no relatório, a CSP atual limita imagens a `self` e `data:`. A solução dependeria de uma imagem local já servida ou de uma proposta específica para o servidor. A CSP foi preservada.

## Conferência visual e diferenças da referência

- As três composições do HTML fornecido foram lidas como referência; seus produtos, métricas e horários de exemplo não foram incorporados ao painel.
- A referência mostra quatro produtos com fotos, desconto e vendas. Aqui há até cinco ofertas reais do relatório, com placeholders e sem dados não fornecidos.
- Permanecem detalhes reais do bot abaixo dos cartões e detalhes da última busca abaixo das ofertas, preservando informações existentes.
- Estados de conexão usam descrições conservadoras; não afirmam “API ok” ou “Instagram conectado” apenas por haver configuração.
- A referência tem gráfico ilustrativo. Aqui só aparece gráfico se há eventos reais no recorte.
- A CSP proíbe script inline. O tema é aplicado no head por uma carga clássica do asset existente `/flash-sale.js`; sua carga como módulo continua montando apenas a aba beta. Nenhuma rota foi adicionada.
- Chrome e Edge estão instalados, mas a ferramenta de controle encerrou a conferência porque não conseguiu determinar a URL atual do Chrome com confiança suficiente. A comparação por screenshot, o comportamento em viewport móvel e a conferência visual final nos dois temas permanecem pendentes. Nenhuma instalação foi feita.

## Relâmpago

O recurso existente liga/desliga a verificação beta, lista resultados armazenados e permite teste explícito de um produto. Não é um mecanismo de publicação automática ou garantia de preço/validade. A aba foi nomeada “Verificação de ofertas relâmpago (beta)” e mantém a explicação de que é somente para testes.

## Clareza do Histórico — 16/10/2026

O resultado da linha vem de /api/report (activity.type e activity.reason) e se refere ao WhatsApp. A coluna Instagram vem de /api/instagram/feed (jobs, oferta, modo de prévia e liveEnabled). Uma confirmação no WhatsApp pode coexistir com uma publicação incerta no Instagram. Isso não exige endpoint novo: os canais agora são identificados no texto da interface.

A caixinha seleciona o produto para o feed; a seleção é mantida em memória por produto, não por evento/grupo. Portanto o mesmo produto em várias linhas compartilha a seleção. Os bloqueios existentes de catálogo, job, publicação manual e tentativa pendente foram preservados. A seleção em lote é revisada na aba Instagram. Não foi implementada reconciliação de publicações incertas nem criado endpoint de reenvio.

Pendente: conferir no navegador o layout final em claro/escuro e em celular. Os testes de contraste, linguagem e seleção passaram; screenshot final indisponível pela limitação de controle do Chrome já registrada.
