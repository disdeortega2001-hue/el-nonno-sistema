import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ClipboardList, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { meQuery, productsQuery, salesDocsQuery, settingsQuery } from "@/lib/db";
import { fmtBs, fmtLongDate, fmtQty, fmtRate, fmtUsd, localDay, usdToBs } from "@/lib/format";
import { balance, reservedByProduct } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import logo from "@/assets/nonno-logo.webp";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => pageHead("Inicio", "Resumen del día: ventas, cobros pendientes, pedidos y productos por reponer."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, salesDocsQuery, productsQuery, meQuery]),
  component: Inicio,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

function Inicio() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: me } = useSuspenseQuery(meQuery);
  const rate = Number(settings.rate);
  const today = localDay();
  const month = today.slice(0, 7);

  const s = useMemo(() => {
    const facturas = docs.filter((d) => d.kind === "factura" && d.status !== "anulada");
    const hoy = facturas.filter((d) => localDay(d.created_at) === today);
    const mes = facturas.filter((d) => localDay(d.created_at).startsWith(month));
    const pend = facturas.filter((d) => d.status === "pendiente");
    const debtors = new Set(pend.map((d) => d.client_id));
    const pedidos = docs.filter((d) => d.kind === "pedido" && d.status === "por_facturar");
    const cotHoy = docs.filter((d) => d.kind === "cotizacion" && d.status === "abierta").length;
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const soon = pend.filter((d) => d.due_date && d.due_date <= localDay(in7));
    const overdue = soon.filter((d) => d.due_date! < today);
    const reserved = reservedByProduct(docs);
    const low = products
      .filter((p) => p.active && Number(p.stock) - (reserved.get(p.id) ?? 0) <= Number(p.min_stock))
      .sort((a, b) => Number(a.stock) / (Number(a.min_stock) || 1) - Number(b.stock) / (Number(b.min_stock) || 1));
    return {
      hoyUsd: hoy.reduce((a, d) => a + Number(d.total_usd), 0),
      hoyN: hoy.length,
      mesUsd: mes.reduce((a, d) => a + Number(d.total_usd), 0),
      porCobrar: pend.reduce((a, d) => a + balance(d), 0),
      debtors: debtors.size,
      pedidos: pedidos.length,
      cotizaciones: cotHoy,
      soon: soon.length,
      overdue: overdue.length,
      soonUsd: soon.reduce((a, d) => a + balance(d), 0),
      inventoryCost: products.reduce((a, p) => a + Number(p.stock) * Number(p.cost), 0),
      low,
      reserved,
    };
  }, [docs, products, today, month]);

  const name = (me?.profile?.display_name || me?.email || "").split(/[\s@]/)[0];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-panel p-6 text-panel-foreground shadow-card sm:p-8">
        <div className="flex flex-wrap items-center gap-6">
          <img src={logo} alt="" className="h-24 w-24 rounded-full ring-4 ring-accent/50" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-panel-muted">
              Hola, <b className="text-panel-foreground">{name}</b> · {greeting()} · {fmtLongDate(new Date())}
            </p>
            <h1 className="font-display text-4xl font-extrabold uppercase leading-none sm:text-6xl">
              Hoy van <span className="text-accent tabular">{fmtUsd(s.hoyUsd)}</span> en ventas
            </h1>
            <p className="mt-1 text-sm text-panel-muted tabular">
              {fmtBs(usdToBs(s.hoyUsd, rate))} · {s.hoyN} {s.hoyN === 1 ? "factura emitida" : "facturas emitidas"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="accent" asChild>
                <Link to="/mostrador"><Plus className="h-4 w-4" /> Nueva factura</Link>
              </Button>
              <Button variant="outline" className="border-panel-foreground/30 bg-transparent text-panel-foreground hover:bg-panel-foreground/10" asChild>
                <Link to="/ventas/nuevo" search={{ tipo: "pedido" }}><ClipboardList className="h-4 w-4" /> Nuevo pedido</Link>
              </Button>
              <Button variant="outline" className="border-panel-foreground/30 bg-transparent text-panel-foreground hover:bg-panel-foreground/10" asChild>
                <Link to="/ventas/nuevo" search={{ tipo: "cotizacion" }}><FileText className="h-4 w-4" /> Cotizar</Link>
              </Button>
            </div>
          </div>
          <Link to="/configuracion" className="rounded-xl bg-accent px-4 py-3 text-center text-accent-foreground shadow-md">
            <p className="eyebrow">{settings.rate_source === "bcv" ? "Tasa BCV" : "Tasa manual"}</p>
            <p className="font-display text-3xl font-extrabold tabular">{fmtRate(rate).replace("Bs ", "")}</p>
            <p className="text-[11px]">Bs por dólar</p>
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="La pizarra">
          <ul className="divide-y">
            <li><Link to="/reportes"><Row label="Ventas del mes" hint="Facturas emitidas desde el día 1" value={fmtUsd(s.mesUsd)} sub={fmtBs(usdToBs(s.mesUsd, rate))} /></Link></li>
            <li><Link to="/por-cobrar"><Row
              label="Por cobrar"
              hint={s.debtors === 0 ? "Nadie debe nada" : `${s.debtors} ${s.debtors === 1 ? "cliente debe" : "clientes deben"}`}
              value={fmtUsd(s.porCobrar)}
              tone={s.porCobrar > 0 ? "danger" : undefined} /></Link></li>
            <li><Link to="/ventas" search={{ tab: "pedido" }}><Row label="Pedidos por facturar" hint={`${s.cotizaciones} cotizaciones abiertas`} value={String(s.pedidos)} /></Link></li>
            <li><Link to="/por-cobrar"><Row
              label="Vence pronto"
              hint={`${s.overdue} ya vencidas · ${s.soon - s.overdue} esta semana`}
              value={String(s.soon)}
              tone={s.overdue > 0 ? "danger" : undefined} /></Link></li>
            <li><Link to="/inventario"><Row label="Inventario a costo" hint="Mercancía en el almacén, a precio de compra" value={fmtUsd(s.inventoryCost)} /></Link></li>
          </ul>
        </Panel>

        <Panel title="Hay que reponer" actions={<Link to="/compras/nueva" className="text-sm font-semibold text-info hover:underline">Registrar compra</Link>}>
          {s.low.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todo está por encima del mínimo. 👌</p>
          ) : (
            <ul className="space-y-3">
              {s.low.slice(0, 8).map((p) => {
                const avail = Number(p.stock) - (s.reserved.get(p.id) ?? 0);
                const pct = Math.min(100, (avail / (Number(p.min_stock) || 1)) * 100);
                return (
                  <li key={p.id}>
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">{p.name}</span>
                      <span className="tabular text-muted-foreground">
                        <b className="text-destructive">{fmtQty(avail)} {p.unit}</b> · mín. {fmtQty(p.min_stock)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-destructive" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  value,
  sub,
  tone,
}: {
  label: string;
  hint: string;
  value: string;
  sub?: string | undefined;
  tone?: "danger" | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 hover:opacity-80">
        <div>
          <p className="font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="text-right">
          <p className={cn("font-display text-2xl font-extrabold tabular", tone === "danger" && "text-destructive")}>{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground tabular">{sub}</p>}
        </div>
    </div>
  );
}
