import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { DocItem, Presentation } from "./pricing";
import { unpackProductPresentations, type ProductMeta } from "./meta";

// ---------- Domain types (DB rows with typed JSON columns) ----------
export type Settings = Tables<"settings">;
export type Category = Tables<"categories">;
export type Product = Omit<Tables<"products">, "presentations"> & {
  presentations: Presentation[];
  meta?: ProductMeta;
};
export type Client = Tables<"clients">;
export type Supplier = Tables<"suppliers">;
export type SalesDoc = Omit<Tables<"sales_docs">, "items"> & { items: DocItem[] };
export type Payment = Tables<"payments">;
export interface PurchaseItem {
  product_id: string;
  code: string;
  name: string;
  /** Presentation bought (e.g. "Caja") or "Unidad". */
  presentation: string;
  units_per_pack: number;
  packs: number;
  cost_per_pack: number;
  expiry: string | null;
}
export type Purchase = Omit<Tables<"purchases">, "items"> & { items: PurchaseItem[] };
export type StockMovement = Tables<"stock_movements">;
export type CashClosing = Tables<"cash_closings">;
export type Profile = Tables<"profiles">;
export type UserRole = Tables<"user_roles">;

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------- Queries (all keys start with "db" so one invalidate refreshes everything) ----------
export const settingsQuery = queryOptions({
  queryKey: ["db", "settings"],
  queryFn: async () => must(await supabase.from("settings").select("*").eq("id", 1).single()) as Settings,
});

export const categoriesQuery = queryOptions({
  queryKey: ["db", "categories"],
  queryFn: async () => must(await supabase.from("categories").select("*").order("sort").order("name")) as Category[],
});

export const productsQuery = queryOptions({
  queryKey: ["db", "products"],
  queryFn: async () => {
    const rows = must(await supabase.from("products").select("*").order("name"));
    return rows.map((r) => {
      const { presentations, meta } = unpackProductPresentations(r.presentations);
      return { ...r, presentations, meta } as Product;
    });
  },
});

export const clientsQuery = queryOptions({
  queryKey: ["db", "clients"],
  queryFn: async () => must(await supabase.from("clients").select("*").order("name")) as Client[],
});

export const suppliersQuery = queryOptions({
  queryKey: ["db", "suppliers"],
  queryFn: async () => must(await supabase.from("suppliers").select("*").order("name")) as Supplier[],
});

export const salesDocsQuery = queryOptions({
  queryKey: ["db", "sales_docs"],
  queryFn: async () =>
    must(
      await supabase.from("sales_docs").select("*").order("created_at", { ascending: false }).limit(1000),
    ) as unknown as SalesDoc[],
});

export const paymentsQuery = queryOptions({
  queryKey: ["db", "payments"],
  queryFn: async () =>
    must(await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(1000)) as Payment[],
});

export const purchasesQuery = queryOptions({
  queryKey: ["db", "purchases"],
  queryFn: async () =>
    must(
      await supabase.from("purchases").select("*").order("created_at", { ascending: false }).limit(1000),
    ) as unknown as Purchase[],
});

export const movementsQuery = queryOptions({
  queryKey: ["db", "stock_movements"],
  queryFn: async () =>
    must(
      await supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(500),
    ) as StockMovement[],
});

export const closingsQuery = queryOptions({
  queryKey: ["db", "cash_closings"],
  queryFn: async () =>
    must(await supabase.from("cash_closings").select("*").order("day", { ascending: false }).limit(200)) as CashClosing[],
});

export const profilesQuery = queryOptions({
  queryKey: ["db", "profiles"],
  queryFn: async () => must(await supabase.from("profiles").select("*").order("created_at")) as Profile[],
});

export const rolesQuery = queryOptions({
  queryKey: ["db", "user_roles"],
  queryFn: async () => must(await supabase.from("user_roles").select("*")) as UserRole[],
});

/** The signed-in user's own profile + roles (works even before approval). */
export const meQuery = queryOptions({
  queryKey: ["db", "me"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const profile = must(await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle()) as Profile | null;
    const roles = must(await supabase.from("user_roles").select("role").eq("user_id", u.user.id)) as { role: string }[];
    return {
      id: u.user.id,
      email: u.user.email ?? "",
      profile,
      isAdmin: roles.some((r) => r.role === "admin"),
    };
  },
});

// ---------- Mutations ----------
/** Wraps an async action, refreshes all data afterwards. Errors surface as Error with a friendly message. */
export function useDbMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: ["db"] }),
  });
}

function rpcError(e: { message: string } | null) {
  if (e) throw new Error(friendly(e.message));
}

export function friendly(msg: string): string {
  if (/row-level security|permission denied/i.test(msg)) return "No tienes permiso para hacer esto.";
  if (/duplicate key.*code/i.test(msg)) return "Ya existe un producto con ese código.";
  return msg;
}

export interface PaymentInput {
  method: string;
  amount_usd: number;
  amount_bs: number;
  reference?: string;
}

export const api = {
  async createSaleDoc(v: {
    kind: "cotizacion" | "pedido" | "factura";
    clientId: string | null;
    items: DocItem[];
    paymentType: "contado" | "credito";
    note?: string;
    payments?: PaymentInput[];
    rate: number;
  }): Promise<string> {
    const { data, error } = await supabase.rpc("create_sale_doc", {
      p_kind: v.kind,
      p_client_id: v.clientId as string,
      p_items: v.items as never,
      p_payment_type: v.paymentType,
      p_note: v.note ?? "",
      p_payments: (v.payments ?? []) as never,
      p_rate: v.rate,
    });
    rpcError(error);
    return data as string;
  },
  async convertDoc(v: {
    docId: string;
    toKind: "pedido" | "factura";
    paymentType: "contado" | "credito";
    payments?: PaymentInput[];
    rate: number;
  }): Promise<string> {
    const { data, error } = await supabase.rpc("convert_doc", {
      p_doc_id: v.docId,
      p_to_kind: v.toKind,
      p_payment_type: v.paymentType,
      p_payments: (v.payments ?? []) as never,
      p_rate: v.rate,
    });
    rpcError(error);
    return data as string;
  },
  async cancelDoc(docId: string) {
    const { error } = await supabase.rpc("cancel_doc", { p_doc_id: docId });
    rpcError(error);
  },
  async addPayment(v: { docId: string; method: string; amountUsd: number; amountBs: number; rate: number; reference?: string }) {
    const { error } = await supabase.rpc("add_payment", {
      p_doc_id: v.docId,
      p_method: v.method,
      p_amount_usd: v.amountUsd,
      p_amount_bs: v.amountBs,
      p_rate: v.rate,
      p_reference: v.reference ?? "",
    });
    rpcError(error);
  },
  async registerPurchase(v: {
    supplierId: string;
    invoiceNo: string;
    controlNo: string;
    invoiceDate: string;
    items: PurchaseItem[];
    paymentType: "contado" | "credito" | "abono";
    paidUsd: number;
    note: string;
    rate: number;
  }): Promise<string> {
    const { data, error } = await supabase.rpc("register_purchase", {
      p_supplier_id: v.supplierId,
      p_invoice_no: v.invoiceNo,
      p_control_no: v.controlNo,
      p_invoice_date: v.invoiceDate,
      p_items: v.items as never,
      p_payment_type: v.paymentType,
      p_paid_usd: v.paidUsd,
      p_note: v.note,
      p_rate: v.rate,
    });
    rpcError(error);
    return data as string;
  },
  async voidPurchase(id: string) {
    const { error } = await supabase.rpc("void_purchase", { p_id: id });
    rpcError(error);
  },
  async adjustStock(v: { productId: string; qty: number; kind: "ajuste" | "merma"; reason: string }) {
    const { error } = await supabase.rpc("adjust_stock", {
      p_product_id: v.productId,
      p_qty: v.qty,
      p_kind: v.kind,
      p_reason: v.reason,
    });
    rpcError(error);
  },
  async upsert<T extends "products" | "clients" | "suppliers" | "categories">(table: T, row: Record<string, unknown>) {
    const { error } = row["id"]
      ? await supabase.from(table).update(row as never).eq("id" as never, row["id"] as never)
      : await supabase.from(table).insert(row as never);
    rpcError(error);
  },
  async upsertReturning<T extends "products" | "clients" | "suppliers" | "categories">(
    table: T,
    row: Record<string, unknown>,
  ): Promise<Tables<T>> {
    const res = row["id"]
      ? await supabase.from(table).update(row as never).eq("id" as never, row["id"] as never).select("*").single()
      : await supabase.from(table).insert(row as never).select("*").single();
    rpcError(res.error);
    return res.data as Tables<T>;
  },
  async payPurchase(v: { id: string; paidUsd: number; paymentType: "contado" | "credito" | "abono" }) {
    const { error } = await supabase
      .from("purchases")
      .update({ paid_usd: v.paidUsd, payment_type: v.paymentType })
      .eq("id", v.id);
    rpcError(error);
  },
  async remove(table: "products" | "clients" | "suppliers" | "categories", id: string) {
    const { error } = await supabase.from(table).delete().eq("id" as never, id as never);
    rpcError(error);
  },
  async updateSettings(patch: Partial<Settings>) {
    const { error } = await supabase.from("settings").update(patch).eq("id", 1);
    rpcError(error);
  },
  async saveClosing(row: Omit<CashClosing, "id" | "closed_at" | "closed_by">) {
    const { error } = await supabase.from("cash_closings").upsert(row, { onConflict: "day" });
    rpcError(error);
  },
  async setMemberActive(userId: string, active: boolean) {
    const { error } = await supabase.from("profiles").update({ active }).eq("id", userId);
    rpcError(error);
  },
  async setAdmin(userId: string, admin: boolean) {
    const { error } = admin
      ? await supabase.from("user_roles").insert({ user_id: userId, role: "admin" })
      : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    rpcError(error);
  },
  async updateMyName(userId: string, name: string) {
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", userId);
    rpcError(error);
  },
};

export const DOC_KIND_LABEL: Record<string, string> = {
  cotizacion: "Cotización",
  pedido: "Pedido",
  factura: "Factura",
};

export const DOC_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" | "muted" }> = {
  abierta: { label: "Abierta", tone: "info" },
  convertida: { label: "Convertida", tone: "muted" },
  cancelada: { label: "Cancelada", tone: "danger" },
  por_facturar: { label: "Por facturar", tone: "warning" },
  facturado: { label: "Facturado", tone: "success" },
  cancelado: { label: "Cancelado", tone: "danger" },
  pagada: { label: "Pagada", tone: "success" },
  pendiente: { label: "Por cobrar", tone: "warning" },
  anulada: { label: "Anulada", tone: "danger" },
};
