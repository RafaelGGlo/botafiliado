# Integração Evolution API

## Arquitetura e plano executado

O iniciador `INICIAR-BOTS.bat` chama `scripts/iniciar-bots.mjs`, que executa
`instagram-publish/whatsapp-bot/src/index.js` com diretório de trabalho `whatsapp-bot/`.
O painel desse processo usa a porta 3210. A raiz contém outro painel Express/SQLite;
`local-repo/` contém outras cópias. A integração foi adicionada ao processo do iniciador.
Nenhuma cópia foi removida e nenhum `.env` real foi alterado.

Etapas: provedor opcional → infraestrutura independente → conexão/QR e grupos →
fila persistente → painel e validação. Baileys permanece como padrão.

O fluxo mantém busca Shopee, filtros, preparo de imagem/legenda, conversão de links
Shopee/Mercado Livre, horários e callbacks de confirmação do Instagram. Mercado
Livre continua usando as ofertas locais/conversor existentes; não foi criado um
novo buscador automático de Mercado Livre.

## Versão e contratos

Release oficial consultada: 2.3.7. O exemplo Docker da documentação ainda apresenta
2.1.1; por isso o Compose fixa `evoapicloud/evolution-api:v2.3.7`, sem `latest`.
O cliente consulta `GET /` e exige a versão configurada antes de disponibilizar envios.

- `POST /instance/create`: `instanceName`, `integration: WHATSAPP-BAILEYS`, `qrcode`.
- `GET /instance/connect/{instance}` e `GET /instance/connectionState/{instance}`.
- `GET /group/fetchAllGroups/{instance}?getParticipants=false`: confirmado no código da release.
- `POST /message/sendMedia/{instance}`: JSON com `number`, `mediatype`, `mimetype`,
  `media` em base64 e `caption`; contrato JSON confirmado no código 2.3.7.
- Autenticação no cabeçalho `apikey`, somente pelo servidor.

Fontes:
- https://github.com/evolution-foundation/evolution-api/releases/tag/2.3.7
- https://docs.evolutionfoundation.com.br/evolution-api/install/docker
- https://docs.evolutionfoundation.com.br/evolution-api/create-instance
- https://docs.evolutionfoundation.com.br/evolution-api/connect-instance
- https://docs.evolutionfoundation.com.br/evolution-api/send-media-message
- https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/routes/group.router.ts
- https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/dto/sendMessage.dto.ts

## Ativação local

1. Instale/inicie Docker com suporte a Compose. Copie `infra/evolution/.env.example`
   para `infra/evolution/.env` e preencha dois segredos aleatórios.
2. Na raiz: `docker compose --env-file infra/evolution/.env -f infra/evolution/compose.yaml config --quiet`.
3. Inicie: `docker compose --env-file infra/evolution/.env -f infra/evolution/compose.yaml up -d`.
4. Encerre o bot pelo controle existente antes de trocar de provedor. No arquivo
   **whatsapp-bot/.env**, configure:

   ```dotenv
   WHATSAPP_PROVIDER=evolution
   EVOLUTION_API_URL=http://127.0.0.1:8080
   EVOLUTION_API_VERSION=2.3.7
   EVOLUTION_API_KEY=mesmo-segredo-do-compose
   EVOLUTION_INSTANCE=ofertas
   ```

5. Mantenha os envs existentes de Instagram, Shopee e Mercado Livre. Para escolher
   destinos antes do primeiro envio, configure `GROUP_IDS=` e `RUN_ON_START=false`.
6. Inicie por `INICIAR-BOTS.bat`. Abra http://127.0.0.1:3210 e a seção WhatsApp.
   Clique em conectar, escaneie o QR, consulte os grupos e salve os selecionados.
   O status é atualizado a cada dez segundos. QR expirado pode ser renovado pelo botão.
7. A seleção aceita somente grupos em que a instância participa. O cadastro consiste
   em selecionar destinos existentes; não cria grupos no WhatsApp.

Não importe `auth_info` para a Evolution. Ela possui sessão e volume próprios.
O seletor carrega somente um transporte para envio e não abre socket Baileys local
quando Evolution está ativa. Evite executar cópias ou ferramentas Baileys de grupos
simultaneamente para o mesmo fluxo. `GERAR-QR-WHATSAPP.bat` agora abre o gerador
independente da Evolution em http://127.0.0.1:3211. Ele nao inicia os bots nem
envia ofertas e preserva `auth_info`. O fluxo antigo do Baileys permanece em
`node scripts/conectar-whatsapp.mjs --new-session`. O QR tambem pode ser obtido
pelo painel quando o bot estiver configurado para Evolution.

## Fila, duplicação e falhas

Somente o provedor Evolution usa a nova fila. Arquivos no diretório `whatsapp-bot/`:
`whatsapp_queue.json`, `whatsapp_groups.json`, além do histórico `sent_deals.json`
existente. Cada destino gera um trabalho com imagem, legenda e oferta preparados.
A fila é sequencial, persiste antes de tentar enviar e respeita pausa e intervalo
existentes. Trabalhos pendentes são retomados nos ciclos seguintes após reinício.
Destinos desmarcados são cancelados; ofertas vencidas expiram.

HTTP/network/timeout de envio conserva a reserva existente e marca incerteza.
Trabalho interrompido durante envio também fica incerto, sem repetição automática.
Não é possível prometer entrega exatamente uma vez com essa API: um timeout pode
ocorrer depois do aceite. Confira a conversa antes de qualquer intervenção manual.
Falhas antes do envio mantêm o tratamento/cooldown existente. Desconexão impede o
consumo da fila e a consulta de status tenta novamente periodicamente.

O painel mostra fila/resultados por grupo; `sent` significa resposta aceita com ID
da mensagem, não confirmação de leitura ou recebimento pelo aparelho. A confirmação
aciona os mesmos callbacks de Stories, que mantêm seus próprios estados e retentativas.
Histórico normal é retido pela janela de deduplicação, e incertezas ficam preservadas.
A fila admite até 200 trabalhos pendentes para limitar armazenamento.

## Retorno ao Baileys

Encerre o bot, ajuste `WHATSAPP_PROVIDER=baileys`, restaure/verifique `GROUP_IDS` e
reinicie pelo BAT existente. Preserve todos os históricos e volumes. Não execute
`docker compose down -v`, pois apaga os dados da Evolution.

## Validação

Os testes automatizados usam API simulada e diretórios temporários. Validação com
Docker, QR real e envio para um grupo de teste depende da infraestrutura e conta
disponíveis; nenhuma ativação ou envio real faz parte dos testes locais.

Resultado local: 134 testes aprovados (129 existentes e cinco novos). Os novos
casos cobrem contratos HTTP, versão incompatível, proteção de segredos, fila com
múltiplos grupos, recuperação após interrupção, pausa e proteção das rotas do painel.
Docker não foi encontrado no terminal, portanto o Compose não foi executado nem
validado pelo binário Docker neste ambiente. Sintaxe JavaScript verificada com Node.
