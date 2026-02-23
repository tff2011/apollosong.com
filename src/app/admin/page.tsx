import { redirect } from "next/navigation";
import { getDefaultAdminPath } from "~/lib/admin/permissions";
import { auth } from "~/server/auth";

export default async function AdminPage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/admin/login");
    }

    redirect(getDefaultAdminPath(session.user.adminRole, session.user.adminPermissions));
}
