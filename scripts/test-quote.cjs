#!/usr/bin/env node
// Diagnostic: run quoteForCart against live data with a fake cart line.
// Usage on server: node scripts/test-quote.cjs <variant_id>
// Prints the full QuoteResult or error, plus which ladder weight was used.

require("dotenv").config({ path: ".env.local" });

const { execSync } = require("child_process");
const variantId = process.argv[2];
if (!variantId) {
  console.error("usage: node scripts/test-quote.cjs <variant_id>");
  process.exit(1);
}

(async () => {
  // Import built server bundle's action — we have to use esbuild on the fly.
  // Simpler: inline the Delyva call with our real config.
  const mysql = require("mysql2/promise");
  const url = new URL(process.env.DATABASE_URL);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  });

  const [[cfg]] = await conn.query("SELECT * FROM shipping_config WHERE id='default'");
  const [[v]] = await conn.query("SELECT id, product_id, weight_g FROM product_variants WHERE id=?", [variantId]);
  if (!v) { console.error("variant not found"); process.exit(1); }
  const [[p]] = await conn.query("SELECT id, slug, shipping_weight_kg FROM products WHERE id=?", [v.product_id]);
  console.log("[diagnostic] variant:", v);
  console.log("[diagnostic] product:", p);
  console.log("[diagnostic] default_item_type:", cfg.default_item_type);

  const weightKg = v.weight_g ? v.weight_g / 1000 : (p.shipping_weight_kg ? Number(p.shipping_weight_kg) : Number(cfg.default_weight_kg));
  console.log("[diagnostic] resolved weightKg:", weightKg);

  const itemType = cfg.default_item_type === "PACKAGE" ? "PARCEL" : cfg.default_item_type;
  const body = {
    origin: {
      address1: cfg.origin_address1, city: cfg.origin_city,
      state: cfg.origin_state, postcode: cfg.origin_postcode, country: "MY",
    },
    destination: {
      address1: "Test Road", city: "Kuala Lumpur", state: "WP Kuala Lumpur",
      postcode: "50000", country: "MY",
    },
    weight: { unit: "kg", value: weightKg },
    itemType,
  };

  const res = await fetch(`${process.env.DELYVA_BASE_URL || "https://api.delyva.app/v1.0"}/service/instantQuote`, {
    method: "POST",
    headers: {
      "X-Delyvax-Access-Token": process.env.DELYVA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log("[diagnostic] delyva http status:", res.status);
  const services = json?.data?.services || [];
  console.log("[diagnostic] service count:", services.length);
  const codes = services.map(s => s?.service?.code || s?.serviceCompany?.companyCode).filter(Boolean);
  console.log("[diagnostic] service codes:", codes);

  const [enabled] = await conn.query("SELECT service_code, company_code FROM shipping_service_catalog WHERE is_enabled=1");
  console.log("[diagnostic] enabled serviceCodes:", enabled.map(e => e.service_code));
  const enabledSC = new Set(enabled.map(e => e.service_code));
  const enabledCC = new Set(enabled.map(e => e.company_code).filter(Boolean));
  const filtered = services.filter(s => {
    const code = s?.service?.code;
    const cc = s?.serviceCompany?.companyCode || (typeof s?.companyCode === "string" ? s.companyCode : s?.companyCode?.code);
    return (code && enabledSC.has(code)) || (cc && enabledCC.has(cc));
  });
  console.log("[diagnostic] filtered count:", filtered.length);
  if (filtered.length === 0) {
    console.log("[diagnostic] *** NO SERVICES AFTER FILTER *** this is the bug");
    console.log("[diagnostic] first service raw:", JSON.stringify(services[0], null, 2).slice(0, 1000));
  }
  await conn.end();
})().catch(e => { console.error("fail:", e); process.exit(1); });
