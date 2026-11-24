import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Segmented, StatusBadge } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { DocDialog } from "@/components/app/DocDialog";
import { clientsQuery, paymentsQuery, salesDocsQuery, settingsQuery, type SalesDoc } from "@/lib/db";
import { fmtDate, fmtUsd } from "@/lib/format";
import { balance } from "@/lib/pricing";

const KINDS = ["cotizacion", "pedido", "factura"] as const;
type Kind = (typeof KINDS)[number];

const searchSchema = z.object({
  tab: fallback(z.enum(KINDS), "factura").default("factura"),
});

export const Route = createFileRoute("/_authenticated/ventas")({
  validateSearch: zodValidator(searchSchema),
  head: () => pageHead("Ventas", "Cotizaciones, pedidos y facturas."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, salesDocsQuery, clientsQuery, paymentsQuery]),
  component: Ventas,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const FILTERS: Record<Kind, { value: string; label: string }[]> = {
  cotizacion: [
    { value: "abierta", label: "Abiertas" },
    { value: "convertida", label: "Convertidas" },
    { value: "cancelada", label: "Canceladas" },
    { value: "all", label: "Todas" },
  ],
  pedido: [
    { value: "por_facturar", label: "Por facturar" },
    { value: "facturado", label: "Facturados" },
    { value: "cancelado", label: "Cancelados" },
    { value: "all", label: "Todos" },
  ],
  factura: [
    { value: "all", label: "Todas" },
    { value: "pagada", label: "Pagadas" },
    { value: "pendiente", label: "Por cobrar" },
    { value: "anulada", label: "Anuladas" },
  ],
};

const NEW_LABEL: Record<Kind, string> = { cotizacion: "Nueva cotización", pedido: "Nuevo pedido", factura: "Nueva factura" };

function Ventas() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const [status, setStatus] = useState<Record<Kind, string>>({ cotizacion: "abierta", pedido: "por_facturar", factura: "all" });
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = docs.find((d) => d.id === openId) ?? null;

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { cotizacion: 0, pedido: 0, factura: 0 };
    for (const d of docs) {
      if (d.kind === "cotizacion" && d.status === "abierta") c.cotizacion++;
      if (d.kind === "pedido" && d.status === "por_facturar") c.pedido++;
      if (d.kind === "factura" && d.status === "pendiente") c.factura++;
    }
    return c;
  }, [docs]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const st = status[tab];
    return docs.filter(
      (d) =>
        d.kind === tab &&
        (st === "all" || d.status === st) &&
        (!s || d.number.toLowerCase().includes(s) || d.client_name.toLowerCase().includes(s)),
    );
  }, [docs, tab, status, q]);
  const sum = list.filter((d) => d.status !== "anulada" && d.status !== "cancelada" && d.status !== "cancelado").reduce((a, d) => a + Number(d.total_usd), 0);

  return (
    <div>
      <PageHeader
        title="Ventas"
        subtitle="Cotiza, aparta pedidos y factura. Toca un documento para ver todo lo que puedes hacer con él."
        actions={
          <Button variant="accent" asChild>
            {tab === "factura" ? (
              <Link to="/mostrador">
                <Plus className="h-4 w-4" /> {NEW_LABEL[tab]}
              </Link>
            ) : (
              <Link to="/ventas/nuevo" search={{ tipo: tab }}>
                <Plus className="h-4 w-4" /> {NEW_LABEL[tab]}
              </Link>
            )}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Kind>
          value={tab}
          onChange={(v) => navigate({ search: { tab: v } })}
          options={[
            { value: "cotizacion", label: <TabLabel text="Cotizaciones" n={counts.cotizacion} /> },
            { value: "pedido", label: <TabLabel text="Pedidos" n={counts.pedido} /> },
            { value: "factura", label: <TabLabel text="Facturas" n={counts.factura} /> },
          ]}
        />
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número o cliente…" className="pl-9" />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS[tab].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus((s) => ({ ...s, [tab]: f.value }))}
              className={
                "rounded-full border px-3 py-1 text-xs font-semibold " +
                (status[tab] === f.value ? "border-panel bg-panel text-panel-foreground" : "bg-card hover:bg-muted")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {list.length} {list.length === 1 ? "documento" : "documentos"} · <b className="tabular text-foreground">{fmtUsd(sum)}</b>
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="No hay documentos aquí">
          Prueba otro filtro o crea uno nuevo.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Número</th>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                {tab === "factura" && <th className="px-4 py-2.5 text-right">Debe</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <DocRow key={d.id} d={d} showDebt={tab === "factura"} onOpen={() => setOpenId(d.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DocDialog doc={open} onOpenChange={(v) => !v && setOpenId(null)} />
    </div>
  );
}

function TabLabel({ text, n }: { text: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {n > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">{n}</span>}
    </span>
  );
}

function DocRow({ d, showDebt, onOpen }: { d: SalesDoc; showDebt: boolean; onOpen: () => void }) {
  const owed = balance(d);
  const overdue = d.status === "pendiente" && d.due_date && d.due_date < new Date().toISOString().slice(0, 10);
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t hover:bg-muted/50">
      <td className="px-4 py-2.5 font-semibold">{d.number}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(d.created_at)}</td>
      <td className="px-4 py-2.5">{d.client_name}</td>
      <td className="px-4 py-2.5">
        <StatusBadge status={d.status} />
        {overdue && <span className="ml-1.5 text-xs font-semibold text-destructive">Vencida</span>}
      </td>
      <td className="px-4 py-2.5 text-right font-semibold tabular">{fmtUsd(d.total_usd)}</td>
      {showDebt && (
        <td className={"px-4 py-2.5 text-right tabular " + (owed > 0 && d.status === "pendiente" ? "font-bold text-destructive" : "text-muted-foreground")}>
          {d.status === "pendiente" ? fmtUsd(owed) : "—"}
        </td>
      )}
    </tr>
  );
}
