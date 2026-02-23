# WhatsApp Bot - Como Funciona

Este documento explica o fluxo real do bot de WhatsApp da Apollo Song no codigo atual.

## Visao geral

O bot funciona em 4 blocos:

1. `Webhook` recebe evento da Meta.
2. Mensagem valida entra na fila BullMQ `whatsapp-response`.
3. `Worker` processa mensagem, salva no banco e chama IA.
4. Resposta e status ficam persistidos no banco e visiveis no `/admin/whatsapp`.

Principais arquivos:

- `src/app/api/whatsapp/webhook/route.ts`
- `src/server/queues/whatsapp-response.ts`
- `src/server/workers/all-workers.ts`
- `src/lib/whatsapp-ai.ts`
- `src/lib/whatsapp.ts`
- `src/server/api/routers/admin.ts`
- `prisma/schema.prisma`

## Fluxo ponta a ponta

### 1) Webhook (entrada da Meta)

Arquivo: `src/app/api/whatsapp/webhook/route.ts`

- `GET` faz verificacao de webhook (`hub.verify_token`).
- `POST` valida assinatura `x-hub-signature-256` quando `META_APP_SECRET` existe.
- Processa dois tipos de evento:
  - `statuses`: persistencia de status de entrega/erro (inclui historico no `metadata.wa.statusEvents`).
  - `messages`: texto e midia suportada (`text`, `audio`, `image`, `video`, `document`, `sticker`).
- Faz idempotencia por `waMessageId` antes de enfileirar.
- Enfileira job via `enqueueWhatsAppResponse(...)`.
- Sempre responde HTTP `200` para a Meta apos processar o payload.

### 2) Fila

Arquivo: `src/server/queues/whatsapp-response.ts`

- Nome da fila: `whatsapp-response`.
- Job name: `process-whatsapp-message`.
- `jobId`: `wa_${waMessageId}` (evita duplicidade no BullMQ).
- Retry padrao:
  - `attempts: 3`
  - `backoff` exponencial com `10s`

### 3) Worker de resposta

Arquivo: `src/server/workers/all-workers.ts`

Responsabilidades:

1. Baixar midia se necessario.
2. Transcrever audio (quando tipo `audio`).
3. Criar/atualizar conversa.
4. Salvar mensagem inbound.
5. Gerar resposta com IA.
6. Enviar resposta e salvar outbound.
7. Fazer handoff para humano quando preciso.

Detalhes importantes:

- Detecta idioma por heuristica (`detectWhatsAppLocale`) com `pt`, `en`, `es`, `fr`, `it`.
- Nova conversa nasce com locale detectado.
- Conversa antiga em `pt` pode migrar para `en/es/fr/it` quando detectado.
- Se audio falhar na transcricao, envia fallback pedindo texto e encerra o job.
- Midia sem caption (ex: imagem muda) nao gera resposta da IA.
- Se `conversation.isBot = false`, o worker nao responde automaticamente.
- Marca mensagem como lida via Cloud API (`markAsRead`).

### 4) Geração de resposta (IA)

Arquivo: `src/lib/whatsapp-ai.ts`

Passos:

1. Carrega ultimas 20 mensagens da conversa.
2. Carrega `SupportKnowledge` filtrando por:
   - `isActive = true`
   - `locale in [locale_da_conversa, "all"]`
   - `channel in ["WHATSAPP", "BOTH"]`
3. Busca pedidos por:
   - Telefone (normalizacao de numero e SQL com `REGEXP_REPLACE` em `backupWhatsApp`)
   - Emails citados no historico
4. Monta `ORDER CONTEXT` com dados dos pedidos encontrados.
5. Chama modelo no OpenRouter (`OPENROUTER_SUPPORT_MODEL`, default `openai/gpt-4.1-mini`).
6. Interpreta tags de controle:
   - `[LOOKUP_ORDER:...]`: faz nova busca por email/ID/telefone e chama IA de novo.
   - `[ESCALATE]`: sinaliza transferir para humano.
7. Limpa tags da resposta antes de enviar para o cliente.

## Escalonamento para humano

Fluxo automatico:

- Se a IA retornar `[ESCALATE]`, o worker:
  - envia a resposta ao cliente,
  - atualiza conversa com `isBot = false`,
  - classifica o assunto da conversa (`PEDIDO_STATUS`, `PAGAMENTO`, `REVISAO`, `TECNICO`, `COMERCIAL`, `OUTROS`),
  - faz atribuicao automatica de atendente com base na classificacao,
  - envia alerta no Telegram com classificacao e atendente escolhido.

Classificacao e atribuicao:

- A LLM inclui tag invisivel `[CLASSIFY:CATEGORIA]` no final da resposta.
- Se houver escalonamento, pode incluir `[ESCALATE]` ou `[ESCALATE:CATEGORIA]`.
- O sistema remove essas tags antes de enviar a mensagem ao cliente.
- A classificacao e o atendente ficam salvos em `WhatsAppMessage.metadata.routing`.
- O `/admin/whatsapp` mostra labels com classificacao e responsavel na lista e no cabecalho da conversa.

Fluxo manual (admin):

Arquivo: `src/server/api/routers/admin.ts`

- `sendWhatsAppReply`:
  - envia mensagem manual,
  - salva outbound com `senderType = "admin"`,
  - desativa bot automaticamente (`isBot = false`) se ainda estava ativo.
- `toggleWhatsAppBot`: liga/desliga bot por conversa.

## Lock de conversa (multiplos atendentes)

Para evitar dois atendentes respondendo a mesma conversa ao mesmo tempo, existe lock com TTL:

- `claimWhatsAppConversation`: assume a conversa para um atendente.
- `heartbeatWhatsAppConversation`: renova o lock enquanto o atendente estiver na conversa.
- `releaseWhatsAppConversation`: libera a conversa.
- `sendWhatsAppReply` valida lock:
  - se a conversa estiver lockada por outro atendente, bloqueia envio.
  - se estiver livre, associa lock ao atendente que enviou.

Detalhes:

- TTL padrao: 5 minutos.
- Campos usados em `WhatsAppConversation`:
  - `assignedTo`
  - `assignedAt`
  - `lockExpiresAt`
- O `/admin/whatsapp` mostra quem está atendendo e bloqueia envio quando lockado por outro atendente.

## Persistencia no banco

Arquivo: `prisma/schema.prisma`

### `WhatsAppConversation`

- `waId` unico
- `locale`
- `isBot` (controle de bot vs humano)
- timestamps de ultima msg do cliente e do bot

### `WhatsAppMessage`

- `waMessageId` unico (idempotencia)
- `direction` (`inbound`/`outbound`)
- `senderType` (`customer`/`bot`/`admin`)
- `metadata` JSON (status callbacks, dados de midia, ids Meta)

## Integracao com Cloud API

Arquivo: `src/lib/whatsapp.ts`

Funcoes principais:

- `sendTextMessage(to, body)`: envia texto via Graph API.
- `markAsRead(messageId)`: marca mensagem como lida.
- `downloadMedia(mediaId)`: baixa midia (2 etapas: metadata + binario).
- `transcribeAudio(...)`: converte audio para WAV via `ffmpeg` e transcreve usando OpenRouter.

## Variaveis de ambiente criticas

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_GRAPH_VERSION` (opcional, default `v21.0`)
- `META_APP_SECRET`
- `OPENROUTER_API_KEY`
- `OPENROUTER_SUPPORT_MODEL` (opcional)
- `NEXT_PUBLIC_SITE_URL`
- `TELEGRAM_BOT_TOKEN` (alertas de erro/escalacao)
- `WHATSAPP_ASSIGNEES_DEFAULT` (lista separada por virgula, ex: `Thiago,Ana`)
- `WHATSAPP_ASSIGNEES_PEDIDO_STATUS`
- `WHATSAPP_ASSIGNEES_PAGAMENTO`
- `WHATSAPP_ASSIGNEES_REVISAO`
- `WHATSAPP_ASSIGNEES_TECNICO`
- `WHATSAPP_ASSIGNEES_COMERCIAL`
- `WHATSAPP_ASSIGNEES_OUTROS`

## Operacao

- Rodar app: `npm run dev`
- Rodar worker: `npm run worker:all`
- Painel de atendimento: `/admin/whatsapp`
- Base de conhecimento: `/admin/knowledge`

## Regras de KB para WhatsApp

Para uma entrada ser usada pelo bot do WhatsApp:

- `isActive = true`
- `channel = WHATSAPP` ou `channel = BOTH`
- `locale` igual ao locale da conversa ou `all`

Se a entrada for `EMAIL`, ela nao entra no contexto do bot do WhatsApp.

### Como o bot le a base de conhecimento (passo a passo)

1. A IA recebe o `locale` da conversa que foi definido no worker de WhatsApp.
2. Antes de responder, o modulo `generateWhatsAppAiResponse` consulta `SupportKnowledge` no banco.
3. A consulta aplica os filtros:
- `isActive = true`
- `channel in ["WHATSAPP", "BOTH"]`
- `locale in [locale_da_conversa, "all"]`
4. Os registros encontrados sao concatenados em texto (`categoria + titulo + conteudo`) para formar `knowledgeContext`.
5. Esse `knowledgeContext` entra no `system prompt` no bloco `KNOWLEDGE BASE`.
6. A resposta final da LLM usa esse bloco junto com historico da conversa e `ORDER CONTEXT`.

Referencias no codigo:

- `src/lib/whatsapp-ai.ts` (query da KB e montagem de contexto)
- `src/server/workers/all-workers.ts` (definicao/atualizacao de `locale` da conversa)

## Observacoes praticas

- O webhook faz dedupe por `waMessageId`, e a fila tambem usa `jobId` por `waMessageId`.
- O historico de status da Meta fica em `metadata.wa.statusEvents` (ultimos 25 eventos).
- Fora da janela de 24h da Meta, mensagens livres podem falhar (dependendo da politica da Cloud API).
