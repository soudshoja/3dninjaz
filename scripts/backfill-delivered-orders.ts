/**
 * One-time script: check all "shipped" orders against Delyva and mark
 * delivered ones as delivered in the DB.
 *
 * Run on the server (where DB + env vars are available):
 *   npx tsx scripts/backfill-delivered-orders.ts
 *
 * Dry-run (no writes):
 *   DRY_RUN=1 npx tsx scripts/backfill-delivered-orders.ts
 */

import "dotenv/config";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../src/lib/db";
import { orders, orderShipments } from "../src/lib/db/schema";

const DRY_RUN = process.env.DRY_RUN === "1";
const DELYVA_BASE = process.env.DELYVA_BASE_URL ?? "https://api.delyva.app/v1.0";
const DELYVA_KEY = process.env.DELYVA_API_KEY ?? "";

if (!DELYVA_KEY) {
  console.error("DELYVA_API_KEY not set");
  process.exit(1);
}

async function delyvaGetOrder(id: string): Promise<{ statusCode?: number; status?: string } | null> {
  try {
    const res = await fetch(`${DELYVA_BASE}/order/${id}`, {
      headers: { "X-Delyvax-Access-Token": DELYVA_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: { statusCode?: number; status?: string } };
    return json?.data ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(DRY_RUN ? "[DRY RUN] No writes." : "[LIVE] Will write to DB.");

  // All shipped orders that have a Delyva booking
  const shipped = await db
    .select({
      orderId: orders.id,
      delyvaOrderId: orderShipments.delyvaOrderId,
      trackingNo: orderShipments.trackingNo,
    })
    .from(orders)
    .innerJoin(orderShipments, eq(orderShipments.orderId, orders.id))
    .where(
      and(
        eq(orders.status, "shipped"),
        isNotNull(orderShipments.delyvaOrderId),
      ),
    );

  console.log(`Found ${shipped.length} shipped orders with a Delyva booking.`);

  const toDeliver: string[] = [];

  for (const row of shipped) {
    process.stdout.write(`  Order ${row.orderId} (Delyva ${row.delyvaOrderId}) ... `);
    const data = await delyvaGetOrder(row.delyvaOrderId!);

    if (!data) {
      console.log("API error / timeout — skip");
      continue;
    }

    const code = data.statusCode ?? 0;
    const statusText = (data.status ?? "").toLowerCase();
    // Delivered: code 400-499, or text match (same logic as webhook handler)
    const isDelivered =
      (code >= 400 && code !== 500) ||
      /delivered|delivery successful|signed|received by recipient/.test(statusText);

    console.log(`statusCode=${code} status="${data.status}" → ${isDelivered ? "DELIVERED ✓" : "not yet"}`);

    if (isDelivered) {
      toDeliver.push(row.orderId);
    }
  }

  console.log(`\n${toDeliver.length} orders to mark as delivered.`);
  if (toDeliver.length === 0 || DRY_RUN) {
    console.log("Done (no writes).");
    return;
  }

  await db
    .update(orders)
    .set({ status: "delivered" })
    .where(inArray(orders.id, toDeliver));

  console.log(`Updated ${toDeliver.length} orders to "delivered".`);
}

main().catch((e) => { console.error(e); process.exit(1); });
