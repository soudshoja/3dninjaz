import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

/**
 * Quotation PDF for 3D Ninjaz (2026-08-18).
 *
 * Sibling of invoice-branded.tsx, NOT a replacement for it. The quotation is
 * the first document a client receives and carries the payment terms; the
 * invoice is sent afterwards, unchanged, once payment is marked.
 *
 * The layout reproduces the client's existing quotation (templates/qutation.pdf,
 * Jo Malone #0023), which was reviewed and approved before this was written:
 *   - logo top-left, wordmark + registered entity in bold beneath it
 *   - large bold right-aligned document title
 *   - solid black separator bar under the header block
 *   - rule-separated item table: Package Inclusion | Qty | Unit Price | Total RM
 *   - TOTAL reversed out of a solid black box
 *   - thick black rule above an italic footer
 *   - italic contact block left, acceptance + signature block right
 *   - page 2: TERMS & CONDITIONS, bulleted payment terms, bank block
 *
 * react-pdf v4 constraints (same as the invoice):
 *   - No Intl, no window, no DOM. All formatting is pure TS.
 *   - No CSS grid. Flexbox only.
 *   - Fonts limited to the built-ins: Helvetica, Helvetica-Bold,
 *     Helvetica-Oblique, Helvetica-BoldOblique.
 *   - Lengths are points. A4 is 595.28 x 841.89pt.
 *
 * Presentational only: it receives a fully-resolved object and reads nothing
 * from the database, exactly like invoice-branded.tsx.
 */

export type QuotationLine = {
  description: string;
  /** Rendered as typed. Blank cells are meaningful on this document. */
  qty: string;
  unitPrice: string;
  lineTotal: string;
  /** Horizontal rule under the row. Defaults to true. */
  ruled?: boolean;
};

export type QuotationBusiness = {
  /** "3DNINJAZ" */
  wordmark: string;
  /** "CITY COMMERCE SND. BHD - (1608815-U)" */
  entity: string;
  contactEmail: string;
  logoBase64: string | null;
};

export type QuotationBank = {
  holder: string;
  accountNumber: string;
  bankName: string;
};

export type QuotationDoc = {
  /** Preformatted, e.g. "#0024". */
  quoteNo: string;
  /** Preformatted dates, e.g. "10/08/2026". */
  date: string;
  validUntil: string;
  customerId: string;
  leadTime: string;

  contactName: string;
  companyName: string | null;
  contactPhone: string | null;

  projectDescription: string | null;
  items: QuotationLine[];
  /** Preformatted money, e.g. "RM12,000". */
  subtotal: string;
  total: string;

  terms: string[];
  bank: QuotationBank | null;
  business: QuotationBusiness;
};

const INK = "#000000";
const MUTED = "#555555";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    paddingTop: 34,
    paddingBottom: 34,
    paddingHorizontal: 42,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.45,
    color: INK,
  },
  // Fills the page so the footer can pin to the bottom edge, matching the
  // source document where the signature block always sits on the last line.
  body: { flexGrow: 1 },

  // ── Header ──────────────────────────────────────────────────────────────
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 96, height: 96, objectFit: "contain", marginLeft: -6, marginBottom: 4 },
  wordmark: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  entity: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 1 },
  docTitle: { fontFamily: "Helvetica-Bold", fontSize: 22, textAlign: "right", marginTop: 22 },

  // ── Meta ────────────────────────────────────────────────────────────────
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  metaCol: { flexDirection: "column" },
  metaColRight: { flexDirection: "column", width: 230 },
  metaLine: { marginBottom: 4 },
  client: { marginTop: 10 },
  clientLine: { marginBottom: 3 },

  // ── Black separator bar ─────────────────────────────────────────────────
  bar: { height: 14, backgroundColor: INK, marginTop: 16, marginBottom: 14 },

  // ── Description ─────────────────────────────────────────────────────────
  descRow: { flexDirection: "row" },
  descLabel: { fontFamily: "Helvetica-Bold", width: 148, paddingRight: 12 },
  descText: { flex: 1 },

  // ── Items table ─────────────────────────────────────────────────────────
  table: { marginTop: 12 },
  theadRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 8,
  },
  row: { flexDirection: "row", paddingVertical: 8 },
  rowRuled: { borderBottomWidth: 1, borderBottomColor: INK },
  cDesc: { flex: 1, paddingLeft: 8 },
  cQty: { width: 70, textAlign: "right" },
  cUnit: { width: 90, textAlign: "right" },
  cAmt: { width: 100, textAlign: "right" },
  thText: { fontFamily: "Helvetica-Bold" },

  // ── Totals ──────────────────────────────────────────────────────────────
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totals: { width: 260 },
  totalsRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  totalsLabel: { fontFamily: "Helvetica-Bold", flex: 1 },
  subValue: { width: 150, textAlign: "right", color: MUTED },
  grandBox: {
    width: 150,
    backgroundColor: INK,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  ruleHeavy: { height: 4.5, backgroundColor: INK, marginTop: 11 },

  // ── Footer ──────────────────────────────────────────────────────────────
  foot: { flexDirection: "row", marginTop: 10 },
  footLeft: { flex: 1, paddingRight: 28 },
  footItalic: { fontFamily: "Helvetica-Oblique" },
  footBoldItalic: { fontFamily: "Helvetica-BoldOblique" },
  thanks: { fontFamily: "Helvetica-Bold", marginTop: 12 },
  footRight: { width: 220, alignItems: "center" },
  ask: { textAlign: "center" },
  sigLine: {
    borderBottomWidth: 1,
    borderBottomColor: INK,
    width: "100%",
    height: 26,
  },
  sigCap: { fontFamily: "Helvetica-Oblique", fontSize: 10, marginTop: 4, textAlign: "center" },

  // ── Terms ───────────────────────────────────────────────────────────────
  termsHead: { fontFamily: "Helvetica-Bold", marginBottom: 17 },
  termRow: { flexDirection: "row", marginBottom: 12, paddingRight: 150 },
  termBullet: { width: 14, paddingLeft: 4 },
  termText: { flex: 1 },
  bank: { marginTop: 24, paddingLeft: 6 },
  bankLine: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginBottom: 3 },
});

function Header({
  business,
  title,
}: {
  business: QuotationBusiness;
  title: string;
}) {
  return (
    <View style={styles.head}>
      <View>
        {business.logoBase64 ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image style={styles.logo} src={business.logoBase64} />
        ) : null}
        <Text style={styles.wordmark}>{business.wordmark}</Text>
        <Text style={styles.entity}>{business.entity}</Text>
      </View>
      <Text style={styles.docTitle}>{title}</Text>
    </View>
  );
}

function Footer({ business }: { business: QuotationBusiness }) {
  return (
    <View style={styles.foot}>
      <View style={styles.footLeft}>
        <Text style={styles.footItalic}>
          If you have any questions concerning this quotation, please contact{" "}
          <Text style={styles.footBoldItalic}>{business.wordmark}</Text> at{" "}
          {business.contactEmail}
        </Text>
        <Text style={styles.thanks}>Thank you for your business!</Text>
      </View>
      <View style={styles.footRight}>
        <Text style={styles.ask}>Please confirm your</Text>
        <Text style={styles.ask}>acceptance of this quote:</Text>
        <View style={styles.sigLine} />
        <Text style={styles.sigCap}>Signature over printed name and date</Text>
      </View>
    </View>
  );
}

export function NinjazQuotationDocument({ doc }: { doc: QuotationDoc }) {
  const { business } = doc;

  return (
    <Document
      title={`Quotation ${doc.quoteNo}`}
      author={business.wordmark}
      subject="Quotation"
    >
      {/* ── Sheet 1: the quotation ─────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.body}>
          <Header business={business} title="QUOTATION" />

          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLine}>Quotation No: {doc.quoteNo}</Text>
              <Text style={styles.metaLine}>Customer ID:{doc.customerId}</Text>
            </View>
            <View style={styles.metaColRight}>
              <Text style={styles.metaLine}>Date: {doc.date}</Text>
              <Text style={styles.metaLine}>Valid Until: {doc.validUntil}</Text>
              <Text style={styles.metaLine}>Production lead time: {doc.leadTime}</Text>
            </View>
          </View>

          <View style={styles.client}>
            <Text style={styles.clientLine}>{doc.contactName}</Text>
            {doc.companyName ? (
              <Text style={styles.clientLine}>{doc.companyName}</Text>
            ) : null}
            {doc.contactPhone ? (
              <Text style={styles.clientLine}>{doc.contactPhone}</Text>
            ) : null}
          </View>

          <View style={styles.bar} />

          {doc.projectDescription ? (
            <View style={styles.descRow}>
              <Text style={styles.descLabel}>Project Description</Text>
              <Text style={styles.descText}>{doc.projectDescription}</Text>
            </View>
          ) : null}

          <View style={styles.table}>
            <View style={styles.theadRow}>
              <Text style={[styles.cDesc, styles.thText]}>Package Inclusion</Text>
              <Text style={[styles.cQty, styles.thText]}>Qty</Text>
              <Text style={[styles.cUnit, styles.thText]}>Unit Price</Text>
              <Text style={[styles.cAmt, styles.thText]}>Total RM</Text>
            </View>

            {doc.items.map((item, i) => (
              <View
                key={i}
                style={
                  item.ruled === false ? styles.row : [styles.row, styles.rowRuled]
                }
                wrap={false}
              >
                <Text style={styles.cDesc}>{item.description}</Text>
                <Text style={styles.cQty}>{item.qty}</Text>
                <Text style={styles.cUnit}>{item.unitPrice}</Text>
                <Text style={styles.cAmt}>{item.lineTotal}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsWrap}>
            <View style={styles.totals}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Subtotal</Text>
                <Text style={styles.subValue}>{doc.subtotal}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Total</Text>
                <Text style={styles.grandBox}>{doc.total}</Text>
              </View>
            </View>
          </View>

          <View style={styles.ruleHeavy} />
        </View>

        <Footer business={business} />
      </Page>

      {/* ── Sheet 2: terms ─────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.body}>
          <Header business={business} title="TERMS &amp; CONDITIONS" />

          <View style={styles.metaRow}>
            <View style={styles.metaCol} />
            <View style={styles.metaColRight}>
              <Text style={styles.metaLine}>Date: {doc.date}</Text>
              <Text style={[styles.metaLine, styles.thText]}>
                Valid Until: {doc.validUntil}
              </Text>
            </View>
          </View>

          <View style={styles.bar} />

          <Text style={styles.termsHead}>Payment Terms &amp; Conditions</Text>
          {doc.terms.map((t, i) => (
            <View key={i} style={styles.termRow} wrap={false}>
              <Text style={styles.termBullet}>&bull;</Text>
              <Text style={styles.termText}>{t}</Text>
            </View>
          ))}

          {doc.bank ? (
            <View style={styles.bank}>
              <Text style={styles.bankLine}>{doc.bank.holder}</Text>
              <Text style={styles.bankLine}>
                Account Number: {doc.bank.accountNumber}
              </Text>
              <Text style={styles.bankLine}>Bank name: {doc.bank.bankName}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.ruleHeavy} />
        <Footer business={business} />
      </Page>
    </Document>
  );
}
