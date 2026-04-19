import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Size = "S" | "M" | "L";

export type CartItem = {
  /** `${productId}::${size}` — stable across sessions */
  key: string;
  productId: string;
  productSlug: string;
  name: string;
  /** Relative /uploads/... path. Null when the product has no image. */
  image: string | null;
  size: Size;
  variantId: string;
  /** Drizzle decimal returned by mysql2 as a string — preserved verbatim so
   * the checkout step in Phase 3 can re-resolve variant authority. */
  unitPrice: string;
  quantity: number;
};

type AddItemInput = Omit<CartItem, "key" | "quantity">;

type CartState = {
  items: CartItem[];
  isDrawerOpen: boolean;
  addItem: (item: AddItemInput) => void;
  incrementItem: (key: string) => void;
  decrementItem: (key: string) => void;
  removeItem: (key: string) => void;
  setDrawerOpen: (open: boolean) => void;
  clear: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
};

const lineKey = (productId: string, size: Size) => `${productId}::${size}`;
/** Soft cap per line — D2-20. Prevents fat-finger input; checkout in Phase 3
 *  is the real inventory guard. */
const MAX_PER_LINE = 10;

const isBrowser = typeof window !== "undefined";

/** Dummy storage used on the server so `persist` doesn't crash during SSR
 *  or when the store is imported in a node:test context. */
const noopStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isDrawerOpen: false,

      addItem: (item) => {
        const key = lineKey(item.productId, item.size);
        const existing = get().items.find((i) => i.key === key);
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.key === key
                ? { ...i, quantity: Math.min(i.quantity + 1, MAX_PER_LINE) }
                : i
            ),
          });
          return;
        }
        set({ items: [...get().items, { ...item, key, quantity: 1 }] });
      },

      incrementItem: (key) =>
        set({
          items: get().items.map((i) =>
            i.key === key
              ? { ...i, quantity: Math.min(i.quantity + 1, MAX_PER_LINE) }
              : i
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
            i.key === key ? { ...i, quantity: i.quantity - 1 } : i
          ),
        });
      },

      removeItem: (key) =>
        set({ items: get().items.filter((i) => i.key !== key) }),

      setDrawerOpen: (open) => set({ isDrawerOpen: open }),

      clear: () => set({ items: [], isDrawerOpen: false }),

      getSubtotal: () =>
        get().items.reduce((sum, i) => {
          const price = parseFloat(i.unitPrice);
          if (!Number.isFinite(price)) return sum;
          return sum + price * i.quantity;
        }, 0),

      getItemCount: () =>
        get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "print-ninjaz-cart-v1", // D2-16 persistence key
      storage: createJSONStorage(() =>
        isBrowser ? localStorage : noopStorage
      ),
      version: 1,
      // Drawer open state is transient UI — don't persist it across reloads.
      partialize: (state) => ({ items: state.items }),
    }
  )
);
