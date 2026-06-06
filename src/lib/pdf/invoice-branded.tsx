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
    // Margins live on the Page (not the content View) so they repeat on EVERY
    // physical page when content flows/wraps — this is what keeps the fixed
    // footer clear of the items table on multi-page invoices. The fixed footer
    // + page-number use absolute offsets measured from the page edge, so this
    // bottom padding does not push them up.
    paddingTop: 22,
    paddingBottom: 92,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: INK,
  },
  // Fills the page height so the bottom block (Bill/Ship-To + totals) can pin
  // to the bottom of the page. justifyContent is set per page: "space-between"
  // on the last page (pins the bottom block down), "flex-start" otherwise.
  content: {
    flexGrow: 1,
  },

  // ── Header row ──────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: {
    // Compact logo so 9 item rows fit on page 1 (next to the "Billed To" box).
    height: 96,
    maxWidth: 240,
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
    // Nudge the block down a little so the dates aren't cramped against the top
    // edge / clipped. Only affects this block, not the whole page.
    marginTop: 16,
  },
  grayLabel: {
    fontSize: 11,
    color: SLATE,
    marginBottom: 2,
  },
  boldMd: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  boldSm: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  boldLg: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  metaGap: {
    marginTop: 5,
  },

  // ── Hero ────────────────────────────────────────────────────────────────
  heroRow: {
    // Pulled up — less gap between the logo/header and the "Invoice" title.
    marginTop: 4,
  },
  heroTitle: {
    fontSize: 38,
    fontFamily: "Helvetica-Bold",
    color: INK,
    lineHeight: 1,
  },
  heroSub: {
    fontSize: 11,
    color: SLATE,
    marginTop: 2,
  },

  // ── Divider ─────────────────────────────────────────────────────────────
  divider: {
    borderBottom: 1,
    borderBottomColor: DIVIDER,
    marginTop: 8,
    marginBottom: 8,
  },

  // ── Table ───────────────────────────────────────────────────────────────
  tableHeadRow: {
    flexDirection: "row",
    paddingBottom: 6,
    // Solid line under the column headings (No | Description | Price | Qty |
    // Amount), then a gap before the first item row.
    borderBottom: 1.5,
    borderBottomColor: INK,
    marginBottom: 8,
  },
  tableDataRow: {
    flexDirection: "row",
    // Cells vertically centred so the row's separator line sits centred
    // relative to the text.
    alignItems: "center",
    paddingVertical: 4,
    borderBottom: 1,
    borderBottomColor: DIVIDER,
  },
  tableHeadText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  tableDataText: {
    fontSize: 11,
    // 1pt top/bottom so the text is centred within the row line.
    marginVertical: 1,
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
  // Section title with a bold separator line under it (between the title and
  // the details below). Border on the Text itself so it always renders.
  addressTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    width: "100%",
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
    paddingBottom: 5,
    marginBottom: 8,
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
    width: "44%",
  },
  // Totals-side section title with the same bold separator as addressTitle.
  summaryTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    width: "100%",
    textAlign: "right",
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
    paddingBottom: 5,
    marginBottom: 8,
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
      // Explicit A4 point dimensions (not 100%) so the full-bleed background
      // still covers edge-to-edge now that the Page carries padding.
      style={{ position: "absolute", top: 0, left: 0, width: W, height: H }}
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

  // ── Paid / status date ─────────────────────────────────────────────────────
  // For a paid order show a "Paid Date". Prefer the real PayPal settlement when
  // present; otherwise fall back to the last status-transition time (updatedAt
  // is touched on every status change — admin mark-paid, slip upload, shipping
  // — via onUpdateNow), then the order date. This makes the date reflect
  // backend/admin actions, not just PayPal.
  const toDate = (v: Date | string | null | undefined): Date | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const paidDate =
    toDate(order.paypalSettleDate) ?? toDate(order.updatedAt) ?? createdAt;

  // ── Display name (shared by height estimate AND render so they agree) ───────
  function displayNameOf(item: (typeof order.items)[number]): string {
    if (isManualLine(item)) return item.productName;
    const cfg = ensureOrderItemConfigData(item.configurationData);
    const variant =
      cfg?.computedSummary ??
      item.variantLabel ??
      (item.size ? `Size ${item.size}` : null);
    return variant ? `${item.productName} (${variant})` : item.productName;
  }

  // ── Pagination: up to 10 line items per page, height-aware ──────────────────
  // Cap at 10 rows/page, but also pack by ESTIMATED row height so a page never
  // overflows (overflow makes react-pdf spill into a messy/near-blank page).
  // The Bill/Ship-To + totals block sits on the LAST page, pinned to the page
  // bottom (justifyContent: space-between). Estimates round UP — that only
  // costs a row, while under-estimating would reintroduce the gap page.
  const ITEMS_PER_PAGE = 10;
  const PAGE_CONTENT_H = 728; // A4 842 − page paddingTop 22 − paddingBottom 92
  const HEADER_BLOCK_H = 200; // page-1 logo + bill-to + hero + divider
  const TABLE_HEAD_H = 30; // column-heading row + its gap
  const BOTTOM_BLOCK_H = 150; // address + totals block
  const DESC_CHARS_PER_LINE = 46; // chars that fit the description column
  const ROW_BASE_H = 13; // row padding + border
  const LINE_H = 13; // per wrapped description line

  function estRowHeight(item: (typeof order.items)[number]): number {
    const lines = Math.max(
      1,
      Math.ceil(displayNameOf(item).length / DESC_CHARS_PER_LINE),
    );
    return ROW_BASE_H + lines * LINE_H;
  }

  type PageChunk = {
    rows: Array<{ item: (typeof order.items)[number]; index: number }>;
    hasBottom: boolean;
  };
  // Single-page orders reserve the bottom block on page 1. Multi-page orders let
  // page 1 fill (it is never last) and reserve the bottom on later pages, so the
  // last page always carries some rows plus the pinned totals — never blank.
  const totalRowsH = order.items.reduce((s, it) => s + estRowHeight(it), 0);
  const singlePage =
    order.items.length <= ITEMS_PER_PAGE &&
    HEADER_BLOCK_H + TABLE_HEAD_H + totalRowsH + BOTTOM_BLOCK_H <= PAGE_CONTENT_H;
  const pageBudget = (pageIndex: number) =>
    PAGE_CONTENT_H -
    (pageIndex === 0 ? HEADER_BLOCK_H : 0) -
    TABLE_HEAD_H -
    (pageIndex === 0 && !singlePage ? 0 : BOTTOM_BLOCK_H);

  const chunks: PageChunk[] = [];
  let curRows: PageChunk["rows"] = [];
  let curUsed = 0;
  order.items.forEach((item, index) => {
    const h = estRowHeight(item);
    const full =
      curRows.length >= ITEMS_PER_PAGE ||
      (curRows.length > 0 && curUsed + h > pageBudget(chunks.length));
    if (full) {
      chunks.push({ rows: curRows, hasBottom: false });
      curRows = [];
      curUsed = 0;
    }
    curRows.push({ item, index });
    curUsed += h;
  });
  chunks.push({ rows: curRows, hasBottom: true });
  chunks.forEach((c, i) => (c.hasBottom = i === chunks.length - 1));

  // ── Reusable fragments ────────────────────────────────────────────────────
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
    const displayName = displayNameOf(item);
    return (
      <View key={item.id} style={styles.tableDataRow} wrap={false}>
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

  const bottomBlock = () => (
    <View style={styles.bottomRow} wrap={false}>
      {/* Customer ship-to address */}
      <View style={styles.addressBlock}>
        {/* Title carries a bold separator line under it (see addressTitle). */}
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
        <Text style={styles.summaryTitle}>Payment Summary</Text>
        {hasBreakdown ? (
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Subtotal</Text>
            <Text style={styles.breakdownValue}>{formatMYR(rawSubtotal)}</Text>
          </View>
        ) : null}

        {hasDiscount ? (
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>
              {order.discountCode ? "Discount (" + order.discountCode + ")" : "Discount"}
            </Text>
            <Text style={styles.breakdownValue}>{"-" + formatMYR(rawDiscount)}</Text>
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
  );

  return (
    <Document>
      {chunks.map((chunk, pageIndex) => {
        const isFirst = pageIndex === 0;
        const showHead = chunk.rows.length > 0 || isFirst;

        return (
          <Page key={pageIndex} size="A4" style={styles.page}>
            {/* Diagonal stripes — full-bleed background behind content */}
            <DiagonalStripes />

            {/* CANCELLED / PAID watermark — fixed, repeats per page */}
            {isCancelled ? (
              <Text fixed style={styles.watermark}>CANCELLED</Text>
            ) : isPaid ? (
              <Text fixed style={styles.watermarkPaid}>PAID</Text>
            ) : null}

            {/* content fills the page height; on the last page (hasBottom) the
                Bill/Ship-To + totals block is pinned to the page bottom via
                justifyContent: space-between. */}
            <View
              style={[
                styles.content,
                { justifyContent: chunk.hasBottom ? "space-between" : "flex-start" },
              ]}
            >
              <View>
                {/* Header (logo + bill-to + hero + divider) — page 1 only */}
                {isFirst ? (
                  <View wrap={false}>
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

                        {/* Paid orders show the Paid Date; unpaid show Due Date */}
                        {isPaid ? (
                          <>
                            <View style={styles.metaGap} />
                            <Text style={styles.grayLabel}>Paid Date :</Text>
                            <Text style={styles.boldSm}>{formatInvoiceDate(paidDate)}</Text>
                          </>
                        ) : (
                          <>
                            <View style={styles.metaGap} />
                            <Text style={styles.grayLabel}>Due Date :</Text>
                            <Text style={styles.boldLg}>{formatInvoiceDate(dueDate)}</Text>
                          </>
                        )}
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
                  </View>
                ) : null}

                {/* Items table — rows pre-measured so they never overflow a
                    page (no gap page). Each row wrap=false. */}
                {showHead ? tableHead() : null}
                {chunk.rows.map(({ item, index }) => renderRow(item, index))}
              </View>

              {/* Bottom block — only on the last page, pinned to the bottom */}
              {chunk.hasBottom ? bottomBlock() : null}
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
