import { NextResponse } from "next/server";
import { type AdminPermission } from "~/lib/admin/permissions";
import {
  getAdminUserById,
  type AdminUserRecord,
  hasAdminPermission,
} from "~/server/auth/admin-access";
import { auth } from "~/server/auth";

type AdminApiAccessOk = {
  ok: true;
  adminUser: AdminUserRecord;
};

type AdminApiAccessError = {
  ok: false;
  response: NextResponse;
};

export type AdminApiAccessResult = AdminApiAccessOk | AdminApiAccessError;

export async function requireAdminApiAccess(permission?: AdminPermission): Promise<AdminApiAccessResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const adminUser = await getAdminUserById(userId);
  if (!adminUser || !adminUser.adminEnabled) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (permission && !hasAdminPermission(adminUser, permission)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    adminUser,
  };
}
