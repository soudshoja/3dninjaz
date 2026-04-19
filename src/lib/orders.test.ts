import { test } from "node:test";
import { strict as assert } from "node:assert";
// Explicit .ts extension required by `node --experimental-strip-types`.
// Test files are excluded from the Next.js / tsc --noEmit build via
// tsconfig.json -> exclude, so this import doesn't trip allowImportingTsExtensions.
import {
  assertValidTransition,
  nextAllowedStatuses,
  formatOrderNumber,
} from "./orders.ts";

test("pending -> paid is valid", () => {
  assert.doesNotThrow(() => assertValidTransition("pending", "paid"));
});

test("pending -> cancelled is valid", () => {
  assert.doesNotThrow(() => assertValidTransition("pending", "cancelled"));
});

test("paid -> processing is valid", () => {
  assert.doesNotThrow(() => assertValidTransition("paid", "processing"));
});

test("processing -> shipped is valid", () => {
  assert.doesNotThrow(() => assertValidTransition("processing", "shipped"));
});

test("shipped -> delivered is valid", () => {
  assert.doesNotThrow(() => assertValidTransition("shipped", "delivered"));
});

test("delivered is terminal", () => {
  assert.throws(
    () => assertValidTransition("delivered", "cancelled"),
    /Invalid status transition/,
  );
  assert.throws(
    () => assertValidTransition("delivered", "shipped"),
    /Invalid status transition/,
  );
});

test("cancelled is terminal", () => {
  assert.throws(
    () => assertValidTransition("cancelled", "paid"),
    /Invalid status transition/,
  );
});

test("pending -> delivered is not allowed (skipping states)", () => {
  assert.throws(
    () => assertValidTransition("pending", "delivered"),
    /Invalid status transition/,
  );
});

test("paid -> pending is not allowed (backwards)", () => {
  assert.throws(
    () => assertValidTransition("paid", "pending"),
    /Invalid status transition/,
  );
});

test("nextAllowedStatuses('pending') returns ['paid', 'cancelled']", () => {
  assert.deepEqual(nextAllowedStatuses("pending"), ["paid", "cancelled"]);
});

test("nextAllowedStatuses('delivered') returns []", () => {
  assert.deepEqual(nextAllowedStatuses("delivered"), []);
});

test("formatOrderNumber returns PN-<last 8 hex uppercased without dashes>", () => {
  // UUID "7f3a2b91-1234-5678-9abc-def012345678"
  // Strip dashes -> "7f3a2b9112345678 9abcdef012345678"
  // Last 8 hex chars -> "12345678"
  // Uppercase -> "12345678"
  // Final -> "PN-12345678"
  assert.equal(
    formatOrderNumber("7f3a2b91-1234-5678-9abc-def012345678"),
    "PN-12345678",
  );
});
