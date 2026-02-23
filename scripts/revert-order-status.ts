import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const email = process.argv[2] || 'shirleykrenak@gmail.com';

  const order = await db.songOrder.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' }
  });

  if (order) {
    console.log('Found order:', order.id, 'Current status:', order.status);

    const updated = await db.songOrder.update({
      where: { id: order.id },
      data: { status: 'PAID' }
    });

    console.log('✓ Updated to:', updated.status);
  } else {
    console.log('Order not found for email:', email);
  }

  await db.$disconnect();
}

main().catch(console.error);
