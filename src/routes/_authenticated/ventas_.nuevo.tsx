import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, PackagePlus, UserPlus } from "lucide-react";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel, Segmented } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { ProductPicker } from "@/components/app/ProductPicker";
import { CartLines } from "@/components/app/CartLines";
import { Avatar } from "@/components/app/ClientSelect";
import { ClientFormDialog } from "@/components/app/ClientFormDialog";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import { PaymentDialog, type PaymentResult } from "@/components/app/PaymentDialog";
import { useSaleCart } from "@/components/app/useSaleCart";
import {
  api,
  categoriesQuery,
  clientsQuery,
  DOC_KIND_LABEL,
  productsQuery,
  salesDocsQuery,
  settingsQuery,
  useDbMutation,
} from "@/lib/db";
import { fmtBs, fmtQty, fmtUsd, round2, usdToBs } from "@/lib/format";
import type { PriceKind } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const KINDS = ["cotizacion", "pedido", "factura"] as const;
type Kind = (typeof KINDS)[number];

const searchSchema = z.object({
  tipo: fallback(z.enum(KINDS), "pedido").default("pedido"),
});

export const Route = createFileRoute("/_authenticated/ventas_/nuevo")({
  validateSearch: zodValidator(searchSchema),
  head: () => pageHead("Nuevo documento", "Asistente para crear una cotización, un pedido o una factura."),
  loader: ({ context }) =>
    ensureAll(context.queryClient, [settingsQuery, productsQuery, categoriesQuery, clientsQuery, salesDocsQuery]),
  component: NuevoDoc,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const STEPS = ["Cliente", "Productos", "Revisar"] as const;
const SAVED: Record<Kind, string> = {
  cotizacion: "Cotización guardada.",
  pedido: "Pedido guardado. La mercancía quedó apartada.",
  factura: "Factura emitida.",
};

function NuevoDoc() {
  const { tipo } = Route.useSearch();
  const navigate = useNavigate();
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const { data: clients } = useSuspenseQuery(clientsQuery);
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const rate = Number(settings.rate);
  // Quotes don't take merchandise, so they can include more than what's in stock.
  const cart = useSaleCart("nuevo", { products, clients, docs }, tipo !== "cotizacion");
  const [step, setStep] = useState(0);
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const create = useDbMutation(api.createSaleDoc);

  const activeClients = clients.filter(
    (c) => c.active && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.rif.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const needsClient = tipo === "pedido";

  function setTipo(t: Kind) {
    navigate({ to: "/ventas/nuevo", search: { tipo: t }, replace: true });
  }

  async function finish(r?: PaymentResult) {
    if (r?.paymentType === "credito") {
      const paid = round2(r.payments.reduce((s, p) => s + p.amount_usd, 0));
      const owed = round2(cart.total - paid);
      if (owed > cart.creditLeft + 0.009) {
        const msg = `${cart.client?.name} solo tiene ${fmtUsd(cart.creditLeft)} de crédito disponible.`;
        toast.error(msg);
        throw new Error(msg);
      }
    }
    try {
      await create.mutateAsync({
        kind: tipo,
        clientId: cart.clientId,
        items: cart.lines,
        paymentType: r?.paymentType ?? "contado",
        payments: r?.payments ?? [],
        note: cart.note,
        rate,
      });
      toast.success(SAVED[tipo]);
      cart.reset();
      navigate({ to: "/ventas", search: { tab: tipo } });
    } catch (e) {
      toast.error((e as Error).message);
      if (r) throw e;
    }
  }

  const canNext = step === 0 ? !needsClient || !!cart.clientId : step === 1 ? cart.lines.length > 0 : true;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/ventas" search={{ tab: tipo }} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a ventas
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">Nuevo documento</h1>
        <Segmented<Kind>
          value={tipo}
          onChange={setTipo}
          options={[
            { value: "cotizacion", label: "Cotización" },
            { value: "pedido", label: "Pedido" },
            { value: "factura", label: "Factura" },
          ]}
        />
      </div>

      <ol className="mb-5 grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold",
                i === step ? "border-accent bg-accent/15" : i < step ? "bg-card" : "bg-muted text-muted-foreground",
              )}
            >
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs", i < step ? "bg-success text-success-foreground" : i === step ? "bg-accent text-accent-foreground" : "bg-secondary")}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Panel
          title="¿Para quién es?"
          description={needsClient ? "Un pedido aparta la mercancía a nombre de un cliente." : "Puedes dejarlo como cliente de contado sin registro."}
          actions={
            <Button variant="outline" size="sm" onClick={() => setNewClientOpen(true)}>
              <UserPlus className="h-4 w-4" /> Nuevo cliente
            </Button>
          }
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente por nombre o RIF…"
            className="mb-3 h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {!needsClient && (
              <ClientCard active={cart.clientId === null} onClick={() => cart.setClient(null)} name="Cliente de contado" sub="Sin registro, precio detal" />
            )}
            {activeClients.map((c) => (
              <ClientCard
                key={c.id}
                active={cart.clientId === c.id}
                onClick={() => cart.setClient(c.id)}
                name={c.name}
                sub={`${c.kind === "mayor" ? "Mayor" : "Detal"}${c.rif ? ` · ${c.rif}` : ""}${Number(c.credit_limit) > 0 ? ` · Crédito ${fmtUsd(c.credit_limit)}` : ""}`}
              />
            ))}
          </div>
        </Panel>
      )}

      {step === 1 && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {cart.client ? cart.client.name : "Cliente de contado"}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setNewProductOpen(true)}>
                  <PackagePlus className="h-4 w-4" /> Nuevo producto
                </Button>
                <Segmented<PriceKind>
                  value={cart.kind}
                  onChange={cart.setKind}
                  options={[
                    { value: "detal", label: "Detal" },
                    { value: "mayor", label: "Mayor" },
                  ]}
                />
              </div>
            </div>
            <ProductPicker
              products={products}
              categories={categories}
              kind={cart.kind}
              available={tipo === "cotizacion" ? () => Infinity : cart.available}
              onPick={cart.add}
              compact
            />
          </div>
          <Panel title="Lleva" className="h-fit lg:sticky lg:top-4">
            <CartLines lines={cart.lines} onCount={cart.setCount} onRemove={cart.remove} />
            <div className="mt-3 flex items-end justify-between border-t pt-3">
              <p className="eyebrow text-muted-foreground">Total</p>
              <p className="font-display text-3xl font-extrabold tabular">{fmtUsd(cart.total)}</p>
            </div>
          </Panel>
        </div>
      )}

      {step === 2 && (
        <Panel title={`Revisar ${DOC_KIND_LABEL[tipo]?.toLowerCase()}`}>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={cart.client?.name ?? "Contado"} />
            <div>
              <p className="font-semibold">{cart.client?.name ?? "Cliente de contado"}</p>
              <p className="text-xs text-muted-foreground">
                Precios al {cart.kind === "mayor" ? "mayor" : "detal"}
                {cart.client && cart.debt > 0 && ` · Ya debe ${fmtUsd(cart.debt)}`}
              </p>
            </div>
          </div>
          <ul className="divide-y rounded-lg border text-sm">
            {cart.lines.map((l) => (
              <li key={l.product_id + (l.presentation ?? "")} className="flex justify-between gap-3 px-3 py-2">
                <span>
                  <b className="tabular">{fmtQty(l.count)}</b> {l.presentation ?? l.unit} · {l.name}
                </span>
                <span className="font-semibold tabular">{fmtUsd(l.line_total)}</span>
              </li>
            ))}
          </ul>
          <Textarea
            className="mt-3"
            rows={2}
            placeholder="Nota para el cliente (opcional): dirección de entrega, condiciones…"
            value={cart.note}
            onChange={(e) => cart.setNote(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-gradient-panel p-4 text-panel-foreground">
            <div>
              <p className="eyebrow text-panel-muted">Total</p>
              <p className="font-display text-4xl font-extrabold text-accent tabular">{fmtUsd(cart.total)}</p>
              <p className="text-xs text-panel-muted tabular">{fmtBs(usdToBs(cart.total, rate))}</p>
            </div>
            <p className="max-w-xs text-right text-xs text-panel-muted">
              {tipo === "cotizacion" && "La cotización no aparta mercancía. Después la puedes pasar a pedido o facturar."}
              {tipo === "pedido" && "El pedido aparta la mercancía hasta que lo factures o lo canceles."}
              {tipo === "factura" && "Al facturar sale la mercancía del inventario y se registra el pago."}
            </p>
          </div>
        </Panel>
      )}

      <div className="mt-5 flex justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="h-4 w-4" /> Atrás
        </Button>
        {step < 2 ? (
          <Button variant="panel" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Siguiente <ArrowRight className="h-4 w-4" />
          </Button>
        ) : tipo === "factura" ? (
          <Button variant="accent" size="lg" disabled={cart.lines.length === 0 || create.isPending} onClick={() => setPaying(true)}>
            Cobrar y facturar
          </Button>
        ) : (
          <Button variant="accent" size="lg" disabled={cart.lines.length === 0 || create.isPending} onClick={() => finish()}>
            {create.isPending ? "Guardando…" : `Guardar ${DOC_KIND_LABEL[tipo]?.toLowerCase()}`}
          </Button>
        )}
      </div>

      <PaymentDialog
        open={paying}
        onOpenChange={setPaying}
        totalUsd={cart.total}
        rate={rate}
        description={cart.client?.name ?? "Cliente de contado"}
        allowCredit={!!cart.client && Number(cart.client.credit_limit) > 0}
        confirmLabel="Facturar"
        onConfirm={finish}
      />

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
    </div>
  );
}

function ClientCard({ active, onClick, name, sub }: { active: boolean; onClick: () => void; name: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        active ? "border-accent bg-accent/15 ring-1 ring-accent" : "bg-card hover:bg-muted",
      )}
    >
      <Avatar name={name} />
      <div className="min-w-0">
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
    </button>
  );
}
