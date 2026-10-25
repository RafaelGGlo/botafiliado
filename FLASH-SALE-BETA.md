# Ofertas Relâmpago (BETA)

Implementação experimental, desligada por padrão e exclusivamente para testes.
Após reiniciar o serviço, abra o painel :3210 → Configurações →
⚡ Ofertas Relâmpago (BETA), ative o seletor, escolha um produto e use Testar agora.
O resultado mostra produto, status, fonte, início/fim em America/Sao_Paulo e erros.
O seletor e resultados persistem no banco Instagram existente. OFF não consulta
fontes; ON também não inicia consultas automáticas. Apenas Testar agora consulta.

## Resultado da investigação local

`node scripts/probe-flash-sources.mjs` consulta o esquema oficial Affiliate usando
a assinatura existente, sem imprimir segredos. O esquema respondeu: ProductOfferV2
contém preços, desconto e períodos de oferta, mas não confirmação de participação
Flash Sale. Não tratamos esses períodos ou descontos como evidência.
O GET sem credenciais/cookies ao endpoint
`https://shopee.com.br/api/v2/flash_sale/flash_sale_get_items` respondeu HTTP 403.
Nenhum CAPTCHA, autenticação ou restrição foi contornado. Resultados sanitizados
estão em `output/flash-sale/source-probe.json`. O probe é diagnóstico manual,
não é executado pelo botão nem pelo bot; não repete chamadas ao endpoint bloqueado.

Não há adaptador confiável instalado. Assim, a execução real retorna UNVERIFIED.
O validador implementa ACTIVE, SCHEDULED e EXPIRED apenas para evidência explícita
de uma futura fonte revisada e permitida, com promotionId, shopId/itemId exatos,
variação quando aplicável e janela UTC válida. Testes sintéticos cobrem essas
possibilidades; não representam promoções descobertas na Shopee.

Cache de 60 s por produto/variação, limite persistente de um teste novo por minuto,
no máximo uma repetição de erro transitório; 401/403/429 não são repetidos.
Cache vencido não mantém ACTIVE. O preço de um resultado ACTIVE é revalidado
pelo serviço Shopee existente; falha converte o resultado em UNVERIFIED.

## Publicação

**Nenhum fluxo WhatsApp, Instagram, agendamento ou formatador foi alterado.**
Não há integração do resultado BETA com publicadores, nem aprovação de etiquetas.
Mesmo um resultado ACTIVE de teste não adiciona “⚡ OFERTA RELÂMPAGO” a mensagens.
Revalidar promoção e preço imediatamente antes de publicar só deverá ser
integrado após aprovação explícita e disponibilidade de fonte confiável.

Arquivos: `src/flash-sale-beta.js`, `dashboard/flash-sale.js`, integração de
armazenamento em `src/instagram.js`, rotas protegidas em `src/dashboard-server.js`
e inclusão do módulo em `dashboard/index.html`, sob `instagram-publish/whatsapp-bot`.

Teste: `node --test instagram-publish/whatsapp-bot/test/flash-sale-beta.test.js`.
