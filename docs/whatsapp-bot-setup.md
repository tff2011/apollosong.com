# WhatsApp Bot - Tutorial de Configuracao

Guia passo a passo para obter todos os tokens necessarios para o bot de WhatsApp da Apollo Song.

## Tokens necessarios

| Env var | O que e | Onde pegar |
|---------|---------|------------|
| `WHATSAPP_ACCESS_TOKEN` | Token permanente da Cloud API | Meta Business > System User |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do numero de telefone | Meta Business > WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | Token de verificacao do webhook | Voce escolhe (qualquer string) |
| `META_APP_SECRET` | App Secret do Meta App | Meta Developers > App Settings |

---

## Passo 1: Criar uma conta Meta Business

1. Acesse https://business.facebook.com
2. Clique em **Criar conta** (ou use a conta existente)
3. Complete a verificacao do negocio (nome, endereco, etc.)

> Se ja tem conta do Facebook Ads, provavelmente ja tem uma conta Business.

---

## Passo 2: Criar um App no Meta Developers

1. Acesse https://developers.facebook.com/apps
2. Clique em **Criar aplicativo**
3. Selecione **Outro** como tipo de uso
4. Selecione **Business** como tipo de app
5. Preencha:
   - Nome do app: `Apollo Song WhatsApp`
   - Email de contato: seu email
   - Business portfolio: selecione sua conta Business
6. Clique em **Criar aplicativo**

### Pegar o META_APP_SECRET

1. No painel do app, va em **Configuracoes do aplicativo > Basico** (menu lateral esquerdo)
2. Em **Chave secreta do aplicativo**, clique em **Mostrar**
3. Copie o valor

```
META_APP_SECRET=abc123def456...
```

---

## Passo 3: Adicionar o produto WhatsApp ao App

1. No painel do app, va em **Adicionar produtos** (menu lateral)
2. Encontre **WhatsApp** e clique em **Configurar**
3. Selecione sua conta Business quando solicitado

---

## Passo 4: Adicionar um numero de telefone

### Opcao A: Usar numero de teste (desenvolvimento)

1. No menu lateral, va em **WhatsApp > Configuracao da API**
2. Voce vera um numero de teste ja criado (ex: +1 555 xxx xxxx)
3. Em **Para**, adicione seu numero pessoal para receber mensagens de teste
4. Clique em **Enviar mensagem** para verificar que funciona

### Opcao B: Adicionar numero real (producao)

1. Va em **WhatsApp > Configuracao da API**
2. Clique em **Adicionar numero de telefone**
3. Preencha:
   - Nome de exibicao: `Apollo Song`
   - Categoria: `Entretenimento`
4. Insira o numero de telefone (formato internacional, ex: +55 61 99579-0193)
5. Verifique via SMS ou ligacao
6. Aguarde aprovacao do Meta (pode levar 24-48h)

### Pegar o WHATSAPP_PHONE_NUMBER_ID

1. No menu **WhatsApp > Configuracao da API**
2. Em **Numero de telefone**, voce vera o **ID do numero de telefone**
3. E um numero longo tipo `123456789012345`

```
WHATSAPP_PHONE_NUMBER_ID=123456789012345
```

---

## Passo 5: Gerar Token de Acesso Permanente

O token temporario da pagina de configuracao expira em 24h. Para producao, crie um **System User** com token permanente.

### Criar System User

1. Acesse https://business.facebook.com/settings/system-users
2. Clique em **Adicionar**
3. Preencha:
   - Nome: `apollo-whatsapp-bot`
   - Funcao: **Admin**
4. Clique em **Criar usuario do sistema**

### Atribuir ativos ao System User

1. Clique no System User criado
2. Clique em **Adicionar ativos**
3. Selecione **Apps**
4. Encontre o app `Apollo Song WhatsApp`
5. Ative **Controle total**
6. Clique em **Salvar alteracoes**

### Gerar Token Permanente

1. Ainda na pagina do System User, clique em **Gerar novo token**
2. Selecione o app `Apollo Song WhatsApp`
3. Marque as permissoes:
   - `whatsapp_business_messaging` (enviar/receber mensagens)
   - `whatsapp_business_management` (gerenciar conta)
4. Clique em **Gerar token**
5. **COPIE O TOKEN AGORA** - ele so aparece uma vez!

```
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxx...
```

> IMPORTANTE: Este token nao expira. Guarde em local seguro.

---

## Passo 6: Configurar o Webhook

### Escolher o Verify Token

Escolha qualquer string secreta. Exemplo:

```
WHATSAPP_VERIFY_TOKEN=apollo-wa-verify-2024-seguro
```

### Registrar o Webhook no Meta

1. No painel do app, va em **WhatsApp > Configuracao**
2. Na secao **Webhook**, clique em **Editar**
3. Preencha:
   - **URL de retorno de chamada**: `https://apollosong.com/api/whatsapp/webhook`
   - **Token de verificacao**: o mesmo valor que escolheu para `WHATSAPP_VERIFY_TOKEN`
4. Clique em **Verificar e salvar**

> O Meta vai fazer um GET na URL com o token. O servidor precisa estar rodando e com a env var configurada para a verificacao funcionar. Se der erro, confira que o deploy ja foi feito.

### Assinar campos do Webhook

1. Apos verificar, na secao **Campos do webhook**
2. Clique em **Gerenciar**
3. Marque o campo **messages**
4. Clique em **Concluido**

---

## Passo 7: Configurar no Coolify

Adicione as 4 env vars no Coolify:

```env
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxx...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=apollo-wa-verify-2024-seguro
META_APP_SECRET=abc123def456...
```

Faca o redeploy.

---

## Passo 8: Testar

### Testar verificacao do webhook

```bash
curl "https://apollosong.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=apollo-wa-verify-2024-seguro&hub.challenge=test123"
```

Deve retornar: `test123`

### Testar envio de mensagem

1. Envie uma mensagem de texto pelo WhatsApp para o numero configurado
2. Verifique nos logs do worker se a mensagem chegou
3. O bot deve responder automaticamente com IA
4. Acesse `/admin/whatsapp` para ver a conversa no dashboard

### Testar em desenvolvimento (opcional)

Para testar localmente, use o [ngrok](https://ngrok.com) para expor seu localhost:

```bash
ngrok http 3000
```

Use a URL do ngrok como webhook URL no Meta (ex: `https://abc123.ngrok.io/api/whatsapp/webhook`).

---

## Troubleshooting

### Webhook nao verifica
- Confira que o `WHATSAPP_VERIFY_TOKEN` no Coolify e no Meta sao identicos
- Confira que o deploy foi feito e a rota `/api/whatsapp/webhook` esta acessivel

### Mensagens nao chegam
- Verifique se o campo `messages` esta assinado no webhook
- Verifique os logs do Next.js por erros de signature
- Confira que o `META_APP_SECRET` esta correto

### Bot nao responde
- Verifique se o worker esta rodando (`npm run worker:all`)
- Verifique se `OPENROUTER_API_KEY` esta configurado
- Verifique os logs do worker por erros `[WhatsApp]`

### Erro 401 no envio
- O token pode ter expirado (se usou token temporario)
- Gere um token permanente via System User (Passo 5)

### Mensagem fora da janela de 24h
- A Cloud API so permite mensagens livres dentro de 24h apos a ultima mensagem do cliente
- Fora dessa janela, precisa usar templates aprovados (nao implementado no MVP)
