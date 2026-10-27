# Implantação segura por SSH (Linux com systemd)

As correções de código não substituem a aplicação no servidor. Este roteiro assume Linux com systemd, Node 24 em `/usr/bin/node`, Python 3.12+ e projeto em `/opt/botafiliado`. Confirme esses pontos antes de copiar comandos. Não inclui envio de oferta ou publicação de teste real.

## 1. Antes de atualizar uma instalação existente

- Pare o bot pelo mecanismo atual e confirme que o processo encerrou. Não inicie o serviço novo ao lado do antigo. Se houver sessão interativa, use o terminal original; não use comandos para matar todos os processos Node.
- Faça backup privado **com o bot parado** de `whatsapp-bot/`, `instagram-publisher/state/`, `instagram-publisher/.env`, `instagram-publish/whatsapp-bot/instagram.sqlite*` e `instagram-publish/whatsapp-bot/instagram-media/`, além de qualquer `.env` utilizado pelo painel. Não envie esse backup ao GitHub/Trello.
- Se o bot era executado em `instagram-publish/whatsapp-bot`, seus arquivos de estado relativos precisam ser migrados para `whatsapp-bot` na raiz: `.env`, `auth_info/`, `bot.lock`, `sent_deals.json`, `whatsapp_queue.json`, `whatsapp_groups.json`, `bot_control.json`, `send_schedule.json`, `failed_deals.json` e `bot_report.json`. O novo bootstrap recusa iniciar se encontrar estado legado de envio. **Não sobrescreva nem una históricos automaticamente**: se ambos os locais já contêm estado, reconcilie antes. Migre também `instagram.sqlite`, seus arquivos `-wal`/`-shm` e `instagram-media/` da pasta aninhada para `whatsapp-bot/` na raiz, com o processo parado. Não combine bancos diferentes.
- Confira `git status --short`; preserve mudanças locais e credenciais antes de trocar de versão. Não use `git reset --hard` ou apague bancos/recibos para “destravar”.

## 2. Instalar dependências na cópia revisada

Na raiz do projeto, usando o usuário responsável pela instalação:

```sh
node --version
command -v node
npm ci --ignore-scripts
npm --prefix instagram-publish ci --ignore-scripts
npm --prefix instagram-publish/whatsapp-bot ci --ignore-scripts
python3 -m venv instagram-publisher/.venv
instagram-publisher/.venv/bin/python -m pip install -r instagram-publisher/requirements.txt
npm test
npm --prefix instagram-publish test
npm --prefix instagram-publish/whatsapp-bot test
instagram-publisher/.venv/bin/python -m unittest discover -s instagram-publisher -p test_publisher.py
npm audit --omit=dev
npm --prefix instagram-publish audit --omit=dev
npm --prefix instagram-publish/whatsapp-bot audit --omit=dev
```

Não instale com `sudo npm`. As suítes usam serviços simulados e diretórios temporários, sem envios reais. Um install com sucesso não certifica o servidor: todos os testes devem passar, inclusive importação/processamento real de imagens. O CI também testa Linux/Node 24.

## 3. Configuração privada e publicação desligada

Crie `.env` a partir do exemplo **somente se ainda não existir**:

```sh
test -e whatsapp-bot/.env || cp whatsapp-bot/.env.example whatsapp-bot/.env
test -e instagram-publisher/.env || cp instagram-publisher/.env.example instagram-publisher/.env
chmod 600 whatsapp-bot/.env instagram-publisher/.env
```

Edite `whatsapp-bot/.env` no servidor. Use credenciais válidas, grupos escolhidos por você, `DASHBOARD_PORT=3210` e mantenha inicialmente:

```dotenv
INSTAGRAM_TEST_MODE=true
INSTAGRAM_LIVE_APPROVED=false
INSTAGRAPI_LIVE_APPROVED=false
RUN_ON_START=false
```

Stories imediatos agora exigem **INSTAGRAPI_LIVE_APPROVED=true E INSTAGRAM_TEST_MODE=false** no ambiente do bot. Publicação Graph mantém sua aprovação independente. Os jobs pendentes não consomem tentativas enquanto desabilitados. Ativar publicação depois pode liberar jobs já pendentes: consulte status e reconcilie antes de ativar. A criação/login de sessão Python é uma ação explícita separada; não é necessária para testar o código.

Se usar o painel Shopee 3000, gere valores independentes de senha e chave em terminal privado e configure seu `.env`; o exemplo não é aceito. `NODE_ENV=production` exige senha, mesmo em loopback. Senha tem mínimo de 12 caracteres e segredo mínimo de 32 bytes; use saída aleatória longa, não uma frase previsível:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Não cole essa saída em chat, Trello ou commits. A troca do segredo encerra sessões antigas. A unidade abaixo executa o bot; o painel 3000 é um processo independente e não é necessário para o painel 3210.

## 4. Serviço supervisionado

Confira se o usuário dedicado existe antes de criá-lo:

```sh
getent passwd botafiliado
```

Se não existir, crie uma conta de serviço sem login, conforme a distribuição. Em Debian/Ubuntu:

```sh
sudo useradd --system --home /opt/botafiliado --shell /usr/sbin/nologin botafiliado
```

Confirme que `/opt/botafiliado` é a cópia correta, sem symlinks para outra aplicação. Prepare diretórios e permissões de escrita **somente do estado**; código deve permanecer legível e protegido contra escrita pelo serviço. O código não precisa de permissão de escrita; os estados ficam separados:

```sh
sudo install -d -o botafiliado -g botafiliado -m 700 /opt/botafiliado/instagram-publisher/state
sudo chown -R botafiliado:botafiliado /opt/botafiliado/whatsapp-bot /opt/botafiliado/instagram-publisher/state
sudo chmod 700 /opt/botafiliado/whatsapp-bot /opt/botafiliado/instagram-publisher/state
sudo chown botafiliado:botafiliado /opt/botafiliado/instagram-publisher/.env
```

Revise as permissões de arquivos preexistentes dentro dessas pastas. Se usar `.env` do publicador, ele deve ser legível somente pela conta de serviço/administrador. Não use `chmod 777`. Confirme Node 24 no caminho de `ExecStart` e Python da venv acessível à conta; ajuste a unidade se necessário.

```sh
sudo systemd-analyze verify infra/server/botafiliado.service
sudo install -m 644 infra/server/botafiliado.service /etc/systemd/system/botafiliado.service
sudo systemctl daemon-reload
sudo systemctl enable --now botafiliado
sudo systemctl status botafiliado --no-pager
sudo journalctl -u botafiliado -n 80 --no-pager
```

Só execute `enable --now` depois de revisar os grupos e a configuração: isso inicia o bot real e, quando chegar a janela de envio, pode enviar ofertas WhatsApp. Para inspecionar somente o painel sem bot use o script `dashboard`, não este serviço.

O serviço usa diretório fixo, máscara de permissão privada, reinício em falha com limite e 240 segundos para encerramento. Não reinicia indefinidamente um erro de configuração. O launcher Windows continua disponível, mas o servidor deve usar o processo em primeiro plano do serviço.

Logs do serviço vão para o journal. Para limitar o journal global a 512 MB e 14 dias, revise `infra/server/journald-botafiliado.conf`; essa configuração afeta **todos os serviços**, portanto não é instalada automaticamente. Logs antigos do launcher Windows precisam de rotação/arquivamento separado.

## 5. Painel privado e webhooks

No seu computador, substitua apenas usuário/host reais no comando:

```sh
ssh -N -L 3210:127.0.0.1:3210 usuario@servidor
```

Abra `http://127.0.0.1:3210`. Não libere 3210, 3000, 8080, Redis ou Postgres na internet. O bind em loopback da Evolution já está no compose. Não altere firewall global nem feche a porta SSH durante esta implantação.

Se precisar de webhook/mídia públicos, use `infra/server/nginx-public-locations.conf` **dentro de um virtual host TLS já configurado e dedicado**. Não substitua a configuração de outros sites. O exemplo permite somente webhook assinado e JPEG de publicação; o restante recebe 404. Faça `sudo nginx -t` antes de reload. Painéis rejeitam cabeçalhos de encaminhamento para impedir publicação acidental por proxy; não retire esse bloqueio para “fazer funcionar”. Um proxy que deliberadamente remova todos esses cabeçalhos ainda exige isolamento na borda: nenhuma aplicação consegue reconhecer tráfego que o proxy tornou indistinguível de acesso local.

## 6. Monitoramento, retenção e recuperação

```sh
node scripts/health-check.mjs
node scripts/instagrapi-stories.mjs status
```

O health check retorna código 1 para heartbeat vencido, WhatsApp offline, bot parado/erro de controle ou Stories bloqueados/incertos/falhos. Integre esse comando ao seu monitor externo; nenhum canal de alerta foi configurado automaticamente. Não reinicie o bot repetidamente para tentar contornar bloqueio de conta.

A fila WhatsApp passa a ter orçamento de 64 MB; arquivos existentes acima do orçamento falham fechados sem apagamento. Fotos de jobs terminais/incertos são retiradas, preservando recibos e deduplicação. Jobs incertos exigem reconciliação manual. Nunca apague a fila ou o histórico para liberar envios.

Para manutenção de fotos antigas de Stories **já publicados**, pare o bot e faça backup. Primeiro simule:

```sh
sudo systemctl stop botafiliado
node scripts/maintain-story-media.mjs
```

Confira a contagem. Para remover apenas JPEGs publicados com mais de 30 dias:

```sh
node scripts/maintain-story-media.mjs --apply
sudo systemctl start botafiliado
```

Recibos, SQLite, IDs e chaves de idempotência permanecem. A manutenção não remove mídia pendente, bloqueada ou incerta. Demais mídias do painel ainda exigem política operacional de retenção; monitore disco e faça backup antes de limpeza. Execute manutenção com a conta de serviço ou com acesso administrativo que preserve suas permissões.

## 7. Aceite e reversão

- Validar 48–72 horas: memória/disco, idade da fila, conexão, expiração de sessão e erros persistentes.
- Testar reboot com uma única instância e o mesmo estado, interrupção controlada em publicação simulada e restauração de backup em cópia isolada sem rede de publicação.
- Confirmar de outra máquina que as portas privadas não respondem; testar webhook inválido (403) e impedir painel público.
- Para reverter: parar serviço, preservar o estado atual, voltar o código para a versão anterior revisada e verificar compatibilidade de dados antes de reiniciar. Não restaurar backup antigo de deduplicação em cima de envios novos.

Essas etapas dependem do seu servidor e continuam pendentes no Trello até serem executadas. O quadro acompanha código validado separadamente de produção validada.
