import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Path,
} from "@react-pdf/renderer";
import { formatMYR } from "@/lib/format";
import { formatOrderNumber, isManualLine } from "@/lib/orders";
import { ensureOrderItemConfigData } from "@/lib/config-fields";
import type { InvoiceOrder } from "./invoice";

/**
 * Phase 21 — Branded invoice PDF for 3D Ninjaz.
 *
 * Canva-matched layout:
 *   - Soft wavy diagonal stripes background (light gray, subtle)
 *   - White rounded body panel behind content
 *   - Logo top-left, bill-to/dates top-right
 *   - Large "Invoice" hero text
 *   - Items table with No | Description | Price | Qty | Amount
 *   - Payment info bottom-left (bank_transfer only), total amount bottom-right
 *   - Dark footer bar with contact info (whatsapp | email | website)
 *   - CANCELLED overlay for cancelled orders
 *
 * react-pdf v4 constraints:
 *   - No Intl, no window, no DOM — all formatting in pure TS
 *   - No Canvas — use Svg/Path for drawing
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
const SLATE = "#64748b";
const DIVIDER = "#e2e8f0";
const WHITE = "#ffffff";

const styles = StyleSheet.create({
  page: {
    // Light cool-gray page background — stripes will sit on top
    backgroundColor: "#eef0f3",
    padding: 0,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: INK,
  },

  // White rounded body panel that sits over the stripes background.
  // Margins are intentionally asymmetric to match the target:
  // top/left/right show the stripe background; bottom reserved for footer.
  bodyPanel: {
    position: "absolute",
    top: 22,
    left: 22,
    right: 22,
    bottom: 46, // sits just above the footer bar
    backgroundColor: WHITE,
    borderRadius: 10,
  },

  // Content area — inset from white panel edges
  content: {
    paddingHorizontal: 40,
    paddingTop: 36,
    paddingBottom: 76, // breathing room above absolute footer
    flex: 1,
  },

  // ── Header row ──────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: {
    width: 110,
  },
  logoFallback: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },

  // Bill-to block on the right — text aligned right
  billToBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  grayLabel: {
    fontSize: 8,
    color: SLATE,
    marginBottom: 1,
  },
  boldValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 0,
  },
  boldValueLg: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  metaGap: {
    marginTop: 6,
  },

  // ── Hero ────────────────────────────────────────────────────────────────
  heroRow: {
    marginTop: 18,
  },
  heroTitle: {
    fontSize: 62,
    fontFamily: "Helvetica-Bold",
    color: INK,
    lineHeight: 1,
  },
  heroSub: {
    fontSize: 9.5,
    color: SLATE,
    marginTop: 2,
  },

  // ── Divider ─────────────────────────────────────────────────────────────
  divider: {
    borderBottom: 1,
    borderBottomColor: DIVIDER,
    marginTop: 12,
    marginBottom: 12,
  },

  // ── Table ───────────────────────────────────────────────────────────────
  tableHeadRow: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottom: 1.5,
    borderBottomColor: INK,
  },
  tableDataRow: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottom: 1,
    borderBottomColor: DIVIDER,
  },
  tableHeadText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
  },
  tableDataText: {
    fontSize: 9.5,
  },
  colNo: {
    flex: 0.35,
  },
  colDesc: {
    flex: 3.2,
  },
  colPrice: {
    flex: 1,
    textAlign: "right",
  },
  colQty: {
    flex: 0.7,
    textAlign: "center",
  },
  colAmount: {
    flex: 1,
    textAlign: "right",
  },

  // ── Spacer ──────────────────────────────────────────────────────────────
  spacer: {
    flex: 1,
    minHeight: 28,
  },

  // ── Bottom row ──────────────────────────────────────────────────────────
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 10,
  },
  paymentBlock: {
    flexDirection: "column",
  },
  paymentTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    marginBottom: 5,
  },
  paymentLine: {
    fontSize: 8.5,
    color: SLATE,
    marginBottom: 2,
  },
  totalBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  // Subtotal / shipping breakdown rows (only shown when shipping > 0)
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 3,
  },
  breakdownLabel: {
    fontSize: 8.5,
    color: SLATE,
    textAlign: "right",
    marginRight: 12,
    minWidth: 50,
  },
  breakdownValue: {
    fontSize: 8.5,
    color: SLATE,
    textAlign: "right",
    minWidth: 50,
    fontFamily: "Helvetica",
  },
  breakdownDivider: {
    borderBottom: 1,
    borderBottomColor: DIVIDER,
    marginTop: 4,
    marginBottom: 5,
    width: "100%",
  },
  totalLabel: {
    fontSize: 9.5,
    color: SLATE,
    textAlign: "right",
    marginBottom: 2,
  },
  totalAmount: {
    fontSize: 38,
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
    paddingVertical: 9,
    paddingHorizontal: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 40,
  },
  footerText: {
    fontSize: 8.5,
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

// ── Wavy diagonal stripes SVG ────────────────────────────────────────────────
// A4 page = 595 x 842 pt.
// Soft sinusoidal wavy lines running diagonally (bottom-left to top-right)
// at ~30° angle. Very subtle — stroke very light, low opacity.
// Each line uses quadratic bezier curves to produce a gentle wave.
function WavyStripes() {
  const W = 595;
  const H = 842;
  // Wider gap between stripes for a more open, airy look matching the target
  const STEP = 28;
  // Gentle wave amplitude — small to stay subtle
  const WAVE_AMP = 5;
  // Horizontal period of the wave
  const WAVE_LEN = 100;

  // ~28° diagonal angle
  const tanAngle = 0.53;
  const rise = H * tanAngle;
  const startX = -rise - STEP * 2;

  const paths: string[] = [];

  for (let ox = startX; ox <= W + rise + STEP; ox += STEP) {
    const segments = 16;
    const dy = H / segments;
    let d = "";

    for (let s = 0; s <= segments; s++) {
      const y = H - s * dy;
      const xBase = ox + (H - y) * tanAngle;
      const wave = WAVE_AMP * Math.sin((y / WAVE_LEN) * 2 * Math.PI);
      const x = xBase + wave;

      if (s === 0) {
        d += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
      } else {
        // Quadratic bezier control point — offset to produce smooth wave
        const cy = y + dy / 2;
        const cxBase = ox + (H - cy) * tanAngle;
        const cWave =
          WAVE_AMP * Math.sin(((cy / WAVE_LEN) * 2 * Math.PI) + Math.PI);
        const cx = cxBase + cWave;
        d += `Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} `;
      }
    }

    paths.push(d.trim());
  }

  return (
    <Svg
      fixed
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      viewBox={`0 0 ${W} ${H}`}
    >
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke="#b8bdc8"
          strokeWidth="0.6"
          fill="none"
          opacity="0.45"
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

  // Show bank block only for bank_transfer orders that have bank info
  const hasBankInfo =
    order.paymentMethod === "bank_transfer" &&
    business.bankName && business.bankAccountNumber && business.bankAccountHolder;

  // Format total without space: "RM192"  (drop decimals when .00)
  const rawTotal = typeof order.totalAmount === "string"
    ? parseFloat(order.totalAmount)
    : order.totalAmount;
  const totalFormatted = Number.isFinite(rawTotal)
    ? (rawTotal % 1 === 0 ? `RM${rawTotal.toFixed(0)}` : `RM${rawTotal.toFixed(2)}`)
    : "RM0";

  // Show breakdown only when shipping > 0
  const rawShipping = parseFloat(order.shippingCost ?? "");
  const rawSubtotal = parseFloat(order.subtotal ?? "");
  const showBreakdown =
    Number.isFinite(rawShipping) && rawShipping > 0 &&
    Number.isFinite(rawSubtotal);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Wavy stripes — rendered behind everything, fixed so no page break */}
        <WavyStripes />

        {/* White rounded body panel — sits above stripes, fixed */}
        <View fixed style={styles.bodyPanel} />

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

            {/* Bill-to / dates — right-aligned column */}
            <View style={styles.billToBlock}>
              <Text style={styles.grayLabel}>Billed To :</Text>
              <Text style={styles.boldValue}>{order.shippingName}</Text>

              <View style={styles.metaGap} />
              <Text style={styles.grayLabel}>Invoice Date :</Text>
              <Text style={styles.boldValue}>{formatInvoiceDate(createdAt)}</Text>

              <View style={styles.metaGap} />
              <Text style={styles.grayLabel}>Due Date :</Text>
              <Text style={styles.boldValueLg}>{formatInvoiceDate(dueDate)}</Text>
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

          {/* Table header */}
          <View style={styles.tableHeadRow}>
            <Text style={[styles.colNo, styles.tableHeadText]}>No</Text>
            <Text style={[styles.colDesc, styles.tableHeadText]}>Item Description</Text>
            <Text style={[styles.colPrice, styles.tableHeadText]}>Price</Text>
            <Text style={[styles.colQty, styles.tableHeadText]}>Qty</Text>
            <Text style={[styles.colAmount, styles.tableHeadText]}>Amount</Text>
          </View>

          {/* Table data rows */}
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

          {/* Flex spacer — pushes bottom row down */}
          <View style={styles.spacer} />

          {/* Bottom row: payment info (left) + total (right) */}
          <View style={styles.bottomRow}>
            {/* Payment block — only rendered for bank_transfer with bank info */}
            <View style={styles.paymentBlock}>
              {hasBankInfo ? (
                <>
                  <Text style={styles.paymentTitle}>
                    Please make payment via
                  </Text>
                  <Text style={styles.paymentLine}>
                    {"Bank Name : " + (business.bankName ?? "")}
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

            {/* Total block — breakdown only shown when shipping > 0 */}
            <View style={styles.totalBlock}>
              {showBreakdown ? (
                <>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Subtotal</Text>
                    <Text style={styles.breakdownValue}>
                      {formatMYR(rawSubtotal)}
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Shipping</Text>
                    <Text style={styles.breakdownValue}>
                      {formatMYR(rawShipping)}
                    </Text>
                  </View>
                  <View style={styles.breakdownDivider} />
                </>
              ) : null}

              <Text style={styles.totalLabel}>Total Amount Due</Text>
              <Text style={styles.totalAmount}>{totalFormatted}</Text>
            </View>
          </View>
        </View>

        {/* Footer bar — fixed so it always appears at page bottom */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{business.whatsappDisplay}</Text>
          <Text style={styles.footerText}>{business.contactEmail}</Text>
          <Text style={styles.footerText}>{business.website}</Text>
        </View>
      </Page>
    </Document>
  );
}
