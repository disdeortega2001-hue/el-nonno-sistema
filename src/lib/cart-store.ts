import { create } from "zustand";
import type { DocItem, PriceKind } from "./pricing";

/** A ticket being built (mostrador or the new-document wizard). Kept in memory so it survives page changes. */
export interface Cart {
  lines: DocItem[];
  clientId: string | null;
  kind: PriceKind;
  note: string;
}

export const EMPTY_CART: Cart = { lines: [], clientId: null, kind: "detal", note: "" };

interface CartStore {
  carts: Record<string, Cart>;
  patch: (key: string, p: Partial<Cart>) => void;
  reset: (key: string) => void;
}

export const useCartStore = create<CartStore>((set) => ({
  carts: {},
  patch: (key, p) => set((s) => ({ carts: { ...s.carts, [key]: { ...(s.carts[key] ?? EMPTY_CART), ...p } } })),
  reset: (key) => set((s) => ({ carts: { ...s.carts, [key]: EMPTY_CART } })),
}));
