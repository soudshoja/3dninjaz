import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { formatOrderNumber } from "@/lib/orders";

/**
 * Phase 6 06-06 — invoice PDF document.
 * Pure React-PDF — no headless browser, no Puppeteer. Runs cleanly under
 * cPanel Node. Text nodes are auto-escaped by react-pdf so no template-
 * string injection sink is exposed (T-06-06-PDF-injection).
 */

const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: "#ffffff",
    color: BRAND.ink,
    fontSize: 11,
    fontFamily: "Helvetica",
  },
  heading: { fontSize: 22, marginBottom: 4 },
  subhead: { fontSize: 13, marginBottom: 12, color: "#475569" },
  sectionTitle: {
    fontSize: 12,
    marginBottom: 6,
    marginTop: 18,
    color: BRAND.ink,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: { color: "#475569" },
  tableHead: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottom: 1,
    borderBottomColor: "#e2e8f0",
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottom: 1,
    borderBottomColor: "#f1f5f9",
  },
  col1: { flex: 3 },
  col2: { flex: 1, textAlign: "center" },
  col3: { flex: 1, textAlign: "center" },
  col4: { flex: 1, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTop: 1,
    borderTopColor: "#e2e8f0",
    marginTop: 6,
    fontSize: 13,
  },
  watermark: {
    position: "absolute",
    top: 260,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 72,
    color: "rgba(220, 38, 38, 0.18)",
    transform: "rotate(-20deg)",
  },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    paddingTop: 10,
    borderTop: 1,
    borderTopColor: "#e2e8f0",
    color: "#64748b",
    fontSize: 9,
  },
});

export type InvoiceOrder = {
  id: string;
  status: string;
  createdAt: Date;
  currency: string;
  customerEmail: string;
  shippingName: string;
  shippingPhone: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPostcode: string;
  shippingCountry: string;
  subtotal: string;
  shippingCost: string;
  totalAmount: string;
  items: Array<{
    id: string;
    productName: string;
    size: string | null;
    variantLabel?: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
};

export type InvoiceBusiness = {
  businessName: string;
  contactEmail: string;
  whatsappDisplay: string;
  pdpaLine: string;
};

export function InvoiceDocument({
  order,
  business,
}: {
  order: InvoiceOrder;
  business: InvoiceBusiness;
}) {
  const isCancelled = order.status === "cancelled";
  const paid = order.status !== "pending" && order.status !== "cancelled";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isCancelled ? (
          <Text style={styles.watermark}>CANCELLED</Text>
        ) : null}

        <Text style={styles.heading}>{business.businessName}</Text>
        <Text style={styles.subhead}>
          Invoice {formatOrderNumber(order.id)}
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Order placed</Text>
          <Text>{new Date(order.createdAt).toLocaleDateString("en-MY")}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text>{order.status.toUpperCase()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Payment</Text>
          <Text>{paid ? "Paid via PayPal" : "Unpaid"}</Text>
        </View>

        <Text style={styles.sectionTitle}>Ship to</Text>
        <Text>{order.shippingName}</Text>
        <Text>{order.shippingLine1}</Text>
        {order.shippingLine2 ? <Text>{order.shippingLine2}</Text> : null}
        <Text>
          {order.shippingCity} {order.shippingPostcode}
        </Text>
        <Text>
          {order.shippingState}, {order.shippingCountry}
        </Text>
        <Text>{order.shippingPhone}</Text>
        <Text style={styles.label}>Email: {order.customerEmail}</Text>

        <Text style={styles.sectionTitle}>Items</Text>
        <View style={styles.tableHead}>
          <Text style={styles.col1}>Product</Text>
          <Text style={styles.col2}>Variant</Text>
          <Text style={styles.col3}>Qty</Text>
          <Text style={styles.col4}>Line total</Text>
        </View>
        {order.items.map((i) => (
          <View key={i.id} style={styles.tableRow}>
            <Text style={styles.col1}>{i.productName}</Text>
            <Text style={styles.col2}>{i.variantLabel ?? (i.size ? `Size ${i.size}` : "—")}</Text>
            <Text style={styles.col3}>{String(i.quantity)}</Text>
            <Text style={styles.col4}>{formatMYR(i.lineTotal)}</Text>
          </View>
        ))}

        <View style={{ marginTop: 12 }}>
          <View style={styles.row}>
            <Text style={styles.label}>Subtotal</Text>
            <Text>{formatMYR(order.subtotal)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Shipping</Text>
            <Text>{formatMYR(order.shippingCost)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Total</Text>
            <Text>
              {formatMYR(order.totalAmount)} {order.currency}
            </Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {business.businessName} · {business.contactEmail} · WhatsApp{" "}
            {business.whatsappDisplay}
          </Text>
          <Text>{business.pdpaLine}</Text>
        </View>
      </Page>
    </Document>
  );
}
