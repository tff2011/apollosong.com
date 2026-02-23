import { PrismaClient } from '@prisma/client';
import { sendEmail } from '~/server/email/mailer';
import { buildSongDeliveryEmail } from '~/server/email/song-delivery';

const db = new PrismaClient();

const orderIds = [
  'cmkikkfx7000sjl04vm49ym02',
  'cmkea41nr000fji04jr8jvjvy',
];

async function main() {
  for (const orderId of orderIds) {
    const order = await db.songOrder.findUnique({
      where: { id: orderId },
    });
    
    if (!order) {
      console.log(`Order ${orderId} not found`);
      continue;
    }
    
    console.log(`\nReenviando email para: ${order.email} (${order.recipientName})`);
    
    try {
      const emailContent = buildSongDeliveryEmail({
        recipientName: order.recipientName,
        songUrl: order.songFileUrl!,
        songUrl2: order.songFileUrl2,
        orderId: order.id,
        locale: order.locale,
      });
      
      await sendEmail({
        to: order.email,
        subject: emailContent.subject,
        html: emailContent.html,
      });
      
      console.log(`  ✓ Email enviado com sucesso!`);
    } catch (error) {
      console.log(`  ✗ Erro: ${error}`);
    }
  }
}

main().catch(console.error).finally(() => db.$disconnect());
