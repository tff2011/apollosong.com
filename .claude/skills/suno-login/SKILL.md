---
name: suno-login
description: Troca a conta do Suno AI quando acabar os creditos. Use quando precisar fazer login em outra conta do Suno.
disable-model-invocation: true
allowed-tools: Bash
---

# Trocar Conta do Suno AI

Voce quer trocar a conta do Suno porque os creditos acabaram. Siga este processo:

## 1. Verificar Pre-requisitos

Antes de continuar, confirme com o usuario:
- O worker/automacao esta parado?
- Esta na pasta correta do projeto?

Se o usuario disser que o worker esta rodando, instrua-o a parar primeiro (Ctrl+C no terminal do worker).

## 2. Executar o Script de Login

Execute o comando:

```bash
npx tsx scripts/suno-login.ts
```

Informe ao usuario:
- Um navegador vai abrir automaticamente
- Se aparecer a conta antiga, faca logout no Suno
- Faca login na nova conta do Suno
- Volte no terminal e pressione ENTER

## 3. Confirmar Sucesso

Apos o usuario pressionar ENTER, o script vai salvar:
- `suno-auth-state.json` - cookies e tokens
- `playwright-user-data/` - dados do navegador

Pergunte se funcionou.

## 4. Reiniciar o Worker

Instrua o usuario a iniciar a automacao novamente:

```bash
npm run worker:all
```

## Troubleshooting

Se o usuario reportar problemas:

### "Suno insiste em abrir com conta antiga"

Apague os dados do navegador e tente novamente:

```bash
rm -rf playwright-user-data/
npx tsx scripts/suno-login.ts
```

### "Login nao foi detectado"

Peca para o usuario:
1. Verificar se esta logado no Suno ANTES de apertar ENTER
2. Repetir o processo do inicio

### "Script deu erro"

Verifique se o playwright esta instalado:

```bash
npx playwright install chromium
```
