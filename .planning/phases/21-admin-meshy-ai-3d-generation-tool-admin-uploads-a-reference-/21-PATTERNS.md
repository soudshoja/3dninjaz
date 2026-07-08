# Phase 21 Pattern Map — Admin Meshy AI 3D Generation Tool

**Generated:** 2026-07-07
**Inputs:** 21-CONTEXT.md, 21-UI-SPEC.md, `.claude/skills/meshy-3d-pipeline/`
**Method:** direct codebase audit — every analog below was read in full, excerpts are verbatim.

Every new Phase 21 file is mapped to the closest existing analog in this repo, with the exact code to copy-adapt. Cross-cutting MariaDB/Better-Auth/deploy gotchas that apply to multiple files are collected at the end.

---

## File-by-file map

| New file | Role | Closest analog | Confidence |
|---|---|---|---|
| `src/lib/db/schema.ts` (add `meshyGenerations`, `meshyRevisions`) | Drizzle table defs | `paymentProofs` (schema.ts:689-719) | HIGH — newest table, same parent/child + enum + FK shape |
| `scripts/phase21-migrate.cjs` | raw-SQL DDL applicator | `scripts/phase20-migrate.cjs` | HIGH — copy byte-for-byte structure |
| `src/lib/meshy/client.ts` | typed API wrapper | `.claude/skills/meshy-3d-pipeline/scripts/meshy-client.ts` | HIGH — starting point per 21-CONTEXT |
| `src/lib/meshy/pipeline.ts` | `advanceGeneration(id)` state machine | no single analog; composed from client.ts polling + storage write + status-enum update conventions | MEDIUM |
| `src/lib/meshy/storage.ts` | private (non-public) file storage | `src/lib/payment-proof-storage.ts` (guards) + `src/lib/storage.ts` (env-dir convention) | HIGH — but must divert OUTSIDE `public/` (see §6) |
| `src/actions/admin-meshy.ts` | requireAdmin-first Server Actions | `src/actions/admin-payment-proofs.ts` (FormData upload) + `src/actions/admin-disputes.ts` (external-API sync) | HIGH |
| `src/app/api/admin/meshy/[id]/download/route.ts` | authed binary download | `src/app/api/admin/orders/[id]/label/route.ts` | HIGH — canonical ref confirmed to exist |
| `scripts/meshy-sweep.ts` | 5-min reconciliation cron | `scripts/log-alert.cjs` (cron shape) + `scripts/seed-admin.ts` (tsx imports src libs) + `scripts/_mock-server-only.cjs` | MEDIUM — see §4 for the tsx-vs-cjs decision the planner must make |
| list/detail hydration | parent+child reads, no LATERAL | `getProducts`/`getProduct` in `src/actions/products.ts:746-848`; "latest child per parent" in `src/app/(admin)/admin/orders/page.tsx:61-86` | HIGH |
| `src/components/admin/admin-meshy-status-badge.tsx` | status pill | `src/components/admin/admin-order-status-badge.tsx` (43 lines, mirror whole file) | HIGH |
| `src/components/admin/admin-meshy-upload-form.tsx` | upload form | `src/components/admin/dispute-evidence-uploader.tsx` | HIGH |
| `src/components/admin/admin-meshy-detail.tsx` (live poll) | client polling | `src/components/admin/whatsapp-connect-panel.tsx:33-101` | HIGH — only setInterval-polling component in repo |
| `src/app/(admin)/admin/meshy/**/page.tsx` | admin pages | `src/app/(admin)/admin/orders/page.tsx` | HIGH |
| sidebar entry | nav | `src/components/admin/sidebar-nav.tsx` GROUPS array | HIGH — note icon-system conflict, §9 |
| `<model-viewer>` 3D preview | — | **no analog exists** — `model-viewer` appears nowhere in `src/`. Genuinely new. Needs the web-component script loaded client-side + a TS JSX declaration for the custom element. | — |

---

## 1. Raw-SQL migration script (adapt `scripts/phase20-migrate.cjs` byte-for-byte)

This repo NEVER runs `drizzle-kit push` against the remote (hangs on schema-pull — CLAUDE.md MariaDB gotchas). Every phase ships a `scripts/phaseNN-*.cjs` applicator: plain `mysql2/promise`, self-contained `.env.local` loader, INFORMATION_SCHEMA idempotency guards, `SHOW CREATE TABLE` verification, applied/skipped summary. `scripts/phase20-migrate.cjs` is the newest and cleanest instance; key excerpts:

**Header comment convention + env loader (phase20-migrate.cjs:1-56):**

```js
/* eslint-disable no-console */
/**
 * Phase 20 (20-02) — ... raw-SQL DDL applicator.
 *
 * Idempotent: re-running on a migrated DB produces zero changes (every
 * mutation is gated by an INFORMATION_SCHEMA existence check or catch on
 * ER_DUP_FIELDNAME / ER_TABLE_EXISTS_ERROR).
 * ...
 * Run: node scripts/phase20-migrate.cjs
 *   (reads .env.local automatically via loadEnv() — no dotenv-cli required)
 *
 * NB: do NOT run drizzle-kit push against the cPanel remote — it hangs.
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
```

**Idempotency guards (phase20-migrate.cjs:61-77):**

```js
async function tableExists(conn, dbName, tableName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, tableName],
  );
  return rows.length > 0;
}

async function columnExists(conn, dbName, tableName, columnName) { /* same shape on INFORMATION_SCHEMA.COLUMNS */ }
```

**CREATE TABLE mutation with charset note (phase20-migrate.cjs:201-237) — this is the exact template for `meshy_generations`/`meshy_revisions`:**

```js
    // Mutation 5 — CREATE TABLE payment_proofs
    // D-22: charset latin1 to match `orders` table for FK constraint.
    // id CHAR(36): app-generated UUIDs (CLAUDE.md MariaDB quirk).
    if (!(await tableExists(conn, dbName, "payment_proofs"))) {
      await conn.query(`
        CREATE TABLE \`payment_proofs\` (
          \`id\`                   CHAR(36)      NOT NULL,
          \`order_id\`             CHAR(36)      NOT NULL,
          ...
          \`status\`               ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          \`created_at\`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          CONSTRAINT \`fk_pp_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE CASCADE,
          KEY \`idx_pp_order_status\` (\`order_id\`, \`status\`),
          KEY \`idx_pp_status_created\` (\`status\`, \`created_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=latin1
      `);
      applied.push("payment_proofs table created");
    } else { skipped.push("payment_proofs"); }
```

**Verification + summary + exit convention (phase20-migrate.cjs:239-269):**

```js
    console.log("\n[phase20-migrate] --- SHOW CREATE TABLE payment_proofs ---");
    const [ppCreate] = await conn.query("SHOW CREATE TABLE `payment_proofs`");
    console.log(ppCreate[0]["Create Table"]);

    console.log("\n[phase20-migrate] ========== SUMMARY ==========");
    console.log(`  Applied  (${applied.length}): ${applied.join(", ") || "none"}`);
    console.log(`  Skipped  (${skipped.length}): ${skipped.join(", ") || "none"}`);
  } finally {
    await conn.end();
  }
}
run().catch((err) => {
  console.error("[phase20-migrate] FATAL:", err.message || err);
  process.exit(1);
});
```

**Phase-21 adaptation notes:**
- `meshy_revisions.generation_id` FK → `meshy_generations.id` ON DELETE CASCADE, same `fk_*`/`idx_*` naming style.
- **Charset must match the FK parent.** `payment_proofs` was forced to `latin1` because `orders` is latin1. If `meshy_generations` carries `created_by` FK → `user(id)` (or `product_id` FK → `products(id)`), run `SHOW CREATE TABLE user` / `products` FIRST and match that charset — do not blindly copy `latin1`. If no FK constraint is declared (plain indexed column), charset pressure disappears; several tables in this repo skip the constraint and enforce at app layer.
- JSON columns (`printability_report`, `local_model_files`) are declared `JSON` in DDL but MariaDB stores as LONGTEXT — declare as `LONGTEXT NULL` or `JSON` (both work); reads MUST use a parse helper (§8).
- Status enum in DDL must be the exact 9-value list from 21-CONTEXT: `('generating','awaiting_review','revising','analyzing','repairing','processing_multicolor','ready','failed','canceled')`.
- DB access for prod run: dev laptop can't reach MariaDB:3306 directly — SSH tunnel (`ssh -L 3307`) + DATABASE_URL override, or run the script on the box (memory: `reference_local_dev_db_tunnel.md`, `reference_prod_db_access.md`).

---

## 2. Drizzle schema additions (mirror `paymentProofs`, schema.ts:689-719)

Newest table in `src/lib/db/schema.ts` and the exact conventions to copy — `char(36)` ids, snake_case column names, `mysqlEnum`, `datetime` with `sql\`CURRENT_TIMESTAMP\``, composite indexes in the third arg, separate `relations()` export:

```ts
export const paymentProofs = mysqlTable(
  "payment_proofs",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    orderId: char("order_id", { length: 36 }).notNull(),
    imageUrl: varchar("image_url", { length: 500 }).notNull(),
    thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    uploadedBy: mysqlEnum("uploaded_by", ["customer", "admin"]).notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .notNull()
      .default("pending"),
    adminNote: text("admin_note"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    orderStatusIdx: index("idx_pp_order_status").on(t.orderId, t.status),
    statusCreatedIdx: index("idx_pp_status_created").on(t.status, t.createdAt),
  }),
);

export const paymentProofsRelations = relations(paymentProofs, ({ one }) => ({
  order: one(orders, { fields: [paymentProofs.orderId], references: [orders.id] }),
}));
```

JSON column convention (schema.ts:152): `images: json("images").$type<string[]>()...` — for Phase 21: `printabilityReport: json("printability_report").$type<PrintabilityReport | null>()`, `localModelFiles: json("local_model_files").$type<{ glb?: string; stl?: string; threeMf?: string; thumbnail?: string }>()`. Remember `$type<>` is compile-time only — runtime values arrive as strings (§8).

Also copy the block-comment header convention above the table (`// ==== Phase 21: ... ====` with the raw-DDL shape recap) — every recent table has one, and it documents the DDL/Drizzle byte-alignment contract.

---

## 3. requireAdmin()-first Server Actions (`src/actions/admin-meshy.ts`)

Analog A — **FormData file-upload action** (`src/actions/admin-payment-proofs.ts`): every export awaits `requireAdmin()` first (file header says exactly that, citing CVE-2025-29927); the upload action shape at :254-292 is:

```ts
  const session = await requireAdmin();
  // ... load + validate the parent row ...
  // Write file (caps + MIME allowlist enforced inside writePaymentProof, D-10)
  const stored = await writePaymentProof(orderId, file);
  // ... db.insert with id: randomUUID() ...
  revalidatePath(`/admin/orders/${orderId}`);
```

Analog B — **external-API sync action returning a result object, never throwing to the client** (`src/actions/admin-disputes.ts:57-108`):

```ts
"use server";

import { db } from "@/lib/db";
import { disputeCache, orders } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

export type SyncDisputesResult = { synced: number; errors: number };

export async function syncDisputes(): Promise<SyncDisputesResult> {
  await requireAdmin();                 // <- FIRST await, every export
  let synced = 0; let errors = 0;
  try {
    // ... call external API, upsert rows with id: randomUUID() ...
    return { synced, errors };
  } catch (e) {
    console.error("[disputes] syncDisputes failed:", e);
    return { synced, errors: errors + 1 };
  }
}
```

`requireAdmin` itself (`src/lib/auth-helpers.ts:14-21`):

```ts
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userWithRole = session?.user as unknown as { role: string } | undefined;
  if (!session || userWithRole?.role !== "admin") {
    throw new Error("Forbidden");
  }
  return session;
}
```

**Phase-21 adaptation notes:**
- Actions return discriminated unions `{ ok: true, ... } | { ok: false, error: string }` (see `WritePaymentProofResult` in payment-proof-storage.ts and `provideEvidenceAction` usage in dispute-evidence-uploader) — the upload form pattern depends on `r.ok`.
- `pollGeneration(id)` is the client-poll target — it should call `advanceGeneration(id)` in the pipeline lib and return the fresh row snapshot. Keep the action thin; the state machine lives in `src/lib/meshy/pipeline.ts` so the cron sweep can call the same function without importing a `"use server"` module.
- **Memory gotcha** (`project_use_server_no_type_exports.md`): a `"use server"` file must not RE-export types/values from other modules — runtime ReferenceError 500, tsc won't catch it. Inline `export type Foo = {...}` declarations are fine (admin-disputes.ts does it); `export { type X } from "./y"` is not. Define `MeshyGenerationStatus` etc. in `src/lib/meshy/*` and import them, never re-export.
- Rate limiting exists if wanted: `checkRateLimit` from `@/lib/rate-limit` (used by admin-disputes for 10/min/admin on spend-money actions — sensible for `repairGeneration`/`requestRevision`, both of which cost credits).

---

## 4. Authenticated binary-download Route Handler (`src/app/api/admin/meshy/[id]/download/route.ts`)

Analog: `src/app/api/admin/orders/[id]/label/route.ts` — the canonical ref from 21-CONTEXT, confirmed present. Skeleton to copy (label route :1-17, 86-97, 159-167):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderShipments } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },   // <- Next 15: params is a Promise
) {
  await requireAdmin();                        // <- first await
  const { id } = await ctx.params;

  const s = await db.select().from(orderShipments)
    .where(eq(orderShipments.orderId, id)).limit(1);
  // ... resolve the file ...

  const buf = await upstream.arrayBuffer();
  return new NextResponse(Buffer.from(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
```

**Phase-21 adaptation notes:**
- The label route proxies an upstream fetch; the meshy route reads from **local private storage** instead: `fs.readFile(absPath)` → `new NextResponse(buf, ...)`. Re-apply the path-traversal guard from storage helpers (§6) before reading — the `[id]` is a DB id, resolve the path from the DB row's `localModelFiles`, never from a query param.
- Use `Content-Disposition: attachment; filename="..."` (UI-SPEC: "real browser download not a new tab") — label route uses `inline`, that's the one deliberate divergence.
- Content types: STL `model/stl` (or `application/octet-stream` — safest), 3MF `model/3mf` (`application/vnd.ms-package.3dmanufacturing-3dmodel+3mf` is the registered one), GLB `model/gltf-binary`. A `?file=stl|3mf|glb` query param validated against an allowlist picks which entry of `localModelFiles` to stream.
- The label route's branded HTML error page (returned with **HTTP 200** so LiteSpeed/Apache `ErrorDocument` rules don't swallow the body — see its comment :24-31) is worth copying for "file not ready yet / generation not found" cases, since the admin lands here from a plain `<a>` click.

---

## 5. Cron / reconciliation sweep (`scripts/meshy-sweep.ts`)

The repo's only production cron script is `scripts/log-alert.cjs`. Conventions to copy:

**Cron-entry-in-header convention (log-alert.cjs:1-12):**

```js
#!/usr/bin/env node
// log-alert.cjs — Next.js error log monitor for 3D Ninjaz
//
// Runs every minute via cron. ...
//
// Cron entry (ninjaz user):
//   * * * * * /home/ninjaz/nodevenv/apps/3dninjaz_v1/20/bin/node \
//     /home/ninjaz/scripts/log-alert.cjs >> /home/ninjaz/scripts/log-alert.out 2>&1
```

Plus: state persisted to a JSON file to survive restarts (`loadState`/`saveState`, :73-84), bounded work per run (`MAX_ALERTS_PER_RUN = 3`), every log line prefixed `[log-alert]`, exits 0 on "nothing to do". The `@reboot` app-start cron and the 2-min crash-watchdog cron follow the same "ninjaz user crontab + nodevenv node binary + >> logfile 2>&1" registration pattern (`.planning/phases/04-brand-launch/DEPLOY-NOTES.md:63-88`; watchdog per memory `project_watchdog_telegram.md` lives server-side only, not in the repo).

**The planner must decide how a TypeScript sweep runs under cron.** Facts:
- Existing crons are plain-Node `.cjs` (no TS, no `@/` imports) run with the nodevenv node binary.
- TS scripts in this repo DO import app libs via relative paths — `scripts/seed-admin.ts:26-28`:
  ```ts
  import { auth } from "../src/lib/auth";
  import { db } from "../src/lib/db";
  import { account, user } from "../src/lib/db/schema";
  ```
  run via `tsx --env-file=.env.local scripts/seed-admin.ts` (package.json `seed:admin`; `tsx ^4.21.0` is a devDependency, present on the server because prod deploy runs full `npm ci` without `--omit=dev` — deploy.yml:259-262).
- `import "server-only"` in `src/lib/*` breaks outside Next; the repo's existing escape hatch is `scripts/_mock-server-only.cjs` (2 lines, stubs the module) loaded via `NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs"` (usage documented in `scripts/repair-pancake-clicker.ts:34`).

So the two repo-consistent options for `meshy-sweep.ts` calling `advanceGeneration()` from `src/lib/meshy/pipeline.ts`:
1. **Cron runs tsx** (recommended — reuses the one shared state machine, the whole point of the design):
   `*/5 * * * * cd /home/ninjaz/apps/<appdir> && NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs" ./node_modules/.bin/tsx --env-file=.env.local scripts/meshy-sweep.ts >> /home/ninjaz/scripts/meshy-sweep.out 2>&1`
   Keep `src/lib/meshy/pipeline.ts` free of `next/*` imports (no `revalidatePath` inside the lib — do revalidation in the Server Action layer) so it loads cleanly under tsx.
2. Cron `curl`s an authenticated internal route that calls the same function — adds an endpoint + a shared-secret header; no precedent in this repo. Only pick this if option 1's NODE_OPTIONS wrangling fails on the box.

Sweep-specific behavior to spec: select generations stuck in a non-terminal status (`generating/revising/analyzing/repairing/processing_multicolor`) with `updatedAt` older than ~2 min, call `advanceGeneration(id)` on each, bounded batch (log-alert's MAX-per-run pattern), one-line summary log. Registration itself is a manual SSH crontab edit (memory: SSH for inspection is fine, never for deploys).

---

## 6. Private storage helper (`src/lib/meshy/storage.ts`)

Two existing storage helpers, both writing under **`public/uploads`** (publicly served — exactly what Phase 21 must NOT do for model files). Copy their guards, change the root.

**Env-driven root + traversal guard + UUID naming (`src/lib/storage.ts:7-11, 57-74`):**

```ts
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";
const MAX_BYTES = 50 * 1024 * 1024;
// ...
  const safe = safeBucket(bucket);                      // strip to [a-zA-Z0-9-]
  const id = crypto.randomUUID();
  const baseDir = path.join(process.cwd(), UPLOADS_DIR, "products", safe, id);
  // Double-check path stays inside UPLOADS_DIR.
  const root = path.resolve(path.join(process.cwd(), UPLOADS_DIR));
  if (!path.resolve(baseDir).startsWith(root)) {
    throw new Error("Invalid upload path");
  }
```

**Discriminated-union result + MIME allowlist + non-fatal thumbnail (`src/lib/payment-proof-storage.ts`):** starts with `import "server-only"`; `ALLOWED_MIMES` Set; `mimeToExt()` switch; returns `{ ok: true, imageUrl, thumbnailUrl, sizeBytes, mimeType } | { ok: false, error }`; sharp thumbnail wrapped in try/catch with `console.warn` ("Non-fatal per PATTERNS.md — proceed without thumbnail", :141-145); EXIF stripped via `.rotate().withMetadata({ exif: {} })`.

**Phase-21 adaptation notes:**
- Root: `const MESHY_STORAGE_DIR = process.env.MESHY_STORAGE_DIR ?? "./storage/meshy"` — a sibling of `public/`, never inside it. Model files are served ONLY through the authed download route (§4). The **reference photo** admin uploads must be reachable by Meshy's API as a URL, though — either pass it as a data URI (`image_url` accepts data URIs per Meshy docs) or store that one input photo under the public uploads root; the planner should pick (data URI avoids exposing anything publicly and dodges the dev-machine-not-publicly-reachable problem entirely).
- Path layout: `<MESHY_STORAGE_DIR>/<generationId>/model.glb|model.stl|model.3mf|thumb.webp` + revision subfolders if desired; `generationId` sanitized with the `safeBucket`-style regex + `startsWith(root)` re-check, both guards verbatim.
- **Deploy persistence:** on prod, `public/uploads` survives deploys only because it's symlinked to `/home/ninjaz/persistent_uploads/` (DEPLOY-NOTES risk table :299). A new top-level `storage/` dir gets the same treatment: set `MESHY_STORAGE_DIR=/home/ninjaz/persistent_meshy` (absolute) in the prod env, mkdir it once over SSH. Flag this as an explicit deploy-checklist item in the plan.
- Download-from-Meshy helper lives here too: `fetch(url)` → `Buffer.from(await res.arrayBuffer())` → `fs.writeFile` (same Buffer dance as the label route). This is invoked by the pipeline the moment a task hits SUCCEEDED — before any status advance (3-day expiry rule).

---

## 7. Manual multi-query hydration (list + detail reads)

**Parent + children batched with `inArray`, joined via Map (`src/actions/products.ts:742-848`)** — the canonical example, with the canonical comment:

```ts
// MariaDB 10.11 does not support LATERAL joins, which Drizzle's relational
// `with: { variants, category }` query builder emits. Manually hydrate the
// relations via extra SELECTs instead — small N, so no N+1 concern.

export async function getProducts() {
  const list = await db.select().from(products).orderBy(desc(products.createdAt));
  if (list.length === 0) return [];

  const ids = list.map((p) => p.id);
  const variantRows = await db.select().from(productVariants)
    .where(inArray(productVariants.productId, ids));

  const variantByProduct = new Map<string, typeof variantRows>();
  for (const v of variantRows) {
    const bucket = variantByProduct.get(v.productId) ?? [];
    bucket.push(v);
    variantByProduct.set(v.productId, bucket);
  }

  return list.map((p) => ({
    ...p,
    images: ensureImagesArray(p.images),   // <- JSON parse helper on EVERY json read
    variants: variantByProduct.get(p.id) ?? [],
  }));
}
```

**"Latest child per parent" variant (`src/app/(admin)/admin/orders/page.tsx:61-86`)** — exactly the shape needed for "latest revision per generation" on the list page: one `inArray` select `ORDER BY createdAt DESC`, then first-writer-wins into a Map:

```ts
    const proofRows = await db.select({...}).from(paymentProofs)
      .where(inArray(paymentProofs.orderId, orderIds))
      .orderBy(desc(paymentProofs.createdAt));
    for (const p of proofRows) {
      if (!slipThumbnailByOrder.has(p.orderId)) {
        slipThumbnailByOrder.set(p.orderId, p.thumbnailUrl ?? p.imageUrl ?? null);
      }
    }
```

For `meshy_generations` + `meshy_revisions`: detail = `getProduct` shape (one parent select, one `eq(generationId)` child select ordered by createdAt); revisionNumber = `COUNT(*)` of existing revision rows at insert time (21-CONTEXT decision — real count, not a stored counter), which under this convention is `const [{ n }] = await db.select({ n: count() }).from(meshyRevisions).where(eq(meshyRevisions.generationId, id))`.

---

## 8. Cross-cutting MariaDB / runtime gotchas (apply to pipeline, actions, sweep)

1. **JSON columns come back as LONGTEXT strings.** Every read of `printabilityReport` / `localModelFiles` needs a parse helper. Canonical shape (`src/actions/wishlist.ts:29-46`, comment included):
   ```ts
   function ensureImagesArray(raw: unknown): string[] {
     // MariaDB stores JSON as LONGTEXT; mysql2 returns raw strings.
     if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
     if (typeof raw === "string") {
       if (raw.trim() === "") return [];
       try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed.filter(...); }
       catch { return []; }
     }
     return [];
   }
   ```
   Write ONE `parseLocalModelFiles()` / `parsePrintabilityReport()` in `src/lib/meshy/` (not per-call-site copies — the repo has 5+ duplicated `ensureImagesArray`s and that's its known wart; don't add more).
2. **App-generated UUIDs:** `id: randomUUID()` on every insert (`admin-disputes.ts:96-99`). Never `$returningId()` or SQL `UUID()`.
3. **Writes on JSON columns**: `admin-disputes.ts:88` stores `rawJson: JSON.stringify(rawJson)` explicitly — do the same for report/files payloads.
4. **`"use server"` files: no type/value re-exports** (memory: runtime ReferenceError 500, tsc-invisible).
5. **Better Auth role typing:** cast `(session.user as { role: string }).role` at access sites (already inside `requireAdmin`).
6. **Meshy client env:** `MESHY_API_KEY` read server-side only (skill client:43-47 already throws if unset). Dev `.env.local` gets the test key `msy_dummy_api_key_for_test_mode_12345678`; prod env gets the real key — mirrors the `PAYPAL_ENV` sandbox/live split. Test-mode returns fake URLs — the storage download step must tolerate fetch failure on dev without wedging the state machine (accepted limitation per 21-CONTEXT).

---

## 9. UI analogs (concrete)

### 9a. Status badge — mirror `src/components/admin/admin-order-status-badge.tsx` whole-file

```tsx
import { BRAND } from "@/lib/brand";

const STATUS_THEME: Record<OrderStatus, { bg: string; fg: string; label: string }> = {
  pending:                 { bg: `${BRAND.purple}22`, fg: BRAND.purple, label: "Pending" },
  awaiting_customer:       { bg: "#fef3c7",           fg: "#92400e",    label: "Awaiting customer" },
  shipped:                 { bg: `${BRAND.green}22`,  fg: BRAND.green,  label: "Shipped" },
  cancelled:               { bg: `${BRAND.ink}18`,    fg: BRAND.ink,    label: "Cancelled" },
  // ...
};

export function AdminOrderStatusBadge({ status }: { status: OrderStatus }) {
  const theme = STATUS_THEME[status] ?? STATUS_THEME.pending;
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: theme.bg, color: theme.fg }}
      aria-label={`Order status: ${theme.label}`}
    >
      {theme.label}
    </span>
  );
}
```

The 9-status → color mapping for meshy is already fully specified in 21-UI-SPEC (table with exact bg/fg values). Amber `#fef3c7`/`#92400e` and red `#fee2e2`/`#991b1b` literals match this file's precedent. Note the actual `BRAND` values (`src/lib/brand.ts`): blue `#1877F2`, green `#25D366`, purple `#7360F2`, ink `#0B1020`, cream `#F7FAF4` — UI-SPEC's prose lists the older palette hexes; **import `BRAND`, never hardcode**, and the discrepancy vanishes.

### 9b. Upload form — mirror `src/components/admin/dispute-evidence-uploader.tsx`

Structure (verbatim skeleton, :36-92): `"use client"` + `useState` per field + `useTransition` + `useRef<HTMLInputElement>` + client-side size guard in `onPick` mirroring the server cap + FormData submit:

```tsx
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("evidence_type", evidenceType);
    files.forEach((f, i) => fd.append(`file${i + 1}`, f, f.name));
    startTransition(async () => {
      const r = await provideEvidenceAction(disputeId, fd);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  }
```

Inline error banner (not toast), :96-103:

```tsx
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}
```

Char-cap textarea precedent: same file uses `maxLength={2000}` with the count in the label (:127-138). For the 600-char prompt add a live `{prompt.length}/600` counter span — trivial extension, no dedicated counter component exists to reuse. Meshy form differences: single file, `accept="image/jpeg,image/png"`, `URL.createObjectURL` preview, on success `router.push(\`/admin/meshy/${r.id}\`)` instead of `router.refresh()`.

### 9c. Page wrapper + empty state — `src/app/(admin)/admin/orders/page.tsx`

Header block (:1-18, 48-56, 88-97):

```tsx
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Orders",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();   // belt-and-braces even though (admin)/layout.tsx also gates
  // ...
  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Orders</h1>
          <p className="mt-1 text-slate-600">...</p>
        </header>
```

Empty state (:103-112):

```tsx
        {rows.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#ffffff" }}>
            <p className="text-lg font-bold mb-2">No orders match this filter.</p>
            <p className="text-sm text-slate-600">Try another status or clear the filter.</p>
          </div>
        ) : ( ... )}
```

shadcn `<Table>` primitives already exist at `src/components/ui/table.tsx` (unused so far — Phase 21's list is the first consumer, as UI-SPEC intends).

### 9d. Detail-page live polling — `src/components/admin/whatsapp-connect-panel.tsx:33-101` (only setInterval-poll component in the repo)

```tsx
const POLL_INTERVAL_MS = 3_000;
// ...
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
  }
  useEffect(() => () => stopPolling(), []);   // cleanup on unmount

  function startPolling() {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      const res = await pollWhatsappState();   // <- server action as the poll target
      if (!res.ok) return;
      setState(res.state);
      if (res.state === "open") { stopPolling(); setStatusMsg("WhatsApp connected."); }
    }, POLL_INTERVAL_MS);
  }
```

Meshy adaptation: 5-8s interval per 21-CONTEXT, poll target = `pollGeneration(id)` action, stop when status reaches a terminal/stable state (`awaiting_review`, `ready`, `failed`, `canceled`), restart when the admin triggers a new async stage (revision/repair/multicolor).

### 9e. Sidebar entry — `src/components/admin/sidebar-nav.tsx`

Add to the `GROUPS` array (item shape :15-21, group entries :25-105):

```ts
type NavItem = { href: string; label: string; ninjaIcon: string; exact?: boolean; badge?: ... };
// e.g. under "catalog":
{ href: "/admin/meshy", label: "3D Generation", ninjaIcon: "services" },
```

**Conflict with UI-SPEC:** the sidebar does NOT use Lucide — it renders PNG "ninja icons" via `ninjaIconPath()` from `/public/icons/ninja/{nav,emoji}/<name>@128.png` (:112-116; `nav` set unless the name is in the emoji set `tip/warning/great/secure/contact`). So the UI-SPEC's "Lucide `Box`/`Cuboid`" note applies to in-page icons only; the sidebar entry must pick an existing ninjaIcon name (`services` or `portfolio` are the closest fits) or ship a new PNG. Active-state matching is prefix-based (`pathname.startsWith(item.href + "/")`) so one `/admin/meshy` entry covers `/new` and `/[id]`.

### 9f. `<model-viewer>` — no precedent

`model-viewer` appears nowhere in `src/`. New ground: load `@google/model-viewer` in a `"use client"` component (dynamic `import("@google/model-viewer")` in a useEffect, or a `<script type="module">` tag — NOTE the CLAUDE.md quirk that standalone builds don't bundle loose assets; an npm dependency + client import is the deploy-safe route), plus a `declare global { namespace JSX { interface IntrinsicElements { "model-viewer": ... } } }` stub in `src/types/`. Always render the source-photo placeholder while no local glb exists (UI-SPEC's "never a blank box" rule from the keychain-preview incident). The glb src is the authed download route URL (`/api/admin/meshy/[id]/download?file=glb`) — browser sends session cookies, so the authed route works as an `<img>`/viewer src for a logged-in admin.

---

## 10. `src/lib/meshy/client.ts` — adaptation delta from the skill script

`.claude/skills/meshy-3d-pipeline/scripts/meshy-client.ts` (262 lines) is already typed and complete: `meshyFetch<T>` wrapper with Bearer auth, `MeshyTaskError` (with `isRetryable` getter for timeout/service_unavailable), `MeshyHttpError`, create/get pairs for image-to-3d / retexture / print-analyze / print-repair / multi-color, `getBalance()`, `assertTexturePromptLength()` (600-char guard), `pollTaskUntilDone()`. Changes for `src/lib/meshy/client.ts`:

1. Add `import "server-only";` at top (repo convention for env-reading libs — storage.ts:1, auth-helpers.ts:1). ⚠ This is why the sweep needs the `_mock-server-only.cjs` require-hook (§5) — keep it anyway; the mock is the established pattern.
2. Keep the per-endpoint GET functions distinct (the skill comments warn repair/multicolor/analyze each poll their OWN endpoint — do not funnel through `getImageTo3DTask`).
3. `pollTaskUntilDone` (blocking loop) is for scripts only — the app's Server Actions must do single-shot `get*Task` calls per poll tick, never hold a request open for minutes. Consider not exporting it from the app client to make misuse impossible.
4. `createImageTo3DTask` already defaults `moderation: true` (:121) — keep; 21-CONTEXT requires it.

---

## 11. Suggested new-file inventory for the planner (roles recap)

| File | Copies its skeleton from |
|---|---|
| `scripts/phase21-migrate.cjs` | phase20-migrate.cjs (§1) |
| schema.ts: `meshyGenerations`, `meshyRevisions`, relations | paymentProofs block (§2) |
| `src/lib/meshy/client.ts` | skill meshy-client.ts (§10) |
| `src/lib/meshy/storage.ts` | payment-proof-storage.ts + storage.ts guards, private root (§6) |
| `src/lib/meshy/pipeline.ts` | new: status-enum switch calling client + storage; keep `next/*`-free (§5) |
| `src/actions/admin-meshy.ts` | admin-payment-proofs.ts / admin-disputes.ts (§3) |
| `src/app/api/admin/meshy/[id]/download/route.ts` | label route (§4) |
| `scripts/meshy-sweep.ts` | log-alert.cjs shape + seed-admin.ts imports + _mock-server-only (§5) |
| `src/app/(admin)/admin/meshy/page.tsx` | orders page (§9c) + getProducts-style hydration (§7) |
| `src/app/(admin)/admin/meshy/new/page.tsx` | narrow wrapper (max-w-2xl) + upload form component |
| `src/app/(admin)/admin/meshy/[id]/page.tsx` | orders-page wrapper + getProduct-style hydration (§7) |
| `src/components/admin/admin-meshy-status-badge.tsx` | admin-order-status-badge.tsx (§9a) |
| `src/components/admin/admin-meshy-upload-form.tsx` | dispute-evidence-uploader.tsx (§9b) |
| `src/components/admin/admin-meshy-detail.tsx` | whatsapp-connect-panel polling (§9d) + new model-viewer (§9f) |
| `src/components/admin/admin-meshy-printability-card.tsx` | new pattern, pill visuals from §9a |
| `src/components/admin/admin-meshy-revision-history.tsx` | plain list; accordion per UI-SPEC |
| `src/components/admin/sidebar-nav.tsx` (edit) | GROUPS array entry (§9e) |
