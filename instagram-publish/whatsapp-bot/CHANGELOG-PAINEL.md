# Ajustes do painel

Arquivos alterados: dashboard/index.html, app.js, feed.js, filters.js, instagram.js, flash-sale.js e style.css. Criado dashboard/panel.test.js.

- Operação: controles, próximo envio, estado do bot, pausa de emergência no topo, seletor de período, aproveitamento acumulado, indicadores de estado, SVGs de envios por dia/hora e cinco falhas recentes. Recortes limitados são explicitamente identificados.
- Ofertas: última busca, motivos agregados e cartões com os campos existentes; publicação manual preservada.
- Instagram: calendário e controles do feed em espaço próprio. Confirmação em diálogo para publicação e habilitação dos modos de publicação.
- Histórico: filtros existentes, paginação de 20 linhas, motivo disponível e CSV de todos os registros filtrados, com proteção contra fórmulas.
- Configurações: intervalo, categoria e filtros das ofertas.
- Relâmpago (beta): testes existentes, separados das configurações reais.
- Resultados: aviso “Em breve”.

Navegação sincroniza hash, menu, título, breadcrumb e última aba salva. Hashes antigos #overview, #activity e #flash-settings continuam aceitos. Menu recolhível no celular, foco visível e alvos de 44px. Marca R, tema escuro, cores dos controles e bloco Seu espaço local preservados.

Servidor, endpoints, checagens de acesso, token, store e deduplicação não foram alterados. Não foram lidos arquivos .env. Não foram iniciados bots nem disparados envios.

Abrir http://127.0.0.1:3210 com o servidor do painel já em execução. O script existente é npm.cmd run dashboard; não foi executado durante os ajustes.

Backup obrigatório criado antes das alterações em C:\Backups-Privados\garimpo\painel\dashboard-original\dashboard. Para voltar, com os processos encerrados, restaurar o conteúdo desse diretório sobre instagram-publish/whatsapp-bot/dashboard. A cópia original foi mantida intacta.

Base: npm.cmd test, 128 passam, 0 falham. Final: 128 passam, 0 falham. Testes novos: node --test dashboard/panel.test.js, 2 passam, 0 falham. Sintaxe: node --check em todos os JS do dashboard, sem erros. Logs em dashboard/dashboard-baseline.log e dashboard/dashboard-final.log. Os adaptadores dos testes antigos continuam compatíveis por meio da montagem alternativa do calendário/feed quando usados isoladamente; no painel completo, a navegação central monta as abas.
