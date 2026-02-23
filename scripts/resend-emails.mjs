// Simple script to resend delivery emails via tRPC API
const orderIds = [
  'cmkikkfx7000sjl04vm49ym02',
  'cmkea41nr000fji04jr8jvjvy',
];

async function resendEmail(orderId) {
  const response = await fetch('http://localhost:3000/api/trpc/admin.sendSongDeliveryEmail', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      json: { orderId }
    }),
  });
  
  const result = await response.json();
  return result;
}

async function main() {
  console.log('Para reenviar os emails, acesse o painel admin e use o botão "Reenviar Email" para cada pedido:');
  console.log('');
  for (const orderId of orderIds) {
    console.log(`  - ${orderId}`);
    console.log(`    URL: http://localhost:3000/admin/leads?search=${orderId}`);
  }
}

main();
