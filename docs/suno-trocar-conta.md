# Trocar conta do Suno (passo a passo simples)

Este guia e para quem vai rodar a automacao localmente e precisa trocar a conta do Suno (ou rodar varias contas em paralelo).

## Antes de comecar

1. Pare a automacao/worker que esta rodando no terminal.
2. Garanta que voce esta na pasta do projeto.

## Passo a passo (1 conta)

1. Rode o comando:

```bash
npx tsx scripts/suno-login.ts
```

2. Vai abrir um navegador.
3. Se aparecer a conta antiga:
   - Faca logout no Suno.
   - Faca login na nova conta.
4. Volte no terminal e pressione ENTER.
5. O script vai salvar a sessao nova nos arquivos:
   - `suno-auth-state.json`
   - `playwright-user-data/` (perfil do browser)
6. Inicie a automacao novamente.

## Passo a passo (varias contas em paralelo)

Cada conta precisa ter seus proprios arquivos. Use estas variaveis:

- `SUNO_AUTH_STATE_PATH` (arquivo de sessao)
- `SUNO_USER_DATA_DIR` (perfil do browser / Patchright)
- `SUNO_AUTH_STATE_TMP_PATH` (temp quando usar auth state via env)

### 1) Criar a sessao de cada conta

Forma mais simples (recomendado):

```bash
npm run suno:login1
```

```bash
npm run suno:login2
```

```bash
npm run suno:login3
```

```bash
npm run suno:login4
```

Alternativa (manual, se quiser):

```bash
SUNO_AUTH_STATE_PATH=./suno-auth-state-a.json \
SUNO_USER_DATA_DIR=./playwright-user-data-a \
npx tsx scripts/suno-login.ts
```

```bash
SUNO_AUTH_STATE_PATH=./suno-auth-state-b.json \
SUNO_USER_DATA_DIR=./playwright-user-data-b \
npx tsx scripts/suno-login.ts
```

```bash
SUNO_AUTH_STATE_PATH=./suno-auth-state-c.json \
SUNO_USER_DATA_DIR=./playwright-user-data-c \
npx tsx scripts/suno-login.ts
```

```bash
SUNO_AUTH_STATE_PATH=./suno-auth-state-d.json \
SUNO_USER_DATA_DIR=./playwright-user-data-d \
npx tsx scripts/suno-login.ts
```

### 2) Rodar a automacao em paralelo (localhost)

```bash
PORT=3000 SUNO_LOCAL_MODE=true \
SUNO_AUTH_STATE_PATH=./suno-auth-state-a.json \
SUNO_USER_DATA_DIR=./playwright-user-data-a \
SUNO_AUTH_STATE_TMP_PATH=./tmp/suno-auth-state-a.json \
npm run dev
```

```bash
PORT=3001 SUNO_LOCAL_MODE=true \
SUNO_AUTH_STATE_PATH=./suno-auth-state-b.json \
SUNO_USER_DATA_DIR=./playwright-user-data-b \
SUNO_AUTH_STATE_TMP_PATH=./tmp/suno-auth-state-b.json \
npm run dev
```

```bash
PORT=3002 SUNO_LOCAL_MODE=true \
SUNO_AUTH_STATE_PATH=./suno-auth-state-c.json \
SUNO_USER_DATA_DIR=./playwright-user-data-c \
SUNO_AUTH_STATE_TMP_PATH=./tmp/suno-auth-state-c.json \
npm run dev
```

```bash
PORT=3003 SUNO_LOCAL_MODE=true \
SUNO_AUTH_STATE_PATH=./suno-auth-state-d.json \
SUNO_USER_DATA_DIR=./playwright-user-data-d \
SUNO_AUTH_STATE_TMP_PATH=./tmp/suno-auth-state-d.json \
npm run dev
```

Repita o mesmo padrao para conta C, D, etc (troque o sufixo).

## Opcional: arquivos .env por conta

Crie um arquivo por conta para facilitar:

` .env.suno-a `
```
SUNO_LOCAL_MODE=true
SUNO_AUTH_STATE_PATH=./suno-auth-state-a.json
SUNO_USER_DATA_DIR=./playwright-user-data-a
SUNO_AUTH_STATE_TMP_PATH=./tmp/suno-auth-state-a.json
PORT=3000
NEXT_DIST_DIR=./.next-dev-a
```

` .env.suno-b `
```
SUNO_LOCAL_MODE=true
SUNO_AUTH_STATE_PATH=./suno-auth-state-b.json
SUNO_USER_DATA_DIR=./playwright-user-data-b
SUNO_AUTH_STATE_TMP_PATH=./tmp/suno-auth-state-b.json
PORT=3001
NEXT_DIST_DIR=./.next-dev-b
```

` .env.suno-c `
```
SUNO_LOCAL_MODE=true
SUNO_AUTH_STATE_PATH=./suno-auth-state-c.json
SUNO_USER_DATA_DIR=./playwright-user-data-c
SUNO_AUTH_STATE_TMP_PATH=./tmp/suno-auth-state-c.json
PORT=3002
NEXT_DIST_DIR=./.next-dev-c
```

` .env.suno-d `
```
SUNO_LOCAL_MODE=true
SUNO_AUTH_STATE_PATH=./suno-auth-state-d.json
SUNO_USER_DATA_DIR=./playwright-user-data-d
SUNO_AUTH_STATE_TMP_PATH=./tmp/suno-auth-state-d.json
PORT=3003
NEXT_DIST_DIR=./.next-dev-d
```

Para rodar:
```bash
export $(cat .env.suno-a | xargs) && npm run dev
```

```bash
export $(cat .env.suno-b | xargs) && npm run dev
```

No Windows (sem `bash`), use os scripts do `package.json`:

- `npm run dev1`
- `npm run dev2`
- `npm run dev3`
- `npm run dev4`

Para subir tudo de uma vez (4 instancias + Velite):

- `npm run dev:farm`

## Opcional: modo rapido (fast mode)

Se quiser reduzir o tempo "entre etapas" (nao muda o tempo de geracao do Suno):

- `SUNO_FAST_MODE=true` diminui sleeps fixos e faz polling mais frequente.
- `SUNO_RESOURCE_BLOCKING=light` (ou `aggressive`) bloqueia imagens/fontes (e em `aggressive` tambem media) para acelerar a UI.
- `SUNO_DISABLE_COFFEE_BREAKS=true` desativa as pausas aleatorias do `FatigueManager` (podem pausar 2-5 min).

## Opcional: sirene de CAPTCHA

Se voce costuma deixar a automacao rodando "de longe", da pra tocar uma sirene quando detectar CAPTCHA:

- `SUNO_CAPTCHA_SIREN=true` (ou `1`) toca uma sirene (no browser quando `SUNO_HEADLESS=false`, com fallback no sistema/terminal).
- `SUNO_CAPTCHA_SIREN_DURATION_MS=6500` controla por quanto tempo a sirene toca. Aceita `ms` (padrao), ou sufixos `s/m/h` (ex: `10s`, `2m`, `6500ms`).
- (macOS) `SUNO_CAPTCHA_SIREN_SOUND_PATH=/System/Library/Sounds/Sosumi.aiff` escolhe o som (opcional).
- (macOS) `SUNO_CAPTCHA_SIREN_VOLUME=1` controla volume do `afplay` (0.05 a 2).

## Se nao funcionar

- Se a conta B/C/D abrir logada na A, quase sempre e porque o `SUNO_USER_DATA_DIR` esta repetido (ou voce reaproveitou a pasta). Apague a pasta `playwright-user-data-*` daquela conta e rode `npm run suno:loginX` de novo.
- Se o Suno insistir em abrir com a conta antiga, apague a pasta `playwright-user-data/` (ou a pasta da conta) e rode o script de novo.
- Se o terminal disser que o login nao foi detectado, repita o processo e confirme que voce esta logado antes de apertar ENTER.
- Se estiver usando `SUNO_AUTH_STATE_JSON`, sempre defina `SUNO_AUTH_STATE_TMP_PATH` diferente por conta para evitar conflito.
