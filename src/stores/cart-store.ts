/**
 * Phase 16 cart store v2 — extended in Phase 19 (19-08) for configurable products.
 *
 * Key changes from v1:
 *   - localStorage key bumped to `print-ninjaz-cart-v2` (auto-clears v1 carts)
 *   - CartItem stores variantId + quantity only (no size, no unitPrice, no image)
 *   - Hydration of display fields (label, price, image) deferred to server at
 *     render time — cart-drawer.tsx and /bag use hydrateCartItems server action
 *   - addItem accepts { variantId, quantity } — legacy callers that pass
 *     { productId, size, ... } are shimmed via legacyAddItem (logs dev warning)
 *   - Persisted shape: only items (variantId + quantity) — lean localStorage
 *
 * v1 cart migration: cart-drawer + bag page read v1 key on first mount,
 * migrate each item to v2 shape (variantId is already stored in v1 items),
 * then delete v1 key. If any item fails to map it is silently dropped.
 *
 * Phase 19 (19-08):
 *   - CartItem is now a discriminated union of StockedCartItem | ConfigurableCartItem
 *   - addItem dispatches on the input shape — stocked path UNCHANGED (byte-identical)
 *   - Version bumped to 3 with no-op migration to silence persist runtime warning
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { hashConfigurationData } from "@/lib/config-hash";
import type { ConfigurationData } from "@/lib/config-fields";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lean persisted cart item — stocked product (variantId + quantity) */
export type StockedCartItem = {
  /** Stable key for React lists: variantId */
  key: string;
  variantId: string;
  quantity: number;
};

/** Configurable product cart item — productId + configurationData snapshot */
export type ConfigurableCartItem = {
  /** Stable key: `${productId}::${configHash}` (deterministic) */
  key: string;
  productId: string;
  configurationData: ConfigurationData;
  quantity: number;
  // No variantId — configurable products have no variant
};

/** Union of the two cart item shapes */
export type CartItem = StockedCartItem | ConfigurableCartItem;

/** Type-guard: true when the item is a configurable (made-to-order) line */
export function isConfigurableCartItem(i: CartItem): i is ConfigurableCartItem {
  return "configurationData" in i;
}

/** Display-ready item hydrated server-side (returned from hydrateCartItems) */
export type HydratedCartItem = {
  variantId: string;
  quantity: number;
  productId: string;
  productSlug: string;
  productName: string;
  productImage: string | null;
  variantLabel: string;
  unitPrice: string;
  inStock: boolean;
  available: boolean;
};

type AddItemInput =
  | { variantId: string; quantity?: number }                                          // existing — UNCHANGED
  | { productId: string; configurationData: ConfigurationData; quantity?: number };   // NEW (Phase 19)

type CartState = {
  items: CartItem[];
  isDrawerOpen: boolean;
  addItem: (item: AddItemInput) => void;
  incrementItem: (key: string) => void;
  decrementItem: (key: string) => void;
  removeItem: (key: string) => void;
  setDrawerOpen: (open: boolean) => void;
  clear: () => void;
  getItemCount: () => number;
};

/** Soft cap per line — D2-20 */
const MAX_PER_LINE = 10;

const isBrowser = typeof window !== "undefined";

const noopStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isDrawerOpen: false,

      addItem: (input: AddItemInput) => {
        if ("productId" in input && "configurationData" in input) {
          // CONFIGURABLE path — Phase 19 NEW
          const { productId, configurationData, quantity = 1 } = input;
          const hash = hashConfigurationData(configurationData);
          const key = `${productId}::${hash}`;
          const existing = get().items.find((i) => i.key === key);
          if (existing) {
            set({
              items: get().items.map((i) =>
                i.key === key
                  ? { ...i, quantity: Math.min(i.quantity + quantity, MAX_PER_LINE) }
                  : i,
              ),
            });
            return;
          }
          set({
            items: [
              ...get().items,
              {
                key,
                productId,
                configurationData,
                quantity: Math.min(quantity, MAX_PER_LINE),
              } as ConfigurableCartItem,
            ],
          });
          return;
        }

        // STOCKED path — UNCHANGED (byte-identical to Phase 16 original)
        const { variantId, quantity = 1 } = input as { variantId: string; quantity?: number };
        const key = variantId;
        const existing = get().items.find((i) => i.key === key);
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.key === key
                ? { ...i, quantity: Math.min(i.quantity + quantity, MAX_PER_LINE) }
                : i,
            ),
          });
          return;
        }
        set({
          items: [
            ...get().items,
            { key, variantId, quantity: Math.min(quantity, MAX_PER_LINE) },
          ],
        });
      },

      incrementItem: (key) =>
        set({
          items: get().items.map((i) =>
            i.key === key
              ? { ...i, quantity: Math.min(i.quantity + 1, MAX_PER_LINE) }
              : i,
          ),
        }),

      decrementItem: (key) => {
        const current = get().items.find((i) => i.key === key);
        if (!current) return;
        if (current.quantity <= 1) {
          set({ items: get().items.filter((i) => i.key !== key) });
          return;
        }
        set({
          items: get().items.map((i) =>
            i.key === key ? { ...i, quantity: i.quantity - 1 } : i,
          ),
        });
      },

      removeItem: (key) =>
        set({ items: get().items.filter((i) => i.key !== key) }),

      setDrawerOpen: (open) => set({ isDrawerOpen: open }),

      clear: () => set({ items: [], isDrawerOpen: false }),

      getItemCount: () =>
        get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "print-ninjaz-cart-v2", // Phase 16 key bump — auto-clears v1 carts
      storage: createJSONStorage(() =>
        isBrowser ? localStorage : noopStorage,
      ),
      version: 3, // Phase 19: bumped from 2 to accommodate ConfigurableCartItem shape
      migrate: (persisted, version) => {
        // v2 → v3: no structural change — ConfigurableCartItem is a new additive
        // shape; existing v2 stocked items remain valid as-is.
        void version;
        return persisted as { items: CartItem[] };
      },
      partialize: (state) => ({ items: state.items }),
      // On rehydrate, migrate v1 carts transparently
      onRehydrateStorage: () => (state) => {
        if (!isBrowser || !state) return;
        // Check for v1 key and migrate
        try {
          const v1Raw = localStorage.getItem("print-ninjaz-cart-v1");
          if (!v1Raw) return;
          const v1 = JSON.parse(v1Raw) as { state?: { items?: { variantId: string; quantity: number }[] } };
          const v1Items = v1?.state?.items ?? [];
          if (v1Items.length > 0) {
            // Migrate: each v1 item has variantId already — map directly
            const migratedItems: StockedCartItem[] = v1Items
              .filter((i) => i.variantId)
              .map((i) => ({
                key: i.variantId,
                variantId: i.variantId,
                quantity: i.quantity ?? 1,
              }));
            if (migratedItems.length > 0) {
              state.items = migratedItems;
            }
          }
          localStorage.removeItem("print-ninjaz-cart-v1");
          if (process.env.NODE_ENV === "development") {
            console.info("[cart] migrated v1 cart to v2", v1Items.length, "items");
          }
        } catch {
          // Migration failure must never break the cart
        }
      },
    },
  ),
);
