# Processo de Revisão de Letras

Guia para corrigir letras quando o cliente solicita revisão.

## 1. Buscar o pedido

```bash
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.songOrder.findUnique({
    where: { id: 'ORDER_ID_AQUI' },
  });
  console.log(JSON.stringify(order, null, 2));
}

main().catch(console.error).finally(() => prisma.\$disconnect());
"
```

Campos importantes:
- `status`: deve estar em `REVISION`
- `revisionNotes`: descrição do que o cliente quer corrigir
- `revisionType`: tipo de revisão (ex: `LYRICS_ERROR`)
- `lyrics`: letra atual que precisa ser corrigida

## 2. Corrigir a letra

Após identificar os erros nas `revisionNotes`, atualizar a letra:

```bash
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.songOrder.findUnique({
    where: { id: 'ORDER_ID_AQUI' },
    select: { lyrics: true }
  });

  // Aplicar as correções necessárias
  let newLyrics = order.lyrics
    .replace('texto errado 1', 'texto correto 1')
    .replace('texto errado 2', 'texto correto 2');

  const updated = await prisma.songOrder.update({
    where: { id: 'ORDER_ID_AQUI' },
    data: { lyrics: newLyrics },
    select: { id: true, lyrics: true }
  });

  console.log('=== LETRA CORRIGIDA ===');
  console.log(updated.lyrics);
}

main().catch(console.error).finally(() => prisma.\$disconnect());
"
```

## 3. Regravar a música no Suno

1. Copiar a letra corrigida
2. Acessar o Suno e criar nova música com a letra atualizada
3. Usar o mesmo `musicPrompt` do pedido original
4. Baixar as duas versões geradas

## 4. Upload manual das músicas

Fazer upload dos arquivos MP3 para o R2 seguindo a estrutura:
- `songs/{ORDER_ID}/song-1.mp3`
- `songs/{ORDER_ID}/song-2.mp3`

## 5. Finalizar o pedido

Após upload, atualizar o status para `COMPLETED`:

```bash
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.songOrder.update({
    where: { id: 'ORDER_ID_AQUI' },
    data: {
      status: 'COMPLETED',
      songUploadedAt: new Date(),
      songUploadedAt2: new Date(),
    },
    select: { id: true, status: true }
  });
  console.log('Pedido finalizado:', updated.status);
}

main().catch(console.error).finally(() => prisma.\$disconnect());
"
```

## Exemplo real

**Pedido:** `cmk51esuc0002l504av90fvb5`

**Solicitação do cliente:**
> Está escrito a terceira de nove que o tempo levou, mas é a segunda de nove que o tempo levou.
> Depois na 5a estrofe esta escrito irmãos, mas são irmãs.

**Correções aplicadas:**
```javascript
.replace('A terceira de nove que o tempo levou', 'A segunda de nove que o tempo levou')
.replace('Sete irmãos te chamando', 'Sete irmãs te chamando')
```

**Preferência:** Cliente indicou preferir a Opção 2 da música.
