"use server";

import { z } from "zod";
import { env } from "~/env";

const contactSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    message: z.string().min(10, "Message must be at least 10 characters"),
});

export async function sendContactMessage(prevState: { success: boolean; message: string } | null, formData: FormData) {
    const name = formData.get("name");
    const email = formData.get("email");
    const message = formData.get("message");

    const validatedFields = contactSchema.safeParse({
        name,
        email,
        message,
    });

    if (!validatedFields.success) {
        return {
            success: false,
            message: "Validation failed. Please check your inputs.",
        };
    }

    const { name: vName, email: vEmail, message: vMessage } = validatedFields.data;

    const telegramMessage = `
📩 *New Contact Form Submission*

👤 *Name:* ${vName}
📧 *Email:* ${vEmail}
📝 *Message:*
${vMessage}
  `;

    try {
        const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                chat_id: env.TELEGRAM_CHAT_ID,
                text: telegramMessage,
                parse_mode: "Markdown",
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error("Telegram API Error:", data);
            throw new Error("Failed to send message to Telegram");
        }

        return {
            success: true,
            message: "Message sent! We will get back to you shortly.",
        };
    } catch (error) {
        console.error("Contact Form Error:", error);
        return {
            success: false,
            message: "Something went wrong. Please try again later.",
        };
    }
}
