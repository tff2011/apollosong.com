import { db } from "~/server/db";

/**
 * When a supabase-import order becomes PAID, convert its utmSource
 * to "supabase-convertido" so it moves from the MusicLovely tab
 * to the Apollo tab in the admin dashboard.
 *
 * Idempotent: calling on non-supabase orders is a no-op (0 rows updated).
 */
export async function convertSupabaseImportOnPaid(
  orderIds: string | string[]
): Promise<number> {
  const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
  if (ids.length === 0) return 0;

  const result = await db.songOrder.updateMany({
    where: {
      id: { in: ids },
      utmSource: "supabase-import",
    },
    data: {
      utmSource: "supabase-convertido",
    },
  });

  if (result.count > 0) {
    console.log(
      `[supabase-conversion] Converted ${result.count} order(s) from supabase-import → supabase-convertido: ${ids.join(", ")}`
    );
  }

  return result.count;
}
