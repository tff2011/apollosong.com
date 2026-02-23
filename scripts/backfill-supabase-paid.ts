/**
 * One-time backfill: fetch ALL paid orders from Supabase and update
 * matching SongOrder leads (utmSource = "supabase-import").
 *
 * Usage:  npx tsx scripts/backfill-supabase-paid.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;
const SUPABASE_ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || "orders";
const SUPABASE_LEAD_SOURCE = process.env.SUPABASE_LEAD_SOURCE || "supabase-import";

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickFirstNonEmpty(values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = safeString(value);
    if (trimmed) return trimmed;
  }
  return "";
}

type SupabaseOrderRecord = {
  id?: string | number;
  transaction_id?: string | number;
  customer_email?: string;
  customer_whatsapp?: string;
  amount_cents?: number;
  status?: string;
  paid_at?: string;
  created_at?: string;
};

async function fetchAllPaidOrders(): Promise<SupabaseOrderRecord[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY are required");
  }

  const all: SupabaseOrderRecord[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${SUPABASE_ORDERS_TABLE}`);
    url.searchParams.set(
      "select",
      "id,transaction_id,customer_email,customer_whatsapp,amount_cents,status,paid_at,created_at"
    );
    url.searchParams.set("paid_at", "not.is.null");
    url.searchParams.set("order", "paid_at.asc");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const payload = await response.json();
    const records = Array.isArray(payload) ? (payload as SupabaseOrderRecord[]) : [];
    all.push(...records);

    console.log(`  fetched ${records.length} records (offset=${offset})`);

    if (records.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

async function main() {
  console.log("=== Supabase Paid Orders Backfill ===\n");

  console.log("1) Fetching ALL paid orders from Supabase...");
  const records = await fetchAllPaidOrders();
  console.log(`   Total paid orders: ${records.length}\n`);

  if (!records.length) {
    console.log("No paid orders found. Nothing to do.");
    return;
  }

  let updatedCount = 0;
  let skippedNoMatch = 0;
  let skippedAlreadyPaid = 0;

  console.log("2) Matching against local leads...\n");

  for (const record of records) {
    if (!record.paid_at) continue;
    const paidAt = new Date(record.paid_at);
    if (Number.isNaN(paidAt.getTime())) continue;

    const supabaseOrderId = pickFirstNonEmpty([
      safeString(record.id),
    ]);
    const supabaseTransactionId = pickFirstNonEmpty([
      safeString(record.transaction_id),
    ]);
    const emailRaw = safeString(record.customer_email);
    const email = emailRaw ? normalizeEmail(emailRaw) : "";

    // Try match by order/transaction ID first
    let lead = null as {
      id: string;
      email: string;
      supabasePaidAt: Date | null;
      supabaseOrderId: string | null;
      supabaseTransactionId: string | null;
    } | null;

    const matchClauses = [
      supabaseOrderId ? { supabaseOrderId } : null,
      supabaseTransactionId ? { supabaseTransactionId } : null,
    ].filter(Boolean) as Array<Record<string, string>>;

    if (matchClauses.length) {
      lead = await db.songOrder.findFirst({
        where: {
          utmSource: SUPABASE_LEAD_SOURCE,
          OR: matchClauses,
        },
        select: {
          id: true,
          email: true,
          supabasePaidAt: true,
          supabaseOrderId: true,
          supabaseTransactionId: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }

    // Fallback: match by email
    if (!lead && email) {
      lead = await db.songOrder.findFirst({
        where: {
          utmSource: SUPABASE_LEAD_SOURCE,
          email,
        },
        select: {
          id: true,
          email: true,
          supabasePaidAt: true,
          supabaseOrderId: true,
          supabaseTransactionId: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!lead) {
      skippedNoMatch += 1;
      continue;
    }

    // Skip if already marked as paid with same or newer date
    if (lead.supabasePaidAt && lead.supabasePaidAt.getTime() >= paidAt.getTime()) {
      skippedAlreadyPaid += 1;
      continue;
    }

    await db.songOrder.update({
      where: { id: lead.id },
      data: {
        supabasePaidAt: paidAt,
        supabaseOrderStatus: record.status || "PAID",
        supabaseOrderId: lead.supabaseOrderId || supabaseOrderId || null,
        supabaseTransactionId: lead.supabaseTransactionId || supabaseTransactionId || null,
      },
    });

    updatedCount += 1;
    console.log(`   ✅ ${lead.email} → PAGO (${paidAt.toISOString()})`);
  }

  console.log(`\n=== Resultado ===`);
  console.log(`  Atualizados:      ${updatedCount}`);
  console.log(`  Sem match:        ${skippedNoMatch}`);
  console.log(`  Já marcados pago: ${skippedAlreadyPaid}`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
