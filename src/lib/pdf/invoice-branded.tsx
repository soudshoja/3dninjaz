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
  },

  // ── Header row ──────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: {
    width: 130,
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
    marginTop: 24,
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
    paddingVertical: 8,
    borderBottom: 1,
    borderBottomColor: DIVIDER,
  },
  tableHeadText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  tableDataText: {
    fontSize: 11,
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
    alignItems: "flex-end",
    marginTop: 16,
  },
  paymentBlock: {
    flexDirection: "column",
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

export function NinjazInvoiceDocument({
  order,
  business,
}: {
  order: InvoiceOrder;
  business: NinjazInvoiceBusiness;
}) {
  const isCancelled = order.status === "cancelled";

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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Diagonal stripes — rendered behind content */}
        <DiagonalStripes />

        {/* CANCELLED watermark — fixed so it does not contribute to flow */}
        {isCancelled ? (
          <Text fixed style={styles.watermark}>CANCELLED</Text>
        ) : null}

        {/* Main content area */}
        <View style={styles.content}>

          {/* Header row: logo left, bill-to right */}
          <View style={styles.headerRow}>
            {/* Logo */}
            {business.logoBase64 ? (
              <Image src={business.logoBase64} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>{business.businessName}</Text>
            )}

            {/* Bill-to / dates */}
            <View style={styles.billToBlock}>
              <Text style={styles.grayLabel}>Billed To :</Text>
              <Text style={styles.boldMd}>{order.shippingName}</Text>

              <View style={styles.metaGap} />
              <Text style={styles.grayLabel}>Invoice Date :</Text>
              <Text style={styles.boldSm}>{formatInvoiceDate(createdAt)}</Text>

              <View style={styles.metaGap} />
              <Text style={styles.grayLabel}>Due Date :</Text>
              <Text style={styles.boldLg}>{formatInvoiceDate(dueDate)}</Text>
            </View>
          </View>

          {/* Hero */}
          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>Invoice</Text>
            <Text style={styles.heroSub}>
              {"Invoice no : " + formatOrderNumber(order.id)}
            </Text>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Table */}
          {/* Header */}
          <View style={styles.tableHeadRow}>
            <Text style={[styles.colNo, styles.tableHeadText]}>No</Text>
            <Text style={[styles.colDesc, styles.tableHeadText]}>Item Description</Text>
            <Text style={[styles.colPrice, styles.tableHeadText]}>Price</Text>
            <Text style={[styles.colQty, styles.tableHeadText]}>Qty</Text>
            <Text style={[styles.colAmount, styles.tableHeadText]}>Amount</Text>
          </View>

          {/* Data rows */}
          {order.items.map((item, index) => {
            if (isManualLine(item)) {
              return (
                <View key={item.id} style={styles.tableDataRow}>
                  <Text style={[styles.colNo, styles.tableDataText]}>
                    {String(index + 1)}
                  </Text>
                  <Text style={[styles.colDesc, styles.tableDataText]}>
                    {item.productName}
                  </Text>
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
            const cfg = ensureOrderItemConfigData(item.configurationData);
            const variant =
              cfg?.computedSummary ??
              item.variantLabel ??
              (item.size ? `Size ${item.size}` : null);
            const displayName = variant
              ? `${item.productName} (${variant})`
              : item.productName;
            return (
              <View key={item.id} style={styles.tableDataRow}>
                <Text style={[styles.colNo, styles.tableDataText]}>
                  {String(index + 1)}
                </Text>
                <Text style={[styles.colDesc, styles.tableDataText]}>
                  {displayName}
                </Text>
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
          })}

          {/* Flex spacer */}
          <View style={styles.spacer} />

          {/* Bottom row: payment info + total */}
          <View style={styles.bottomRow}>
            {/* Payment info */}
            <View style={styles.paymentBlock}>
              {hasBankInfo ? (
                <>
                  <Text style={styles.paymentTitle}>
                    Please make payment via
                  </Text>
                  <Text style={styles.paymentLine}>
                    {"Bank Name: " + (business.bankName ?? "")}
                  </Text>
                  <Text style={styles.paymentLine}>
                    {"Account Number : " + (business.bankAccountNumber ?? "")}
                  </Text>
                  <Text style={styles.paymentLine}>
                    {"Account Holder : " + (business.bankAccountHolder ?? "")}
                  </Text>
                </>
              ) : null}
            </View>

            {/* Total breakdown + grand total */}
            <View style={styles.totalBlock}>
              {/* Subtotal row */}
              {hasBreakdown ? (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Subtotal</Text>
                  <Text style={styles.breakdownValue}>
                    {formatMYR(rawSubtotal)}
                  </Text>
                </View>
              ) : null}

              {/* Shipping row */}
              {hasBreakdown ? (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Shipping</Text>
                  <Text style={styles.breakdownValue}>{shippingFormatted}</Text>
                </View>
              ) : null}

              {/* Divider before grand total */}
              {hasBreakdown ? (
                <View style={styles.breakdownDivider} />
              ) : null}

              <Text style={styles.totalLabel}>Total Amount Due</Text>
              <Text style={styles.totalAmount}>{totalFormatted}</Text>
            </View>
          </View>
        </View>

        {/* Footer bar */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{business.whatsappDisplay}</Text>
          <Text style={styles.footerText}>{business.contactEmail}</Text>
          <Text style={styles.footerText}>{business.website}</Text>
          <Text style={styles.footerText}>{business.city}</Text>
        </View>
      </Page>
    </Document>
  );
}
