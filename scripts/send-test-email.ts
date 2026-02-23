import "dotenv/config";
import nodemailer from "nodemailer";

const orderId = process.argv[2] || "test-order-123";
const recipientName = "Maria Santos";
const genre = "Gospel";
const locale = "pt";
const price = 148;
const currency = "BRL";
const email = "thiagofelizola@gmail.com";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

const formatPrice = (amount: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);

const checkoutUrl = `https://apollosong.com/pt/track-order?orderId=${orderId}&email=${encodeURIComponent(email)}`;

const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Pagamento Confirmado</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0F172A; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #E2E8F0;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0F172A;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #172554; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 1px solid #1E3A8A;">
                    <tr>
                        <td align="center" style="background-color: #1E3A8A; padding: 40px 0; border-bottom: 3px solid #B4975A;">
                           <span style="font-family: serif; font-size: 28px; font-weight: bold; color: #F5E6D3; letter-spacing: -0.5px;">
                               Apollo Song
                           </span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 50px;">
                            <h1 style="color: #F5E6D3; font-size: 24px; margin: 0 0 20px; text-align: center; font-weight: 300; letter-spacing: 1px;">Pagamento Confirmado</h1>

                            <p style="font-size: 16px; line-height: 1.6; color: #CBD5E1; margin-bottom: 20px;">
                                Olá!
                            </p>

                            <p style="font-size: 16px; line-height: 1.6; color: #CBD5E1; margin-bottom: 30px;">
                                É uma alegria ter você conosco. Confirmamos seu pagamento e nossa equipe já começou a trabalhar com todo carinho na canção dedicada a <strong>${recipientName}</strong>.
                            </p>

                            <p style="font-size: 16px; line-height: 1.6; color: #CBD5E1; margin-bottom: 40px; font-style: italic; color: #B4975A;">
                                "Em breve, você receberá uma obra única, feita para tocar o coração e eternizar esse momento."
                            </p>

                            <div style="background-color: #0F172A; border-radius: 8px; padding: 25px; margin-bottom: 40px; border: 1px solid #334155;">
                                <h3 style="color: #B4975A; font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 15px; border-bottom: 1px solid #334155; padding-bottom: 10px;">Resumo do Pedido</h3>

                                <div style="border-bottom: 1px solid #334155; padding: 12px 0;">
                                    <div style="color: #F5E6D3; font-weight: 500;">
                                        Música Personalizada para ${recipientName}
                                        <span style="float: right; color: #F5E6D3;">${formatPrice(price)}</span>
                                    </div>
                                    <div style="color: #94A3B8; font-size: 14px; margin-top: 4px;">Estilo Musical: <span style="color: #CBD5E1;">${genre}</span></div>
                                </div>

                                <div style="padding-top: 15px; margin-top: 5px; text-align: right;">
                                    <span style="color: #94A3B8; font-size: 14px; margin-right: 10px;">Total:</span>
                                    <span style="color: #B4975A; font-size: 20px; font-weight: bold;">${formatPrice(price)}</span>
                                </div>
                            </div>

                            <div style="text-align: center;">
                                <a href="${checkoutUrl}" style="background-color: #B4975A; color: #0F172A; padding: 15px 35px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">
                                    Acompanhar Pedido
                                </a>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0F172A; padding: 30px; text-align: center; border-top: 1px solid #1E3A8A;">
                            <p style="font-size: 12px; color: #64748B; margin: 0;">
                                Feito com fé e amor por Apollo Song.<br>
                                <a href="https://www.apollosong.com/pt" style="color: #B4975A; text-decoration: none;">www.apollosong.com/pt</a><br>
                                <span style="font-size: 10px; color: #475569;">Order ID: <span style="font-family: monospace;">${orderId}</span></span>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

async function sendTestEmail() {
    console.log("Enviando email de teste...");

    await transporter.sendMail({
        from: '"Apollo Song" <contact@apollosong.com>',
        to: email,
        subject: `Sua música para ${recipientName} está sendo criada! 🎵`,
        html,
    });

    console.log(`✅ Email enviado para ${email}`);
}

sendTestEmail().catch(console.error);
