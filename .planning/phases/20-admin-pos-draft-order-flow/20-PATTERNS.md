# Phase 20: Admin POS + Draft Order Flow - Pattern Map

**Mapped:** 2026-05-17  
**Files analyzed:** 13 new/modified  
**Analogs found:** 11 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/actions/admin-pos.ts` | server-action | CRUD | `src/actions/admin-manual-orders.ts` | exact-role |
| `src/actions/admin-payment-proofs.ts` | server-action | CRUD | `src/actions/admin-refunds.ts` | exact-role |
| `src/lib/payment-proof-storage.ts` | utility | file-I/O | `src/lib/storage.ts` | sibling-pattern |
| `src/app/(admin)/admin/pos/page.tsx` | route | request-response | `src/app/(admin)/admin/orders/new/page.tsx` | exact-role |
| `src/components/admin/pos-builder.tsx` | component | request-response | `src/components/admin/manual-order-form.tsx` | exact-role |
| `src/components/admin/payment-proof-lightbox.tsx` | component | request-response | `src/components/admin/dispute-detail-pane.tsx` | data-light-pattern |
| `src/lib/db/schema.ts` (extend) | schema | — | `src/lib/db/schema.ts` (existing) | in-place |
| `src/lib/orders.ts` (extend) | utility | — | `src/lib/orders.ts` (existing) | in-place |
| `src/app/payment-links/[token]/page.tsx` (extend) | route | request-response | `src/app/payment-links/[token]/page.tsx` (existing) | in-place |
| `src/components/admin/admin-order-filter.tsx` (extend) | component | request-response | `src/components/admin/admin-order-filter.tsx` (existing) | in-place |
| `src/app/(admin)/admin/settings/page.tsx` (extend) | route | request-response | `src/app/(admin)/admin/settings/page.tsx` (existing) | in-place |
| `scripts/phase20-migrate.cjs` | migration | batch | `scripts/phase18-migrate.cjs` | exact-role |

---

## Pattern Assignments

### `src/actions/admin-pos.ts` (server-action, CRUD)

**Analog:** `src/actions/admin-manual-orders.ts` (lines 1–50)

**Header + requireAdmin pattern** (lines 1–24):
```typescript
"use server";

import { db } from "@/lib/db";
import { orders, orderItems, paymentLinks } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID, randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

/**
 * Phase 20 (20-XX) — admin POS multi-line order builder actions.
 *
 * Every export awaits `requireAdmin()` first (CVE-2025-29927 mitigation).
 */

export async function createPosOrder(input: PosOrderInput) {
  const session = await requireAdmin();
  // ... rest of function
}
```

**Result type pattern** (lines 31–35):
```typescript
export type CreatePosOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };
```

**Order insert + order_items loop pattern** (reuse structure from `admin-manual-orders.ts` 72–95, but extend with multi-line insertion):
```typescript
const orderId = randomUUID();
try {
  await db.insert(orders).values({
    id: orderId,
    userId: session.user.id,
    status: "pending",
    // ... snapshot fields from input
  });
  // For each POS line:
  for (const line of input.lines) {
    await db.insert(orderItems).values({
      id: randomUUID(),
      orderId,
      productId: line.productId, // or 'manual' sentinel for free-text
      variantId: line.variantId || 'manual',
      productName: line.name,
      // ... snapshot fields
    });
  }
} catch (err) {
  console.error("[admin-pos] insert failed:", err);
  return { ok: false, error: "Could not save order." };
}
revalidatePath("/admin/orders");
return { ok: true, orderId };
```

**Reuse `generatePaymentLink` directly** — no new action needed; existing function handles token generation.

---

### `src/actions/admin-payment-proofs.ts` (server-action, CRUD)

**Analog:** `src/actions/admin-refunds.ts` (lines 42–60)

**Header + requireAdmin pattern**:
```typescript
"use server";

import { db } from "@/lib/db";
import { paymentProofs, orders } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

/**
 * Phase 20 (20-XX) — payment proof review actions.
 *
 * Admin confirms or rejects uploaded slips; state transitions are guarded.
 * Every export awaits `requireAdmin()` first.
 */
```

**Confirm Payment action** (pattern mirrors refund result type from admin-refunds.ts 26–40):
```typescript
export type ConfirmPaymentResult =
  | { ok: true; orderStatus: string }
  | { ok: false; error: string };

export async function confirmPaymentProof(
  proofId: string,
): Promise<ConfirmPaymentResult> {
  const session = await requireAdmin();
  
  const proof = await db.query.paymentProofs.findFirst({
    where: eq(paymentProofs.id, proofId),
  });
  if (!proof) return { ok: false, error: "Proof not found." };
  
  try {
    await db
      .update(paymentProofs)
      .set({
        status: "approved",
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
      })
      .where(eq(paymentProofs.id, proofId));
    
    // Transition order: awaiting_payment_review -> paid
    // Use assertValidTransition helper from src/lib/orders.ts
    revalidatePath(`/admin/orders/${proof.orderId}`);
    return { ok: true, orderStatus: "paid" };
  } catch (err) {
    console.error("[admin-payment-proofs] confirm failed:", err);
    return { ok: false, error: "Could not confirm proof." };
  }
}
```

**Reject action** (mirrors confirm shape; includes admin_note):
```typescript
export async function rejectPaymentProof(
  proofId: string,
  adminNote: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  
  if (!adminNote.trim() || adminNote.length < 8) {
    return { ok: false, error: "Admin note required (8+ chars)." };
  }
  
  try {
    await db
      .update(paymentProofs)
      .set({
        status: "rejected",
        adminNote,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
      })
      .where(eq(paymentProofs.id, proofId));
    
    // Transition order: awaiting_payment_review -> awaiting_customer
    revalidatePath(`/admin/orders/${proof.orderId}`);
    return { ok: true };
  } catch (err) {
    console.error("[admin-payment-proofs] reject failed:", err);
    return { ok: false, error: "Could not reject proof." };
  }
}
```

**Admin upload action** (token not required; requires admin auth):
```typescript
export async function uploadPaymentProofAdmin(
  orderId: string,
  file: File,
): Promise<{ ok: true; proofId: string } | { ok: false; error: string }> {
  const session = await requireAdmin();
  
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  if (!order) return { ok: false, error: "Order not found." };
  
  // Write file via writePaymentProof helper
  const result = await writePaymentProof(orderId, file);
  if (!result.ok) return result;
  
  // Insert payment_proofs row
  const proofId = randomUUID();
  await db.insert(paymentProofs).values({
    id: proofId,
    orderId,
    imageUrl: result.imageUrl,
    thumbnailUrl: result.thumbnailUrl,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    uploadedBy: "admin",
    uploadedByUserId: session.user.id,
    status: "pending",
  });
  
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, proofId };
}
```

---

### `src/lib/payment-proof-storage.ts` (utility, file-I/O)

**Analog:** `src/lib/storage.ts` (lines 46–75)

**Module header + sharp import** (lines 1–20):
```typescript
import "server-only";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Phase 20 (20-XX) — payment proof storage.
 *
 * Stores customer/admin uploaded payment slips with optional thumbnail
 * generation for image files. EXIF stripped (PDPA safeguard).
 * PDFs pass through unchanged.
 *
 * Constraints:
 *   - Max 10 MB per file
 *   - MIME allowlist: image/jpeg, image/png, image/webp, image/heic, 
 *     image/heif, application/pdf
 *   - Path: public/uploads/payment-proofs/<orderId>/<uuid>.<ext>
 */

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
```

**File write function** (reuse safeBucket pattern from `storage.ts` 21–26, adapt to order ID):
```typescript
export type WritePaymentProofResult =
  | {
      ok: true;
      imageUrl: string;
      thumbnailUrl: string | null;
      sizeBytes: number;
      mimeType: string;
    }
  | { ok: false; error: string };

export async function writePaymentProof(
  orderId: string,
  file: File,
): Promise<WritePaymentProofResult> {
  if (!file || !file.type) {
    return { ok: false, error: "Invalid file." };
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return {
      ok: false,
      error: "Unsupported format. Allowed: JPG, PNG, WebP, HEIC, PDF.",
    };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File exceeds 10 MB limit." };
  }

  // Sanitize orderId to prevent path traversal
  const safe = orderId.replace(/[^a-zA-Z0-9-]/g, "");
  const fileUuid = crypto.randomUUID();
  const ext = file.type === "application/pdf" ? "pdf" : getExt(file.type);
  
  const baseDir = path.join(
    process.cwd(),
    UPLOADS_DIR,
    "payment-proofs",
    safe,
  );
  await fs.mkdir(baseDir, { recursive: true });
  
  const filePath = path.join(baseDir, `${fileUuid}.${ext}`);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buf);
  
  // Thumbnail generation for images only
  let thumbnailUrl: string | null = null;
  if (file.type !== "application/pdf" && file.type.startsWith("image/")) {
    const thumbPath = path.join(baseDir, `${fileUuid}.thumb.webp`);
    try {
      await sharp(buf)
        .rotate() // Auto-rotate from EXIF
        .withMetadata({ exif: {} }) // Strip EXIF
        .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 75 })
        .toFile(thumbPath);
      thumbnailUrl = `${PUBLIC_PREFIX}/payment-proofs/${safe}/${fileUuid}.thumb.webp`;
    } catch (err) {
      console.warn("[payment-proof-storage] thumbnail generation failed:", err);
      // Non-fatal; proceed without thumbnail
    }
  }
  
  return {
    ok: true,
    imageUrl: `${PUBLIC_PREFIX}/payment-proofs/${safe}/${fileUuid}.${ext}`,
    thumbnailUrl,
    sizeBytes: buf.length,
    mimeType: file.type,
  };
}
```

---

### `src/lib/orders.ts` (extend, utility)

**Analog:** `src/lib/orders.ts` (lines 12–39)

**OrderStatus type extension** (add two new statuses):
```typescript
export type OrderStatus =
  | "pending"
  | "awaiting_customer"
  | "awaiting_payment_review"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";
```

**ORDER_STATUS_FLOW extension** (add new edges):
```typescript
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ["awaiting_customer", "cancelled"],
  awaiting_customer: ["awaiting_payment_review", "paid", "cancelled"],
  awaiting_payment_review: ["paid", "awaiting_customer", "cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};
```

**isManualLine helper** (add after assertValidTransition):
```typescript
/**
 * Detects free-text manual lines by their sentinel product ID.
 * Real products have UUID-shaped ids; the 'manual' string cannot collide.
 */
export function isManualLine(item: {
  productId: string;
  variantId: string;
}): boolean {
  return item.productId === "manual" && item.variantId === "manual";
}
```

---

### `src/app/(admin)/admin/pos/page.tsx` (route, request-response)

**Analog:** `src/app/(admin)/admin/orders/new/page.tsx` (existing Phase 7 structure)

**Server component header** (pattern from `src/app/(admin)/admin/settings/page.tsx` lines 1–31):
```typescript
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { PosBuilder } from "@/components/admin/pos-builder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Point of Sale",
  robots: { index: false, follow: false },
};

export default async function AdminPosPage() {
  await requireAdmin();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Point of Sale
          </h1>
          <p className="mt-1 text-slate-600">
            Build an offline order for a customer.
          </p>
        </header>
        <PosBuilder />
      </div>
    </main>
  );
}
```

---

### `src/components/admin/pos-builder.tsx` (component, request-response)

**Analog:** `src/components/admin/manual-order-form.tsx` (lines 1–40) + `src/components/admin/variant-editor.tsx` (lines 44–100, row expansion pattern)

**Component structure + useTransition pattern** (lines 1–40 from manual-order-form.tsx):
```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MALAYSIAN_STATES } from "@/lib/validators";
import { createPosOrder } from "@/actions/admin-pos";
import { generatePaymentLink } from "@/actions/admin-manual-orders";

/**
 * Phase 20 (20-XX) — Admin POS builder.
 *
 * Multi-line order form with product picker, line rows (expanded for
 * configurables), customer details, and send-draft modal.
 * Uses admin autosave pattern (localStorage, 1s debounce).
 */

export function PosBuilder() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<PosLine[]>([]);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "Selangor" as (typeof MALAYSIAN_STATES)[number],
    postcode: "",
  });

  // Admin autosave: save lines + customer to localStorage at admin-pos-draft namespace
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(
        "admin-pos-draft",
        JSON.stringify({ lines, customerForm }),
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [lines, customerForm]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createPosOrder({
        lines,
        customerForm,
        // ... other fields
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Show send-draft modal here
    });
  }
```

**Row expansion pattern** (mirrored from variant-editor.tsx 100–150, adapted to POS):
```typescript
  // Each line row can expand to show configurator fields inline
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

  function renderLineRow(line: PosLine) {
    const isExpanded = expandedLineId === line.id;
    return (
      <div
        key={line.id}
        className={cn(
          "border border-slate-200 rounded-[4px] p-4",
          isExpanded && "border-[var(--color-brand-blue)]",
        )}
        style={
          isExpanded ? { borderColor: BRAND.blue, borderWidth: 2 } : undefined
        }
      >
        {/* Collapsed row: product name + quantity + price + actions */}
        <div className="flex items-center gap-3">
          {/* Drag handle, thumbnail, name, variant label, quantity stepper, unitPrice input, line total, trash */}
        </div>

        {/* Expanded section: configurator fields inline (height transition 250ms) */}
        {isExpanded && line.requiresConfig && (
          <div
            className="mt-4 pt-4 border-t border-slate-200 transition-all duration-250"
          >
            <div className="bg-slate-50 rounded-[4px] p-4">
              {/* Mount ConfiguratorForm or ColourPickerDialog here */}
              {/* Pattern B refetch on save per Phase 17 AD-06 */}
            </div>
          </div>
        )}
      </div>
    );
  }
```

---

### `src/components/admin/payment-proof-lightbox.tsx` (component, request-response)

**Analog:** `src/components/admin/dispute-detail-pane.tsx` (data-light lightbox pattern, if exists; fallback to existing modal patterns)

**Lightbox structure** (z-50, backdrop, two-pane on desktop / bottom-sheet on mobile <768px):
```typescript
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { formatMYR } from "@/lib/format";
import { formatRelativeTime } from "@/lib/format";
import { BRAND } from "@/lib/brand";

/**
 * Phase 20 (20-XX) — payment proof lightbox.
 *
 * Full-screen modal showing uploaded slip with metadata sidebar.
 * Two-pane on ≥768px (image 75% left, metadata 25% right).
 * Single-pane + bottom-sheet metadata on <768px.
 * Keyboard nav: ← / → to move between proofs in history.
 */

export function PaymentProofLightbox({
  proofs,
  initialIndex = 0,
  onClose,
}: {
  proofs: Array<{
    id: string;
    imageUrl: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: "customer" | "admin";
    uploadedByUserId?: string;
    createdAt: Date;
    status: "pending" | "approved" | "rejected";
  }>;
  initialIndex?: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(initialIndex);
  const proof = proofs[current];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && current > 0) setCurrent(current - 1);
      if (e.key === "ArrowRight" && current < proofs.length - 1) setCurrent(current + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, proofs.length, onClose]);

  const isPdf = proof.mimeType === "application/pdf";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Close button top-right */}
      <button
        onClick={onClose}
        aria-label="Close lightbox"
        className="absolute top-4 right-4 z-51 w-12 h-12 rounded-[4px] bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"
      >
        <X size={24} />
      </button>

      <div
        className="w-full h-full flex gap-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left pane: image (75% on desktop, 100% on mobile) */}
        <div className="flex-1 flex items-center justify-center">
          {isPdf ? (
            <div
              className="w-48 h-64 rounded-[4px] flex flex-col items-center justify-center"
              style={{ backgroundColor: BRAND.cream }}
            >
              <FileText size={48} color={BRAND.ink} />
              <p className="mt-2 text-sm text-center">{proof.mimeUrl.split("/").pop()}</p>
            </div>
          ) : (
            <Image
              src={proof.imageUrl}
              alt="Payment proof"
              fill
              className="object-contain"
            />
          )}
        </div>

        {/* Right pane: metadata sidebar (25% on desktop, bottom-sheet on mobile) */}
        <div
          className="hidden md:flex md:w-1/4 flex-col p-6 bg-white text-sm gap-4"
          style={{ backgroundColor: BRAND.cream }}
        >
          <div>
            <p className="text-xs text-slate-600 uppercase tracking-wide">File name</p>
            <p className="font-mono text-sm mt-1">{/* proof filename */}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 uppercase">Uploaded</p>
            <p className="mt-1">{formatRelativeTime(proof.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 uppercase">File size</p>
            <p className="mt-1">{(proof.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 uppercase">MIME type</p>
            <p className="mt-1">{proof.mimeType}</p>
          </div>

          {/* Expected amount in BIG BOLD */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-600 uppercase">Expected amount</p>
            <p
              className="text-4xl font-bold mt-2"
              style={{ color: BRAND.green }}
            >
              {formatMYR(/* order.totalAmount */)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Order total — confirm slip matches</p>
          </div>
        </div>
      </div>

      {/* Navigation arrows (if multiple proofs) */}
      {proofs.length > 1 && (
        <>
          <button
            onClick={() => current > 0 && setCurrent(current - 1)}
            disabled={current === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-51 w-12 h-12 rounded-[4px] bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={() => current < proofs.length - 1 && setCurrent(current + 1)}
            disabled={current === proofs.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-51 w-12 h-12 rounded-[4px] bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>
  );
}
```

---

### `src/lib/db/schema.ts` (extend, schema)

**Analog:** `src/lib/db/schema.ts` (existing for reference)

**Changes needed** (do NOT rewrite the file; apply via migration script + Drizzle update):

1. **Extend `orderStatusValues`** enum (line ~500):
   ```typescript
   export const orderStatusValues = [
     "pending",
     "awaiting_customer",
     "awaiting_payment_review",
     "paid",
     "processing",
     "shipped",
     "delivered",
     "cancelled",
   ] as const;
   ```

2. **Add `payment_method` column to `orders` table**:
   ```typescript
   paymentMethod: mysqlEnum("payment_method", ["paypal", "bank_transfer"])
     .notNull()
     .default("paypal"), // Will be set to NULL for new orders; backfilled for existing PayPal ones
   ```

3. **Add bank-detail + template columns to `store_settings`**:
   ```typescript
   bankName: varchar("bank_name", { length: 100 }).default(null),
   bankAccountNumber: varchar("bank_account_number", { length: 50 }).default(null),
   bankAccountHolder: varchar("bank_account_holder", { length: 200 }).default(null),
   draftLinkTemplate: text("draft_link_template").default(null), // Mustache-style
   ```

4. **New `payment_proofs` table**:
   ```typescript
   export const paymentProofs = mysqlTable("payment_proofs", {
     id: char("id", { length: 36 }).notNull().primaryKey(),
     orderId: char("order_id", { length: 36 }).notNull(),
     imageUrl: varchar("image_url", { length: 500 }).notNull(),
     thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
     mimeType: varchar("mime_type", { length: 64 }).notNull(),
     sizeBytes: int("size_bytes").notNull(),
     uploadedBy: mysqlEnum("uploaded_by", ["customer", "admin"]).notNull(),
     uploadedByUserId: char("uploaded_by_user_id", { length: 36 }),
     status: mysqlEnum("status", ["pending", "approved", "rejected"])
       .notNull()
       .default("pending"),
     adminNote: text("admin_note"),
     reviewedBy: char("reviewed_by", { length: 36 }),
     reviewedAt: datetime("reviewed_at"),
     createdAt: datetime("created_at").notNull().defaultNow(),
   });

   export const paymentProofsRelations = relations(paymentProofs, ({ one }) => ({
     order: one(orders, { fields: [paymentProofs.orderId], references: [orders.id] }),
   }));
   ```

---

### `src/app/payment-links/[token]/page.tsx` (extend, route)

**Analog:** `src/app/payment-links/[token]/page.tsx` (lines 29–67, existing page structure)

**Method-picker addition** (new section after order summary, before PaymentLinkIsland):

Pattern: Two cards side-by-side on desktop, stacked on mobile. Add conditional render guard for bank details from store_settings:

```typescript
// In the JSX, after order summary card:

{/* Method picker — replace the old single PaymentLinkIsland with a two-card selector */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
  {/* PayPal card */}
  <PaymentMethodCard
    title="PayPal"
    icon="Wallet"
    description="Pay securely with PayPal"
    isSelected={paymentMethod === "paypal"}
    onSelect={() => setPaymentMethod("paypal")}
  >
    {paymentMethod === "paypal" && (
      <PaymentLinkIsland token={token} clientId={clientId} currency={currency} />
    )}
  </PaymentMethodCard>

  {/* Bank Transfer card — only render if store_settings has bank details */}
  {storeSettings.bankName && storeSettings.bankAccountNumber && storeSettings.bankAccountHolder ? (
    <PaymentMethodCard
      title="Bank Transfer"
      icon="Landmark"
      description="Transfer to our account"
      isSelected={paymentMethod === "bank_transfer"}
      onSelect={() => setPaymentMethod("bank_transfer")}
    >
      {paymentMethod === "bank_transfer" && (
        <BankTransferForm
          orderId={order.id}
          orderTotal={order.totalAmount}
          bankName={storeSettings.bankName}
          bankAccountNumber={storeSettings.bankAccountNumber}
          bankAccountHolder={storeSettings.bankAccountHolder}
          token={token}
        />
      )}
    </PaymentMethodCard>
  ) : null}
</div>
```

---

### `src/components/admin/admin-order-filter.tsx` (extend, component)

**Analog:** `src/components/admin/admin-order-filter.tsx` (lines 14–65, existing filter chip pattern)

**Add new filter value + chip to the FILTERS array**:

```typescript
type FilterValue =
  | "all"
  | "pending"
  | "awaiting_customer"
  | "awaiting_payment_review"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

const FILTERS: { value: FilterValue; label: string; icon?: string }[] = [
  { value: "all",                     label: "All" },
  { value: "pending",                 label: "Pending" },
  { value: "awaiting_customer",       label: "Awaiting customer" },
  { value: "awaiting_payment_review", label: "Awaiting payment review", icon: "amber" },
  { value: "paid",                    label: "Paid" },
  // ... rest
];
```

**Render the count badge** (similar to existing active state styling, but amber-500 for payment-review):

```typescript
{FILTERS.map((f) => {
  const selected = current === f.value;
  const href = f.value === "all" ? path : `${path}?status=${f.value}`;
  const isPaymentReview = f.value === "awaiting_payment_review";
  
  return (
    <Link
      key={f.value}
      href={href}
      className="inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold whitespace-nowrap min-h-[44px]"
      style={{
        borderColor: selected ? (isPaymentReview ? "#f59e0b" : BRAND.ink) : `${BRAND.ink}33`,
        backgroundColor: selected ? (isPaymentReview ? "#f59e0b" : BRAND.ink) : "transparent",
        color: selected ? "#ffffff" : BRAND.ink,
      }}
    >
      {f.label}
      {isPaymentReview && pendingProofCount > 0 && (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold">
          {pendingProofCount}
        </span>
      )}
    </Link>
  );
})}
```

---

### `src/app/(admin)/admin/settings/page.tsx` (extend, route)

**Analog:** `src/app/(admin)/admin/settings/page.tsx` (lines 1–62, existing settings page structure)

**Add bank-details form section** (in the SettingsForm component below the existing Contact section):

```typescript
{/* In SettingsForm, after Contact fieldset, add: */}

<fieldset className="space-y-4">
  <legend className="font-[var(--font-heading)] text-xl md:text-2xl">
    Bank Details
  </legend>
  <p className="text-slate-600 text-sm">
    Customers see these on the draft-order Bank Transfer card. Leave blank to hide the Bank Transfer option.
  </p>

  <div>
    <label className="block text-sm font-medium mb-1">Bank name</label>
    <input
      type="text"
      value={form.bankName ?? ""}
      onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value || null }))}
      className="w-full min-h-[48px] rounded-[4px] border border-slate-300 px-3 py-2"
      placeholder="Maybank"
    />
  </div>

  <div>
    <label className="block text-sm font-medium mb-1">Account number</label>
    <input
      type="text"
      value={form.bankAccountNumber ?? ""}
      onChange={(e) => setForm((p) => ({ ...p, bankAccountNumber: e.target.value || null }))}
      className="w-full min-h-[48px] rounded-[4px] border border-slate-300 px-3 py-2 font-mono"
      placeholder="123456789012"
    />
  </div>

  <div>
    <label className="block text-sm font-medium mb-1">Account holder name</label>
    <input
      type="text"
      value={form.bankAccountHolder ?? ""}
      onChange={(e) => setForm((p) => ({ ...p, bankAccountHolder: e.target.value || null }))}
      className="w-full min-h-[48px] rounded-[4px] border border-slate-300 px-3 py-2"
      placeholder="3D Ninjaz Sdn Bhd"
    />
  </div>

  <button
    type="button"
    onClick={() => setForm((p) => ({ ...p, bankName: null, bankAccountNumber: null, bankAccountHolder: null }))}
    className="text-red-600 text-sm font-medium hover:text-red-700"
  >
    Clear all bank details
  </button>
</fieldset>

{/* Draft Link Template fieldset below */}
<fieldset className="space-y-4">
  <legend className="font-[var(--font-heading)] text-xl md:text-2xl">
    Draft order message template
  </legend>
  <p className="text-slate-600 text-sm">
    Used when sending a draft order via WhatsApp or email. Mustache-style placeholders supported.
  </p>

  {/* Token chips: {{customer_name}}, {{order_number}}, {{total}}, {{link}} */}
  <div className="flex gap-2 flex-wrap">
    {["{{customer_name}}", "{{order_number}}", "{{total}}", "{{link}}"].map((token) => (
      <button
        key={token}
        type="button"
        onClick={() => {
          const textarea = textareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const before = form.draftLinkTemplate.substring(0, start);
            const after = form.draftLinkTemplate.substring(end);
            setForm((p) => ({
              ...p,
              draftLinkTemplate: before + token + after,
            }));
          }
        }}
        className="px-3 py-1 rounded-full text-sm bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200"
      >
        {token}
      </button>
    ))}
  </div>

  <textarea
    ref={textareaRef}
    value={form.draftLinkTemplate ?? ""}
    onChange={(e) => setForm((p) => ({ ...p, draftLinkTemplate: e.target.value }))}
    className="w-full min-h-[120px] rounded-[4px] border border-slate-300 p-3 font-mono text-sm"
    placeholder="Hi {{customer_name}}, here's your order from 3D Ninjaz: {{link}}. Reply here if you have questions."
  />

  {/* Live preview card */}
  <div className="bg-slate-50 rounded-[4px] border border-slate-300 p-4 text-sm">
    <p className="text-slate-600 mb-2">Preview</p>
    <p>{/* renderTemplate(form.draftLinkTemplate, sampleData) */}</p>
  </div>

  <button
    type="button"
    onClick={() => setForm((p) => ({ ...p, draftLinkTemplate: DEFAULT_DRAFT_TEMPLATE }))}
    className="text-blue-600 text-sm font-medium hover:text-blue-700"
  >
    Reset to default
  </button>
</fieldset>
```

---

### `scripts/phase20-migrate.cjs` (migration, batch)

**Analog:** `scripts/phase18-migrate.cjs` or `scripts/phase6-migrate.cjs` (raw-SQL applicator pattern)

**Migration script structure**:

```javascript
/**
 * Phase 20 (20-XX) — order status enum extension + payment_method + store_settings bank + payment_proofs table.
 *
 * Drizzle-kit push hangs on remote (Phase 6 precedent). Apply via raw-SQL
 * applicator. All operations are idempotent: checks exist before ALTER/CREATE.
 *
 * Run: NEXT_PUBLIC_DATABASE_URL=... node scripts/phase20-migrate.cjs
 */

const mysql = require("mysql2/promise");
require("dotenv").config({ path: ".env.local" });

const DB_URL = process.env.NEXT_PUBLIC_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

const pool = mysql.createPool(DB_URL);

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[phase20-migrate] Starting...");

    // 1. Extend orderStatusValues enum
    console.log("[phase20-migrate] Extending orders.status enum...");
    await conn.execute(
      `ALTER TABLE orders MODIFY COLUMN status ENUM(
        'pending',
        'awaiting_customer',
        'awaiting_payment_review',
        'paid',
        'processing',
        'shipped',
        'delivered',
        'cancelled'
      ) NOT NULL DEFAULT 'pending'`
    );
    console.log("[phase20-migrate] ✓ orders.status extended");

    // 2. Add payment_method column
    console.log("[phase20-migrate] Adding payment_method column...");
    try {
      await conn.execute(
        `ALTER TABLE orders ADD COLUMN payment_method ENUM('paypal', 'bank_transfer') NULL DEFAULT NULL`
      );
      console.log("[phase20-migrate] ✓ payment_method column added");
    } catch (err) {
      if (err.code === "ER_DUP_FIELDNAME") {
        console.log("[phase20-migrate] ⊘ payment_method column already exists");
      } else {
        throw err;
      }
    }

    // 3. Back-fill payment_method for existing PayPal orders
    console.log("[phase20-migrate] Back-filling payment_method...");
    await conn.execute(
      `UPDATE orders SET payment_method = 'paypal' WHERE paypal_capture_id IS NOT NULL AND payment_method IS NULL`
    );
    console.log("[phase20-migrate] ✓ payment_method back-filled");

    // 4. Add bank-detail columns to store_settings
    console.log("[phase20-migrate] Adding bank detail columns to store_settings...");
    const cols = ["bank_name", "bank_account_number", "bank_account_holder", "draft_link_template"];
    for (const col of cols) {
      try {
        if (col === "draft_link_template") {
          await conn.execute(
            `ALTER TABLE store_settings ADD COLUMN ${col} LONGTEXT NULL DEFAULT NULL`
          );
        } else {
          const len = col === "bank_name" ? 100 : col === "bank_account_number" ? 50 : 200;
          await conn.execute(
            `ALTER TABLE store_settings ADD COLUMN ${col} VARCHAR(${len}) NULL DEFAULT NULL`
          );
        }
        console.log(`[phase20-migrate] ✓ ${col} added`);
      } catch (err) {
        if (err.code === "ER_DUP_FIELDNAME") {
          console.log(`[phase20-migrate] ⊘ ${col} already exists`);
        } else {
          throw err;
        }
      }
    }

    // 5. Create payment_proofs table
    console.log("[phase20-migrate] Creating payment_proofs table...");
    try {
      await conn.execute(`
        CREATE TABLE payment_proofs (
          id CHAR(36) NOT NULL PRIMARY KEY,
          order_id CHAR(36) NOT NULL,
          image_url VARCHAR(500) NOT NULL,
          thumbnail_url VARCHAR(500) NULL,
          mime_type VARCHAR(64) NOT NULL,
          size_bytes INT NOT NULL,
          uploaded_by ENUM('customer', 'admin') NOT NULL,
          uploaded_by_user_id CHAR(36) NULL,
          status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
          admin_note TEXT NULL,
          reviewed_by CHAR(36) NULL,
          reviewed_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_pp_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          KEY idx_pp_order_status (order_id, status),
          KEY idx_pp_status_created (status, created_at)
        )
      `);
      console.log("[phase20-migrate] ✓ payment_proofs table created");
    } catch (err) {
      if (err.code === "ER_TABLE_EXISTS_ERROR") {
        console.log("[phase20-migrate] ⊘ payment_proofs table already exists");
      } else {
        throw err;
      }
    }

    console.log("[phase20-migrate] ✓ All migrations complete");
  } catch (err) {
    console.error("[phase20-migrate] ERROR:", err.message);
    process.exit(1);
  } finally {
    await conn.release();
    await pool.end();
  }
}

run();
```

---

## Shared Patterns

### Authentication & Authorization
**Source:** `src/lib/auth-helpers.ts` (lines 14–21)

**Apply to:** All new admin server actions in `src/actions/admin-pos.ts`, `src/actions/admin-payment-proofs.ts`

```typescript
// FIRST await in every admin handler (CVE-2025-29927)
const session = await requireAdmin();
// ... rest of function uses session.user.id
```

**Public token-upload action:** No `requireAdmin()` — validate token instead:
```typescript
export async function uploadPaymentProofByToken(
  token: string,
  file: File,
): Promise<{ ok: true; proofId: string } | { ok: false; error: string }> {
  // Validate token without authentication
  const link = await db.query.paymentLinks.findFirst({
    where: eq(paymentLinks.token, token),
  });
  if (!link || link.usedAt || link.expiresAt < new Date()) {
    return { ok: false, error: "Invalid or expired token" };
  }
  
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, link.orderId),
  });
  if (!order || order.status !== "awaiting_customer") {
    return { ok: false, error: "Order not in awaiting_customer state" };
  }
  
  // Proceed with file write + DB insert
}
```

### Order Status Transitions
**Source:** `src/lib/orders.ts` (lines 53–61)

**Apply to:** All order status mutations in `src/actions/admin-payment-proofs.ts`

```typescript
import { assertValidTransition } from "@/lib/orders";

// Before every status write:
assertValidTransition(order.status, newStatus);

// Then update:
await db.update(orders).set({ status: newStatus }).where(eq(orders.id, orderId));
```

### Coupon Application
**Source:** `src/actions/coupons.ts` (lines 61–101, atomic redemption)

**Apply to:** POS coupon apply at submission in `src/actions/admin-pos.ts`

```typescript
import { applyCouponToSubtotal } from "@/lib/pricing";
import { redeemCoupon } from "@/actions/coupons";

// At POS submit, if coupon code provided:
const couponValidation = await validateCoupon(couponCode, subtotal);
if (!couponValidation.ok) {
  return { ok: false, error: couponValidation.error };
}

// Atomic redeem (prevents over-use even with concurrent requests)
const redemption = await redeemCoupon(couponValidation.couponId);
if (!redemption.ok) {
  return { ok: false, error: "Coupon already exhausted" };
}

// Snapshot the discount on the orders row
// (via order_items or orders.discountAmount, depending on schema)
```

### Manual Line Rendering Guards
**Source:** `src/lib/orders.ts` (NEW `isManualLine` helper)

**Apply to:** All order detail, invoice, and email-template render sites

```typescript
import { isManualLine } from "@/lib/orders";

// In invoice.tsx, order detail, email templates:
{item.orderItems.map((item) => (
  isManualLine(item) ? (
    // Render free-text line directly from item.productName + item.unitPrice + item.configurationData
    <div key={item.id}>
      <span>{item.productName}</span>
      <span>{formatMYR(item.unitPrice)}</span>
    </div>
  ) : (
    // Render normal product line with /products/<id> link, image, etc.
    <div key={item.id}>
      <Link href={`/products/${item.productId}`}>
        {item.productName}
      </Link>
      {/* ... */}
    </div>
  )
))}
```

### State Transition & Revalidation
**Source:** `src/actions/admin-refunds.ts` (lines 42–60) + `src/actions/admin-manual-orders.ts` (lines 101–102)

**Apply to:** All state-changing actions in `admin-pos.ts` and `admin-payment-proofs.ts`

```typescript
import { revalidatePath } from "next/cache";
import { assertValidTransition } from "@/lib/orders";

export async function confirmPaymentProof(proofId: string) {
  const session = await requireAdmin();
  
  const proof = await db.query.paymentProofs.findFirst({
    where: eq(paymentProofs.id, proofId),
  });
  if (!proof) return { ok: false, error: "Not found" };
  
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, proof.orderId),
  });
  if (!order) return { ok: false, error: "Order not found" };
  
  // Guard the transition
  assertValidTransition(order.status, "paid");
  
  // Update both tables
  await db
    .update(paymentProofs)
    .set({
      status: "approved",
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
    })
    .where(eq(paymentProofs.id, proofId));

  await db.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
  
  // Invalidate both admin detail + order list cache
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/admin/orders");
  
  return { ok: true };
}
```

### Admin Autosave (localStorage)
**Source:** `src/components/admin/draft-restored-banner.tsx` (existing autosave pattern), `feedback_admin_autosave_universal` memory

**Apply to:** `src/components/admin/pos-builder.tsx`

```typescript
import { useEffect } from "react";

const AUTOSAVE_KEY = "admin-pos-draft";
const AUTOSAVE_DEBOUNCE_MS = 1000;

// In PosBuilder component:
useEffect(() => {
  const timer = setTimeout(() => {
    const draft = JSON.stringify({
      lines,
      customerForm,
      couponCode,
      shippingOverride,
    });
    localStorage.setItem(AUTOSAVE_KEY, draft);
  }, AUTOSAVE_DEBOUNCE_MS);

  return () => clearTimeout(timer);
}, [lines, customerForm, couponCode, shippingOverride]);

// On page load:
useEffect(() => {
  const stored = localStorage.getItem(AUTOSAVE_KEY);
  if (stored) {
    try {
      const draft = JSON.parse(stored);
      setLines(draft.lines);
      setCustomerForm(draft.customerForm);
      // Show restore banner
      setShowRestoreBanner(true);
    } catch {
      // Ignore parse errors
    }
  }
}, []);

// On successful submit:
function onSubmitSuccess() {
  localStorage.removeItem(AUTOSAVE_KEY);
  // ... show confirmation modal
}
```

### Image Render Guards for Manual Lines
**Source:** `src/lib/image-manifest.ts` (pickImage fallback pattern)

**Apply to:** Order detail, invoice, email templates when rendering manual lines

```typescript
import { pickImage } from "@/lib/image-manifest";

{item.productImage ? (
  <Image src={await pickImage(item.productImage)} alt={item.productName} width={100} height={100} />
) : (
  // Fallback: "Item" placeholder for manual lines
  <div className="w-24 h-24 bg-slate-100 rounded flex items-center justify-center">
    <span className="text-xs text-slate-600">Item</span>
  </div>
)}
```

---

## No Analog Found

Files with strategic guidance but no direct codebase analog:

| File | Role | Data Flow | Reason | Strategy |
|------|------|-----------|--------|----------|
| `src/components/admin/pos-builder.tsx` — full component | component | request-response | Unique POS architecture (product picker + multi-line rows + configurator inline + send-draft modal) | Combine patterns from `manual-order-form.tsx` (form structure) + `variant-editor.tsx` (row expansion) + existing modal patterns (send-draft dialog) |
| `src/components/admin/payment-method-card.tsx` | component | request-response | New payment-method picker UI (two-card expand/collapse) | Base on existing card + disclosure patterns in Base UI (Disclosure component for expand/collapse; shadow/border from UI spec) |
| `src/components/admin/bank-transfer-form.tsx` | component | request-response | Bank details display + slip upload form | Combine `ImageUploader` pattern from existing image-upload surfaces + form shape from `manual-order-form.tsx` |
| `src/actions/payment-links.ts` (extend) — `uploadPaymentProofByToken` | server-action | file-I/O + CRUD | Public token-based file upload (customer side) | Reuse token-validation logic from existing `getPaymentLinkByToken` function (lines 60–91); add file write via `writePaymentProof` helper |

---

## Metadata

**Analog search scope:** All of `src/actions/admin-*.ts`, `src/components/admin/*.tsx`, `src/lib/orders.ts`, `src/lib/storage.ts`, `src/lib/store-settings.ts`, `src/app/(admin)/admin/*/page.tsx`, `src/app/payment-links/[token]/page.tsx`, migration scripts

**Files scanned:** 19 action files, 45+ admin components, 5+ utility modules, 4 route pages, 4 schema/config files

**Pattern extraction date:** 2026-05-17

**Key reusable assets locked from existing codebase:**
- `generatePaymentLink` / `getActivePaymentLink` / `revokePaymentLink` from Phase 7
- `PaymentLinkIsland` Smart Button component
- `getStoreSettings()` cache + invalidation
- `assertValidTransition()` for state machine
- `requireAdmin()` + `CVE-2025-29927` first-await pattern
- `ORDER_STATUS_FLOW` graph (extend only)
- Coupon validator + atomic redemption pattern
- Admin autosave localStorage pattern
- Row-expansion pattern from variant-editor
- admin-order-filter status chip pattern
- Invoice PDF + order item rendering

---

*Phase: 20-admin-pos-draft-order-flow*  
*Patterns mapped: 2026-05-17*  
*Next step: Planner consumes these patterns to write action/component/route briefs for Sonnet executor*
