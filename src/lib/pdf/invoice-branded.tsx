import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Line,
} from "@react-pdf/renderer";
import { formatMYR } from "@/lib/format";
import { formatOrderNumber, isManualLine } from "@/lib/orders";
import { ensureOrderItemConfigData } from "@/lib/config-fields";
import type { InvoiceOrder } from "./invoice";

/**
 * Phase 21 — Branded invoice PDF for 3D Ninjaz.
 *
 * Canva-matched layout:
 *   - Logo top-left, bill-to/dates top-right
 *   - Large "Invoice" hero text
 *   - Items table with No | Description | Price | Qty | Amount
 *   - Payment info bottom-left, total amount bottom-right
 *   - Dark footer bar with contact info
 *   - Diagonal stripe watermark behind content
 *   - CANCELLED overlay for cancelled orders
 *
 * react-pdf v4 constraints:
 *   - No Intl, no window, no DOM — all formatting in pure TS
 *   - No Canvas — use Svg/Line/Rect for drawing
 *   - Fonts: Helvetica / Helvetica-Bold (built-in)
 */

export type NinjazInvoiceBusiness = {
  businessName: string;
  contactEmail: string;
  whatsappDisplay: string;
  pdpaLine: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  city: string;
  website: string;
  logoBase64: string | null;
};

// ── Date helpers ────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function ordinalSuffix(day: number): string {
  if (day === 1 || day === 21 || day === 31) return "st";
  if (day === 2 || day === 22) return "nd";
  if (day === 3 || day === 23) return "rd";
  return "th";
}

function formatInvoiceDate(d: Date): string {
  const day = d.getDate();
  const suffix = ordinalSuffix(day);
  return `${MONTHS[d.getMonth()]} ${day}${suffix} ${d.getFullYear()}`;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const INK = "#0B1020";
const SLATE = "#475569";
const DIVIDER = "#e2e8f0";
const WHITE = "#ffffff";

const styles = StyleSheet.create({
  page: {
    backgroundColor: WHITE,
    padding: 0,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: INK,
  },
  // Content area sits above the footer and insets from edges
  content: {
    paddingHorizontal: 40,
    paddingTop: 40,
    // paddingBottom gives space above the absolute footer (height ~44pt)
    paddingBottom: 80,
    flex: 1,
    // Top group at the top, the bottom block (Bill/Ship-To + totals) pinned to
    // the bottom of every page.
    justifyContent: "space-between",
  },

  // ── Header row ──────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: {
    // Large, prominent logo on page 1 (next to the "Billed To" box).
    height: 132,
    maxWidth: 320,
    objectFit: "contain",
  },
  // "Page X / Y" indicator — fixed, just above the footer bar, on every page.
  pageNumber: {
    position: "absolute",
    bottom: 52,
    right: 40,
    fontSize: 9,
    color: SLATE,
  },
  // Smaller logo for continuation pages (2+).
  logoSmall: {
    height: 34,
    maxWidth: 110,
    objectFit: "contain",
  },
  logoFallback: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  billToBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  grayLabel: {
    fontSize: 10,
    color: SLATE,
    marginBottom: 2,
  },
  boldMd: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  boldSm: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  boldLg: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  metaGap: {
    marginTop: 8,
  },

  // ── Hero ────────────────────────────────────────────────────────────────
  heroRow: {
    // Pulled up — less gap between the logo/header and the "Invoice" title.
    marginTop: 10,
  },
  heroTitle: {
    fontSize: 52,
    fontFamily: "Helvetica-Bold",
    color: INK,
    lineHeight: 1,
  },
  heroSub: {
    fontSize: 11,
    color: SLATE,
    marginTop: 4,
  },

  // ── Divider ─────────────────────────────────────────────────────────────
  divider: {
    borderBottom: 1,
    borderBottomColor: DIVIDER,
    marginTop: 16,
    marginBottom: 16,
  },

  // ── Table ───────────────────────────────────────────────────────────────
  tableHeadRow: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottom: 1.5,
    borderBottomColor: INK,
  },
  tableDataRow: {
    flexDirection: "row",
    // Cells vertically centred so the row's separator line sits centred
    // relative to the text.
    alignItems: "center",
    paddingVertical: 6,
    borderBottom: 1,
    borderBottomColor: DIVIDER,
  },
  tableHeadText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  tableDataText: {
    fontSize: 11,
    // 2pt top/bottom so the text is centred within the row line.
    marginVertical: 2,
  },
  colNo: {
    flex: 0.4,
  },
  colDesc: {
    flex: 3,
  },
  colPrice: {
    flex: 1,
    textAlign: "right",
  },
  colQty: {
    flex: 0.8,
    textAlign: "center",
  },
  colAmount: {
    flex: 1,
    textAlign: "right",
  },

  // ── Spacer ──────────────────────────────────────────────────────────────
  spacer: {
    flex: 1,
    minHeight: 40,
  },

  // ── Bottom row ──────────────────────────────────────────────────────────
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    // Top-align so the customer address (left) lines up with the totals box
    // (right) instead of sinking to the baseline.
    alignItems: "flex-start",
    // Space below the items table (the flex spacer was removed — it caused an
    // extra blank page on multi-page invoices).
    marginTop: 28,
  },
  // Customer ship-to address block — bottom-left, aligned with the totals box.
  addressBlock: {
    flexDirection: "column",
    width: "48%",
  },
  addressTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 6,
  },
  addressLine: {
    fontSize: 10,
    color: SLATE,
    marginBottom: 2,
  },
  // Continuation header on pages 2+ (keeps a clear top margin + context).
  contHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  contTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  pageNote: {
    fontSize: 9,
    color: SLATE,
  },
  paymentBlock: {
    flexDirection: "column",
  },
  paymentBlockSpaced: {
    flexDirection: "column",
    marginTop: 10,
  },
  paymentTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 6,
  },
  paymentLine: {
    fontSize: 10,
    color: SLATE,
    marginBottom: 2,
  },
  totalBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  // Subtotal / shipping breakdown rows
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 3,
  },
  breakdownLabel: {
    fontSize: 10,
    color: SLATE,
    textAlign: "right",
    marginRight: 12,
    minWidth: 60,
  },
  breakdownValue: {
    fontSize: 10,
    color: SLATE,
    textAlign: "right",
    minWidth: 60,
    fontFamily: "Helvetica",
  },
  breakdownDivider: {
    borderBottom: 1,
    borderBottomColor: DIVIDER,
    marginTop: 4,
    marginBottom: 6,
    width: "100%",
  },
  totalLabel: {
    fontSize: 11,
    color: SLATE,
    textAlign: "right",
  },
  totalAmount: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    color: INK,
  },

  // ── Footer bar ──────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: INK,
    paddingVertical: 12,
    paddingHorizontal: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 10,
    color: WHITE,
  },

  // ── CANCELLED watermark ─────────────────────────────────────────────────
  watermark: {
    position: "absolute",
    top: 260,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 72,
    color: "rgba(220,38,38,0.18)",
    transform: "rotate(-20deg)",
  },
  // ── PAID watermark ──────────────────────────────────────────────────────
  watermarkPaid: {
    position: "absolute",
    top: 260,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 72,
    color: "rgba(34,197,94,0.18)",
    transform: "rotate(-20deg)",
  },
  // ── PAID badge (hero area) ───────────────────────────────────────────────
  paidBadge: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.5)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  paidBadgeText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#16a34a",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});

// ── Diagonal stripes SVG ─────────────────────────────────────────────────────
// A4 page = 595 x 842 pt. Draw lines at ~30° angle spaced ~40pt apart.
// We extend lines well beyond the page boundary so they cover edge-to-edge.
function DiagonalStripes() {
  // Lines run from bottom-left to top-right at ~30 degrees.
  // step between lines along the x axis (perpendicular spacing ~40pt)
  const STEP = 40;
  const W = 595;
  const H = 842;

  // Generate start/end points. Lines are defined as going from
  // (x, H) upward to the right at tan(30°) ≈ 0.577 slope.
  // We sweep x from -(H * tan(30°)) to W so coverage is full.
  const tan30 = Math.tan((30 * Math.PI) / 180); // ≈ 0.5774
  const xStart = -Math.round(H * tan30);
  const xEnd = W + Math.round(H * tan30);
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let x = xStart; x <= xEnd; x += STEP) {
    lines.push({
      x1: x,
      y1: H,
      x2: x + Math.round(H * tan30),
      y2: 0,
    });
  }

  return (
    <Svg
      fixed
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      viewBox={`0 0 ${W} ${H}`}
    >
      {lines.map((l, i) => (
        <Line
          key={i}
          x1={String(l.x1)}
          y1={String(l.y1)}
          x2={String(l.x2)}
          y2={String(l.y2)}
          stroke="#e2e8f0"
          strokeWidth="0.5"
          opacity="0.6"
        />
      ))}
    </Svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** Statuses that represent a completed payment. */
const PAID_STATUSES = new Set([
  "paid",
  "processing",
  "shipped",
  "delivered",
  "completed",
]);

export function NinjazInvoiceDocument({
  order,
  business,
}: {
  order: InvoiceOrder;
  business: NinjazInvoiceBusiness;
}) {
  const isCancelled = order.status?.toLowerCase() === "cancelled";
  const isPaid = !isCancelled && PAID_STATUSES.has(order.status?.toLowerCase() ?? "");

  const createdAt = order.createdAt instanceof Date
    ? order.createdAt
    : new Date(order.createdAt);
  const dueDate = new Date(createdAt.getTime() + 10 * 24 * 60 * 60 * 1000);

  const hasBankInfo =
    business.bankName && business.bankAccountNumber && business.bankAccountHolder;

  // Format total without space: "RM99.00"
  const rawTotal = typeof order.totalAmount === "string"
    ? parseFloat(order.totalAmount)
    : order.totalAmount;
  const totalFormatted = Number.isFinite(rawTotal)
    ? `RM${rawTotal.toFixed(2)}`
    : "RM0.00";

  // Subtotal + shipping breakdown
  const rawSubtotal = parseFloat(order.subtotal ?? "");
  const rawShipping = parseFloat(order.shippingCost ?? "");

  const hasBreakdown =
    Number.isFinite(rawSubtotal) && Number.isFinite(rawShipping);
  const shippingFormatted =
    hasBreakdown && rawShipping === 0
      ? "FREE"
      : hasBreakdown
        ? formatMYR(rawShipping)
        : null;

  // Coupon discount (optional). Only shown when a positive discount exists so
  // the invoice total reconciles with the order page (subtotal − discount +
  // shipping = total).
  const rawDiscount = parseFloat(order.discountAmount ?? "");
  const hasDiscount = Number.isFinite(rawDiscount) && rawDiscount > 0;

  // ── Pagination: max 10 line items per page; remainder flows to next page ──
  const ITEMS_PER_PAGE = 10;
  const pages: (typeof order.items)[] = [];
  for (let i = 0; i < order.items.length; i += ITEMS_PER_PAGE) {
    pages.push(order.items.slice(i, i + ITEMS_PER_PAGE));
  }
  // Always render at least one page even for an empty item list.
  if (pages.length === 0) pages.push([]);
  const pageCount = pages.length;

  // ── Reusable fragments ────────────────────────────────────────────────────
  // NOTE: these MUST be functions returning fresh elements. react-pdf's
  // reconciler cannot reuse the same element instance across multiple <Page>s
  // (throws "Cannot read properties of null (reading 'props')").
  const tableHead = () => (
    <View style={styles.tableHeadRow}>
      <Text style={[styles.colNo, styles.tableHeadText]}>No</Text>
      <Text style={[styles.colDesc, styles.tableHeadText]}>Item Description</Text>
      <Text style={[styles.colPrice, styles.tableHeadText]}>Price</Text>
      <Text style={[styles.colQty, styles.tableHeadText]}>Qty</Text>
      <Text style={[styles.colAmount, styles.tableHeadText]}>Amount</Text>
    </View>
  );

  function renderRow(item: (typeof order.items)[number], index: number) {
    let displayName = item.productName;
    if (!isManualLine(item)) {
      const cfg = ensureOrderItemConfigData(item.configurationData);
      const variant =
        cfg?.computedSummary ??
        item.variantLabel ??
        (item.size ? `Size ${item.size}` : null);
      displayName = variant ? `${item.productName} (${variant})` : item.productName;
    }
    return (
      <View key={item.id} style={styles.tableDataRow}>
        <Text style={[styles.colNo, styles.tableDataText]}>{String(index + 1)}</Text>
        <Text style={[styles.colDesc, styles.tableDataText]}>{displayName}</Text>
        <Text style={[styles.colPrice, styles.tableDataText]}>
          {formatMYR(item.unitPrice)}
        </Text>
        <Text style={[styles.colQty, styles.tableDataText]}>
          {String(item.quantity)}
        </Text>
        <Text style={[styles.colAmount, styles.tableDataText]}>
          {formatMYR(item.lineTotal)}
        </Text>
      </View>
    );
  }

  const footerBar = () => (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{business.whatsappDisplay}</Text>
      <Text style={styles.footerText}>{business.contactEmail}</Text>
      <Text style={styles.footerText}>{business.website}</Text>
      <Text style={styles.footerText}>{business.city}</Text>
    </View>
  );

  return (
    <Document>
      {pages.map((pageItems, pageIndex) => {
        const isFirst = pageIndex === 0;
        const isLast = pageIndex === pageCount - 1;
        // Running item number offset so "No" stays continuous across pages.
        const startIndex = pageIndex * ITEMS_PER_PAGE;

        return (
          <Page key={pageIndex} size="A4" style={styles.page}>
            {/* Diagonal stripes — behind content */}
            <DiagonalStripes />

            {/* CANCELLED watermark — fixed so it does not contribute to flow */}
            {isCancelled ? (
              <Text fixed style={styles.watermark}>CANCELLED</Text>
            ) : isPaid ? (
              <Text fixed style={styles.watermarkPaid}>PAID</Text>
            ) : null}

            {/* Main content area — paddingTop on every page gives the top
                margin requested for page 2+. */}
            <View style={styles.content}>
              {/* Top group — header (page 1 only) + items table. wrap=false prevents
                  this content from splitting across pages (which would cause a page
                  with just the bottom block after a partial items split). */}
              <View wrap={false}>
              {isFirst ? (
                <>
                  {/* Header row: logo left, bill-to right */}
                  <View style={styles.headerRow}>
                    {business.logoBase64 ? (
                      <Image src={business.logoBase64} style={styles.logo} />
                    ) : (
                      <Text style={styles.logoFallback}>{business.businessName}</Text>
                    )}

                    <View style={styles.billToBlock}>
                      <Text style={styles.grayLabel}>Billed To :</Text>
                      <Text style={styles.boldMd}>{order.shippingName}</Text>

                      <View style={styles.metaGap} />
                      <Text style={styles.grayLabel}>Invoice Date :</Text>
                      <Text style={styles.boldSm}>{formatInvoiceDate(createdAt)}</Text>

                      {!isPaid ? (
                        <>
                          <View style={styles.metaGap} />
                          <Text style={styles.grayLabel}>Due Date :</Text>
                          <Text style={styles.boldLg}>{formatInvoiceDate(dueDate)}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>

                  {/* Hero */}
                  <View style={styles.heroRow}>
                    <Text style={styles.heroTitle}>Invoice</Text>
                    <Text style={styles.heroSub}>
                      {"Invoice no : " + formatOrderNumber(order.id)}
                    </Text>
                    {isPaid ? (
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeText}>Paid</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.divider} />
                </>
              ) : null /* Pages 2+: no logo/header — top margin comes from content paddingTop. */}

              {/* Items table */}
              {tableHead()}
              {pageItems.map((item, i) => renderRow(item, startIndex + i))}
              </View>

              {/* Bottom block — only on the LAST page. Pinned to the bottom of
                  the page (content justifyContent: space-between). wrap=false
                  keeps Bill/Ship-To + totals together on one page. */}
              {isLast ? (
                <View style={styles.bottomRow} wrap={false}>
                  {/* Customer ship-to address */}
                  <View style={styles.addressBlock}>
                    <Text style={styles.addressTitle}>Bill / Ship To</Text>
                    <Text style={styles.addressLine}>{order.shippingName}</Text>
                    <Text style={styles.addressLine}>{order.shippingLine1}</Text>
                    {order.shippingLine2 ? (
                      <Text style={styles.addressLine}>{order.shippingLine2}</Text>
                    ) : null}
                    <Text style={styles.addressLine}>
                      {order.shippingPostcode + " " + order.shippingCity}
                    </Text>
                    <Text style={styles.addressLine}>
                      {order.shippingState + ", " + order.shippingCountry}
                    </Text>
                    {order.shippingPhone ? (
                      <Text style={styles.addressLine}>{order.shippingPhone}</Text>
                    ) : null}

                    {/* Bank payment info — only shown for unpaid orders */}
                    {!isPaid && hasBankInfo ? (
                      <View style={styles.paymentBlockSpaced}>
                        <Text style={styles.paymentTitle}>Please make payment via</Text>
                        <Text style={styles.paymentLine}>
                          {"Bank Name: " + (business.bankName ?? "")}
                        </Text>
                        <Text style={styles.paymentLine}>
                          {"Account Number : " + (business.bankAccountNumber ?? "")}
                        </Text>
                        <Text style={styles.paymentLine}>
                          {"Account Holder : " + (business.bankAccountHolder ?? "")}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Total breakdown + grand total */}
                  <View style={styles.totalBlock}>
                    {hasBreakdown ? (
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Subtotal</Text>
                        <Text style={styles.breakdownValue}>
                          {formatMYR(rawSubtotal)}
                        </Text>
                      </View>
                    ) : null}

                    {hasDiscount ? (
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>
                          {order.discountCode ? "Discount (" + order.discountCode + ")" : "Discount"}
                        </Text>
                        <Text style={styles.breakdownValue}>
                          {"-" + formatMYR(rawDiscount)}
                        </Text>
                      </View>
                    ) : null}

                    {hasBreakdown ? (
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Shipping</Text>
                        <Text style={styles.breakdownValue}>{shippingFormatted}</Text>
                      </View>
                    ) : null}

                    {hasBreakdown ? <View style={styles.breakdownDivider} /> : null}

                    <Text style={styles.totalLabel}>
                      {isPaid ? "Total Paid" : "Total Amount Due"}
                    </Text>
                    <Text style={styles.totalAmount}>{totalFormatted}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Page number — "Page X / Y", auto-computed by react-pdf */}
            <Text
              style={styles.pageNumber}
              fixed
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} / ${totalPages}`
              }
            />

            {/* Footer bar */}
            {footerBar()}
          </Page>
        );
      })}
    </Document>
  );
}
