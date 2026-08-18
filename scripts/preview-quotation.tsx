/* eslint-disable no-console */
/**
 * Design preview for the quotation PDF (2026-08-18).
 *
 * Renders NinjazQuotationDocument with the Jo Malone #0023 figures so the
 * output can be compared side by side with templates/qutation.pdf. Pure
 * design tooling: it touches no database and is not part of the app runtime.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.preview.json scripts/preview-quotation.tsx [outPath]
 * Default output: .planning/preview-quotation.pdf (gitignored planning dir)
 */
import fs from "node:fs";
import path from "node:path";
import ReactPDF from "@react-pdf/renderer";
import {
  NinjazQuotationDocument,
  type QuotationDoc,
} from "../src/lib/pdf/quotation-branded";

function readLogoBase64(): string | null {
  try {
    const p = path.join(process.cwd(), "public", "logo.png");
    if (!fs.existsSync(p)) return null;
    return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch {
    return null;
  }
}

const sample: QuotationDoc = {
  quoteNo: "#0023",
  date: "10/08/2026",
  validUntil: "17/08/2026",
  customerId: "2484",
  leadTime: "4 weeks (30 Days)",

  contactName: "Khai Wong",
  companyName: "JO Malone London",
  contactPhone: "016-378 8304 / 012-340 4588",

  projectDescription:
    "Each participant will create a personalised keychain Cord featuring 3 alphabet letter and 3 sea-themed charms of their choice. A selection of 3 to 5 custom designed charms will be provided for participants to choose from.",

  items: [
    { description: "Alphabet Letters", qty: "4500", unitPrice: "", lineTotal: "", ruled: false },
    { description: "Custom Designed Charms", qty: "4500", unitPrice: "", lineTotal: "", ruled: false },
    { description: "Keychain Cord", qty: "1500", unitPrice: "", lineTotal: "" },
    { description: "Price Per Keychain with Letter & Charms", qty: "1", unitPrice: "RM8", lineTotal: "" },
    { description: "Per keychain Cord + 3 Letter + 3 Charms", qty: "1500", unitPrice: "RM8", lineTotal: "RM12,000" },
  ],
  subtotal: "RM12,000",
  total: "RM12,000",

  terms: [
    "50% down payment is required to confirm the order and commence production.",
    "The down payment is non-refundable once production has started.",
    "the remaining 50% balance must be settled prior to shipment or delivery.",
    "Production lead time will be confirmed upon receipt of the down payment and final approval.",
    "This quotation is valid until August 17th, 2026.",
    "Production lead time is approximately 4 weeks and will commence upon receipt of the 50% down payment and final approval of all order details.",
  ],
  bank: {
    holder: "CITY COMMERCE SDN. BHD.",
    accountNumber: "8606088600",
    bankName: "CIMB",
  },
  business: {
    wordmark: "3DNINJAZ",
    entity: "CITY COMMERCE SND. BHD - (1608815-U)",
    contactEmail: "info@3dninjaz.com",
    logoBase64: readLogoBase64(),
  },
};

async function main() {
  const out = process.argv[2] || path.join(".planning", "preview-quotation.pdf");
  fs.mkdirSync(path.dirname(out), { recursive: true });

  // Same call shape as src/lib/pdf/render-invoice.tsx. ReactPDF.render() with
  // a createElement root fails here with "Cannot read properties of null".
  const stream = await ReactPDF.renderToStream(
    <NinjazQuotationDocument doc={sample} />,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  fs.writeFileSync(out, Buffer.concat(chunks));
  console.log(`[preview] wrote ${out}`);
}

main().catch((err) => {
  console.error("[preview] FAILED:", err);
  process.exit(1);
});
