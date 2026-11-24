import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardList, FileText, PackagePlus, ShoppingCart, Trash2, Truck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { ProductPicker } from "@/components/app/ProductPicker";
import { CartLines } from "@/components/app/CartLines";
import { ClientSelect } from "@/components/app/ClientSelect";
import { ClientFormDialog } from "@/components/app/ClientFormDialog";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import { SupplierFormDialog } from "@/components/app/SupplierFormDialog";
import { PaymentDialog, type PaymentResult } from "@/components/app/PaymentDialog";
import { DocDialog } from "@/components/app/DocDialog";
import { useSaleCart } from "@/components/app/useSaleCart";
import {
  api,
  categoriesQuery,
  clientsQuery,
  productsQuery,
  salesDocsQuery,
  settingsQuery,
  useDbMutation,
} from "@/lib/db";
import { fmtBs, fmtUsd, round2, usdToBs } from "@/lib/format";
import type { PriceKind } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mostrador")({
  head: () => pageHead("Mostrador", "Venta rápida: vitrina de productos, ticket y cobro."),
  loader: ({ context }) =>
    ensureAll(context.queryClient, [settingsQuery, productsQuery, categoriesQuery, clientsQuery, salesDocsQuery]),
  component: Mostrador,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function Mostrador() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const { data: clients } = useSuspenseQuery(clientsQuery);
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const rate = Number(settings.rate);
  const cart = useSaleCart("mostrador", { products, clients, docs });
  const [paying, setPaying] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const create = useDbMutation(api.createSaleDoc);
  const doneDoc = docs.find((d) => d.id === doneId) ?? null;
  const count = cart.lines.reduce((s, l) => s + (l.presentation || l.unit !== "kg" ? l.count : 1), 0);

  async function save(kind: "cotizacion" | "pedido") {
    if (kind === "pedido" && !cart.clientId) {
      toast.error("Para apartar un pedido elige el cliente.");
      return;
    }
    try {
      const id = await create.mutateAsync({
        kind,
        clientId: cart.clientId,
        items: cart.lines,
        paymentType: "contado",
        note: cart.note,
        rate,
      });
      toast.success(kind === "pedido" ? "Pedido guardado. La mercancía quedó apartada." : "Cotización guardada.");
      cart.reset();
      setDoneId(id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function charge(r: PaymentResult) {
    const paid = round2(r.payments.reduce((s, p) => s + p.amount_usd, 0));
    const owed = round2(cart.total - paid);
    if (r.paymentType === "credito" && owed > cart.creditLeft + 0.009) {
      const msg =
        cart.creditLeft <= 0
          ? `${cart.client?.name} no tiene crédito disponible.`
          : `${cart.client?.name} solo tiene ${fmtUsd(cart.creditLeft)} de crédito disponible.`;
      toast.error(msg);
      throw new Error(msg);
    }
    try {
      const id = await create.mutateAsync({
        kind: "factura",
        clientId: cart.clientId,
        items: cart.lines,
        paymentType: r.paymentType,
        payments: r.payments,
        note: cart.note,
        rate,
      });
      toast.success(owed > 0 ? `Factura emitida. Quedan ${fmtUsd(owed)} por cobrar.` : "¡Venta cobrada!");
      cart.reset();
      setTicketOpen(false);
      setDoneId(id);
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  }

  const ticket = (
    <div className="flex h-full flex-col rounded-2xl bg-gradient-panel p-4 text-panel-foreground shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-2xl font-extrabold uppercase">Ticket</h2>
        {cart.lines.length > 0 && (
          <button type="button" onClick={cart.clear} className="flex items-center gap-1 text-xs text-panel-muted hover:text-panel-foreground">
            <Trash2 className="h-3.5 w-3.5" /> Vaciar
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <ClientSelect
          clients={clients}
          value={cart.clientId}
          onChange={cart.setClient}
          className="flex-1 border-panel-foreground/20 bg-panel-foreground/5 text-panel-foreground"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Registrar nuevo cliente"
          aria-label="Registrar nuevo cliente"
          onClick={() => setNewClientOpen(true)}
          className="h-10 w-10 shrink-0 border-panel-foreground/20 bg-panel-foreground/5 text-panel-foreground hover:bg-panel-foreground/15 hover:text-panel-foreground"
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>
      {cart.client ? (
        <p className="mt-1.5 text-[11px] text-panel-muted tabular">
          {cart.debt > 0 ? <>Debe <b className="text-accent">{fmtUsd(cart.debt)}</b> · </> : "Sin deudas · "}
          {Number(cart.client.credit_limit) > 0 ? `Crédito disponible ${fmtUsd(cart.creditLeft)}` : "No tiene crédito"}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-panel-muted">Venta directa al contado sin registro.</p>
      )}
      <div className="mt-3 min-h-40 flex-1 overflow-y-auto">
        <CartLines lines={cart.lines} onCount={cart.setCount} onRemove={cart.remove} dark />
      </div>
      {showNote || cart.note ? (
        <Textarea
          value={cart.note}
          onChange={(e) => cart.setNote(e.target.value)}
          placeholder="Nota (opcional)"
          rows={2}
          className="mt-2 border-panel-foreground/20 bg-panel-foreground/5 text-sm text-panel-foreground placeholder:text-panel-muted"
        />
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="mt-2 self-start text-xs text-panel-muted hover:text-panel-foreground">
          + Agregar nota
        </button>
      )}
      <div className="mt-3 border-t border-panel-foreground/15 pt-3">
        <div className="flex items-end justify-between">
          <p className="eyebrow text-panel-muted">Total</p>
          <div className="text-right">
            <p className="font-display text-4xl font-extrabold leading-none text-accent tabular">{fmtUsd(cart.total)}</p>
            <p className="text-xs text-panel-muted tabular">{fmtBs(usdToBs(cart.total, rate))}</p>
          </div>
        </div>
        <Button
          variant="accent"
          size="lg"
          className="mt-3 h-12 w-full text-base"
          disabled={cart.lines.length === 0 || create.isPending}
          onClick={() => setPaying(true)}
        >
          Cobrar {cart.lines.length > 0 && fmtUsd(cart.total)}
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-panel-foreground/25 bg-transparent text-panel-foreground hover:bg-panel-foreground/10 hover:text-panel-foreground"
            disabled={cart.lines.length === 0 || create.isPending}
            onClick={() => save("pedido")}
          >
            <ClipboardList className="h-4 w-4" /> Apartar pedido
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-panel-foreground/25 bg-transparent text-panel-foreground hover:bg-panel-foreground/10 hover:text-panel-foreground"
            disabled={cart.lines.length === 0 || create.isPending}
            onClick={() => save("cotizacion")}
          >
            <FileText className="h-4 w-4" /> Cotizar
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="pb-20 md:pb-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Mostrador</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Toca un producto para sumarlo al ticket. Tasa del día: <b className="tabular">Bs {rate.toLocaleString("de-DE", { maximumFractionDigits: 4 })}</b>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setNewProductOpen(true)}>
            <PackagePlus className="h-4 w-4" /> Nuevo producto
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNewClientOpen(true)}>
            <UserPlus className="h-4 w-4" /> Nuevo cliente
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNewSupplierOpen(true)}>
            <Truck className="h-4 w-4" /> Nuevo proveedor
          </Button>
          <Segmented<PriceKind>
            value={cart.kind}
            onChange={cart.setKind}
            options={[
              { value: "detal", label: "Precio detal" },
              { value: "mayor", label: "Precio mayor" },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_320px] xl:grid-cols-[1fr_380px]">
        <ProductPicker products={products} categories={categories} kind={cart.kind} available={cart.available} onPick={cart.add} />
        <aside className="hidden md:block">
          <div className="sticky top-4 h-[calc(100vh-2rem)] max-h-[820px]">{ticket}</div>
        </aside>
      </div>

      {/* Phones: floating ticket bar */}
      <div className="fixed inset-x-3 bottom-3 z-30 md:hidden">
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          className="flex w-full items-center justify-between rounded-xl bg-panel px-4 py-3 text-panel-foreground shadow-lg"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-5 w-5 text-accent" /> Ver ticket ({count})
          </span>
          <span className="font-display text-2xl font-extrabold text-accent tabular">{fmtUsd(cart.total)}</span>
        </button>
      </div>
      <div
        className={cn("fixed inset-0 z-40 bg-foreground/40 md:hidden", ticketOpen ? "block" : "hidden")}
        onClick={() => setTicketOpen(false)}
      >
        <div className="absolute inset-x-2 bottom-2 top-16" onClick={(e) => e.stopPropagation()}>
          {ticket}
        </div>
      </div>

      <PaymentDialog
        open={paying}
        onOpenChange={setPaying}
        totalUsd={cart.total}
        rate={rate}
        title="Cobrar"
        description={cart.client ? cart.client.name : "Cliente de contado"}
        allowCredit={!!cart.client && Number(cart.client.credit_limit) > 0}
        confirmLabel="Cobrar y facturar"
        onConfirm={charge}
      />
      <DocDialog doc={doneDoc} onOpenChange={(v) => !v && setDoneId(null)} />

      <ClientFormDialog
        editing={newClientOpen ? "new" : null}
        onClose={() => setNewClientOpen(false)}
        onSaved={(c) => cart.setClient(c.id)}
      />
      <ProductFormDialog
        editing={newProductOpen ? "new" : null}
        onClose={() => setNewProductOpen(false)}
        categories={categories}
        rate={rate}
      />
      <SupplierFormDialog
        editing={newSupplierOpen ? "new" : null}
        onClose={() => setNewSupplierOpen(false)}
      />
    </div>
  );
}
