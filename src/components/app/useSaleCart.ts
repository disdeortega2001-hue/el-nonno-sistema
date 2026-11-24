import { useMemo } from "react";
import { toast } from "sonner";
import { EMPTY_CART, useCartStore } from "@/lib/cart-store";
import type { Client, Product, SalesDoc } from "@/lib/db";
import { fmtQty } from "@/lib/format";
import {
  addToCart,
  buildLine,
  clientDebt,
  creditAvailable,
  linesTotal,
  qtyInCart,
  repriceLines,
  reservedByProduct,
  round3,
  type PriceKind,
  type Presentation,
} from "@/lib/pricing";

/** Ticket logic shared by Mostrador and the new-document wizard, with stock checks. */
export function useSaleCart(
  key: string,
  data: { products: Product[]; clients: Client[]; docs: SalesDoc[] },
  enforceStock = true,
) {
  const cart = useCartStore((s) => s.carts[key]) ?? EMPTY_CART;
  const patch = useCartStore((s) => s.patch);
  const resetStore = useCartStore((s) => s.reset);
  const { products, clients, docs } = data;
  const reserved = useMemo(() => reservedByProduct(docs), [docs]);

  /** Units on the shelf not held by open pedidos. */
  const free = (p: Product) => round3(Number(p.stock) - (reserved.get(p.id) ?? 0));
  const available = (p: Product) => round3(free(p) - qtyInCart(cart.lines, p.id));
  const client = clients.find((c) => c.id === cart.clientId) ?? null;
  const total = linesTotal(cart.lines);
  const debt = client ? clientDebt(docs, client.id) : 0;
  const creditLeft = client ? creditAvailable(Number(client.credit_limit), debt) : 0;

  function add(p: Product, pres: Presentation | null) {
    const line = buildLine(p, cart.kind, 1, pres);
    if (enforceStock && line.qty > available(p) + 0.0005) {
      toast.error(`No hay suficiente ${p.name}. Quedan ${fmtQty(Math.max(0, available(p)))} ${p.unit}.`);
      return;
    }
    patch(key, { lines: addToCart(cart.lines, line, p, cart.kind) });
  }

  function setCount(i: number, count: number) {
    const l = cart.lines[i];
    if (!l) return;
    const p = products.find((x) => x.id === l.product_id);
    if (!p) return;
    const pres = l.presentation ? (p.presentations.find((x) => x.name === l.presentation) ?? null) : null;
    const next = buildLine(p, cart.kind, count, pres);
    const others = round3(qtyInCart(cart.lines, p.id) - l.qty);
    const max = round3(free(p) - others);
    if (enforceStock && next.qty > max + 0.0005) {
      toast.error(`Solo quedan ${fmtQty(Math.max(0, max))} ${p.unit} de ${p.name}.`);
      return;
    }
    patch(key, { lines: cart.lines.map((x, j) => (j === i ? next : x)) });
  }

  function remove(i: number) {
    patch(key, { lines: cart.lines.filter((_, j) => j !== i) });
  }

  function setKind(kind: PriceKind) {
    patch(key, { kind, lines: repriceLines(cart.lines, products, kind) });
  }

  function setClient(id: string | null) {
    const c = clients.find((x) => x.id === id);
    const kind: PriceKind = c?.kind === "mayor" ? "mayor" : "detal";
    patch(key, { clientId: id, kind, lines: repriceLines(cart.lines, products, kind) });
  }

  return {
    ...cart,
    client,
    total,
    debt,
    creditLeft,
    available,
    add,
    setCount,
    remove,
    setKind,
    setClient,
    setNote: (note: string) => patch(key, { note }),
    clear: () => patch(key, { lines: [] }),
    reset: () => resetStore(key),
  };
}
