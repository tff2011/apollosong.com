import "dotenv/config";
import { sendSaleAlert } from "../src/lib/telegram";

async function test() {
    console.log("Enviando alerta de teste no Telegram...");
    
    await sendSaleAlert({
        orderId: "test-123",
        locale: "pt",
        recipientName: "Maria",
        recipient: "wife",
        genre: "worship",
        vocals: "female",
        email: "teste@exemplo.com",
        currency: "BRL",
        grossAmountCents: 9900,
        netAmountCents: 8500,
        stripeFee: 1400,
        hasFastDelivery: true,
        hasExtraSong: false,
        utmSource: "instagram",
        utmMedium: "cpc",
        utmCampaign: "natal2024",
        deviceType: "mobile",
    });
    
    console.log("Teste completo!");
}

test().catch(console.error);
