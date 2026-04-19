import { test } from "node:test";
import { strict as assert } from "node:assert";
import { useCartStore } from "./cart-store.ts";

function reset() {
  useCartStore.getState().clear();
}

const P1M = {
  productId: "p1",
  productSlug: "p1-slug",
  name: "Shuriken Keychain",
  image: "/uploads/products/p1/a.jpg",
  size: "M" as const,
  variantId: "v1",
  unitPrice: "25.00",
};
const P1L = {
  ...P1M,
  size: "L" as const,
  variantId: "v2",
  unitPrice: "35.00",
};

test("initial state is empty and drawer closed", () => {
  reset();
  const s = useCartStore.getState();
  assert.deepEqual(s.items, []);
  assert.equal(s.isDrawerOpen, false);
});

test("addItem into empty cart creates quantity 1 line", () => {
  reset();
  useCartStore.getState().addItem(P1M);
  const s = useCartStore.getState();
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].quantity, 1);
});

test("addItem twice with same productId+size increments", () => {
  reset();
  const { addItem } = useCartStore.getState();
  addItem(P1M);
  addItem(P1M);
  const s = useCartStore.getState();
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].quantity, 2);
});

test("addItem with different size creates a second line", () => {
  reset();
  const { addItem } = useCartStore.getState();
  addItem(P1M);
  addItem(P1L);
  const s = useCartStore.getState();
  assert.equal(s.items.length, 2);
});

test("incrementItem / decrementItem adjust quantity; decrement at 1 removes line", () => {
  reset();
  const { addItem, incrementItem, decrementItem } = useCartStore.getState();
  addItem(P1M);
  incrementItem("p1::M");
  assert.equal(useCartStore.getState().items[0].quantity, 2);
  decrementItem("p1::M");
  assert.equal(useCartStore.getState().items[0].quantity, 1);
  decrementItem("p1::M");
  assert.equal(useCartStore.getState().items.length, 0);
});

test("removeItem deletes the line", () => {
  reset();
  const { addItem, removeItem } = useCartStore.getState();
  addItem(P1M);
  addItem(P1L);
  removeItem("p1::M");
  const items = useCartStore.getState().items;
  assert.equal(items.length, 1);
  assert.equal(items[0].size, "L");
});

test("getSubtotal sums unitPrice × quantity", () => {
  reset();
  const { addItem, incrementItem } = useCartStore.getState();
  addItem(P1M);
  incrementItem("p1::M"); // 2 x 25.00
  addItem(P1L); // 1 x 35.00
  assert.equal(useCartStore.getState().getSubtotal(), 85);
});

test("getItemCount sums quantities", () => {
  reset();
  const { addItem, incrementItem } = useCartStore.getState();
  addItem(P1M);
  incrementItem("p1::M");
  addItem(P1L);
  assert.equal(useCartStore.getState().getItemCount(), 3);
});

test("clear empties items and closes drawer", () => {
  reset();
  const { addItem, setDrawerOpen, clear } = useCartStore.getState();
  addItem(P1M);
  setDrawerOpen(true);
  clear();
  const s = useCartStore.getState();
  assert.equal(s.items.length, 0);
  assert.equal(s.isDrawerOpen, false);
});

test("line key is stable under productId::size", () => {
  reset();
  useCartStore.getState().addItem(P1M);
  assert.equal(useCartStore.getState().items[0].key, "p1::M");
});
