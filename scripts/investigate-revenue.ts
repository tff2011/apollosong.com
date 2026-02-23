import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const db = new PrismaClient();

  const paidStatuses = ["PAID", "IN_PROGRESS", "COMPLETED"] as const;

  // 1. Current month boundaries (São Paulo timezone)
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 2. Dashboard calculation: sum stripeNetAmount where createdAt >= thisMonthStart AND status in PAID/IN_PROGRESS/COMPLETED
  const dashboardAgg = await db.songOrder.aggregate({
    _sum: { stripeNetAmount: true },
    _count: true,
    where: {
      status: { in: [...paidStatuses] },
      stripeNetAmount: { not: null },
      createdAt: { gte: thisMonthStart },
    },
  });

  console.log("\n=== DASHBOARD CALCULATION (createdAt >= thisMonthStart) ===");
  console.log(`  Period: ${thisMonthStart.toISOString()} → now`);
  console.log(`  Orders counted: ${dashboardAgg._count}`);
  console.log(`  Net total (USD): $${((dashboardAgg._sum.stripeNetAmount || 0) / 100).toFixed(2)}`);

  // 3. Alternative: sum stripeNetAmount where paymentCompletedAt >= thisMonthStart
  const paymentDateAgg = await db.songOrder.aggregate({
    _sum: { stripeNetAmount: true },
    _count: true,
    where: {
      status: { in: [...paidStatuses] },
      stripeNetAmount: { not: null },
      paymentCompletedAt: { gte: thisMonthStart },
    },
  });

  console.log("\n=== STRIPE-LIKE CALCULATION (paymentCompletedAt >= thisMonthStart) ===");
  console.log(`  Period: ${thisMonthStart.toISOString()} → now`);
  console.log(`  Orders counted: ${paymentDateAgg._count}`);
  console.log(`  Net total (USD): $${((paymentDateAgg._sum.stripeNetAmount || 0) / 100).toFixed(2)}`);

  console.log(`\n=== DIFFERENCE ===`);
  const diff = ((paymentDateAgg._sum.stripeNetAmount || 0) - (dashboardAgg._sum.stripeNetAmount || 0)) / 100;
  console.log(`  Delta: $${diff.toFixed(2)}`);

  // 4. Orders with PAID/IN_PROGRESS/COMPLETED but null stripeNetAmount
  const nullNetOrders = await db.songOrder.findMany({
    where: {
      status: { in: [...paidStatuses] },
      stripeNetAmount: null,
      paymentCompletedAt: { gte: thisMonthStart },
    },
    select: {
      id: true,
      email: true,
      status: true,
      paymentMethod: true,
      priceAtOrder: true,
      currency: true,
      createdAt: true,
      paymentCompletedAt: true,
      orderType: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\n=== ORDERS WITH NULL stripeNetAmount (paid this month) ===`);
  console.log(`  Count: ${nullNetOrders.length}`);
  if (nullNetOrders.length > 0) {
    for (const o of nullNetOrders) {
      console.log(`  - ${o.id} | ${o.email} | ${o.status} | ${o.paymentMethod} | ${o.priceAtOrder} ${o.currency} | type=${o.orderType} | created=${o.createdAt.toISOString()} | paid=${o.paymentCompletedAt?.toISOString()}`);
    }
  }

  // 5. Orders created BEFORE this month but PAID this month (would be in Stripe but NOT in dashboard)
  const createdBeforePaidAfter = await db.songOrder.findMany({
    where: {
      status: { in: [...paidStatuses] },
      stripeNetAmount: { not: null },
      createdAt: { lt: thisMonthStart },
      paymentCompletedAt: { gte: thisMonthStart },
    },
    select: {
      id: true,
      email: true,
      stripeNetAmount: true,
      createdAt: true,
      paymentCompletedAt: true,
      orderType: true,
    },
    orderBy: { paymentCompletedAt: "asc" },
  });

  console.log(`\n=== CREATED BEFORE MONTH BUT PAID THIS MONTH (missing from dashboard) ===`);
  console.log(`  Count: ${createdBeforePaidAfter.length}`);
  let missingTotal = 0;
  for (const o of createdBeforePaidAfter) {
    const net = (o.stripeNetAmount || 0) / 100;
    missingTotal += net;
    console.log(`  - ${o.id} | ${o.email} | $${net.toFixed(2)} | type=${o.orderType} | created=${o.createdAt.toISOString()} | paid=${o.paymentCompletedAt?.toISOString()}`);
  }
  console.log(`  Total missing: $${missingTotal.toFixed(2)}`);

  // 6. Orders created THIS month but PAID before (would be in dashboard but NOT in Stripe)
  const createdAfterPaidBefore = await db.songOrder.findMany({
    where: {
      status: { in: [...paidStatuses] },
      stripeNetAmount: { not: null },
      createdAt: { gte: thisMonthStart },
      paymentCompletedAt: { lt: thisMonthStart },
    },
    select: {
      id: true,
      email: true,
      stripeNetAmount: true,
      createdAt: true,
      paymentCompletedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n=== CREATED THIS MONTH BUT PAID BEFORE (in dashboard but not Stripe) ===`);
  console.log(`  Count: ${createdAfterPaidBefore.length}`);
  let extraTotal = 0;
  for (const o of createdAfterPaidBefore) {
    const net = (o.stripeNetAmount || 0) / 100;
    extraTotal += net;
    console.log(`  - ${o.id} | ${o.email} | $${net.toFixed(2)} | created=${o.createdAt.toISOString()} | paid=${o.paymentCompletedAt?.toISOString()}`);
  }
  console.log(`  Total extra: $${extraTotal.toFixed(2)}`);

  // 7. Refunded orders this month (Stripe deducts, dashboard excludes completely)
  const refundedThisMonth = await db.songOrder.findMany({
    where: {
      status: "REFUNDED",
      stripeNetAmount: { not: null },
      paymentCompletedAt: { gte: thisMonthStart },
    },
    select: {
      id: true,
      email: true,
      stripeNetAmount: true,
      paymentCompletedAt: true,
    },
  });

  console.log(`\n=== REFUNDED ORDERS (paid this month) ===`);
  console.log(`  Count: ${refundedThisMonth.length}`);
  let refundTotal = 0;
  for (const o of refundedThisMonth) {
    const net = (o.stripeNetAmount || 0) / 100;
    refundTotal += net;
    console.log(`  - ${o.id} | ${o.email} | $${net.toFixed(2)} | paid=${o.paymentCompletedAt?.toISOString()}`);
  }
  console.log(`  Total refunded: $${refundTotal.toFixed(2)}`);

  await db.$disconnect();
}

main();
