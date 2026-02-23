import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "./dashboard-shell";
import { db } from "~/server/db";

export default async function AdminDashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/admin/login");
    }

    const adminUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: { adminEnabled: true },
    });

    if (!adminUser?.adminEnabled) {
        redirect("/admin/login");
    }

    return <DashboardShell>{children}</DashboardShell>;
}
