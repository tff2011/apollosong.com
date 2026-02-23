import { type Metadata } from "next";

export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/whatsapp-favicon.svg", type: "image/svg+xml" }],
    shortcut: "/whatsapp-favicon.svg",
  },
};

export default function AdminWhatsappLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
