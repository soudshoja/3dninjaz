/**
 * Phase 19 (19-11) — Profanity allowlist seed.
 *
 * STATUS: DEFERRED — no storage table exists yet.
 *
 * The profanity check flag (`profanityCheck: true`) is set on the "Your name"
 * text field in the keychain seed product (scripts/seed-keychain-product.ts).
 * The runtime check in src/lib/config-fields.ts reads `TextFieldConfig.profanityCheck`
 * but the ACTUAL word list is not yet persisted anywhere — Phase 19 Plan 19-02
 * implemented the flag and schema, but deferred the runtime word-list lookup to
 * a future settings UI (D-13).
 *
 * TODO (v2 — after /admin/settings gets a "Profanity words" section):
 *   - Add a `profanity_words` LONGTEXT column to `store_settings` (singleton row)
 *     OR a dedicated `profanity_list` table with a single JSON row.
 *   - Update this script to insert the starter word list below.
 *   - Update the validation logic in src/actions/configurator.ts (validateField)
 *     to fetch the list from DB and apply word-boundary regex matching.
 *
 * Conservative starter word list (safe subset — word-boundary match only):
 * fuck, shit, cunt, bitch, dick, pussy, fag, nigga, wank, twat, prick,
 * bollocks, wanker, slut, whore
 *
 * Note: "ass" deliberately excluded to avoid false positives on "Cassandra",
 * "class", "mass" etc. Use word-boundary regex (\bword\b) when implementing.
 *
 * Run: dotenv -e .env.local -- npx tsx scripts/seed-profanity.ts
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import "dotenv/config";

console.log(
  "[seed-profanity] DEFERRED: no profanity storage table exists yet.",
);
console.log(
  "[seed-profanity] The profanityCheck flag is seeded on config fields but word-list lookup is not yet implemented.",
);
console.log(
  "[seed-profanity] See TODO comment in this file for v2 implementation plan.",
);
console.log(
  "[seed-profanity] Tracked in SUMMARY.md under Known Stubs / Deferred Items.",
);
process.exit(0);
