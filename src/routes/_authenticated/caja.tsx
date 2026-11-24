import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Banknote, CheckCircle2, CreditCard, Download, Printer, Smartphone, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { DocDialog } from "@/components/app/DocDialog";
import {
  api,
  closingsQuery,
  paymentsQuery,
  salesDocsQuery,
  settingsQuery,
  useDbMutation,
} from "@/lib/db";
import {
  fmtBs,
  fmtDate,
  fmtDateTime,
  fmtNum,
  fmtUsd,
  localDay,
  parseAmount,
  round2,
  usdToBs,
} from "@/lib/format";
import { methodLabel, PAYMENT_METHODS, type PaymentMethod } from "@/lib/pricing";
import { downloadCsv, escapeHtml, printHtml } from "@/lib/print";
import { cn } from "@/lib/utils";
import logo from "@/assets/nonno-logo.webp";

export const Route = createFileRoute("/_authenticated/caja")({
  head: () => pageHead("Caja del día", "Entradas de dinero por forma de pago, cierre del punto y cuadre."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, paymentsQuery, closingsQuery, salesDocsQuery]),
  component: CajaDelDia,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

const METHOD_ICON: Record<PaymentMethod, typeof Wallet> = {
  divisas: Banknote,
  bolivares: Wallet,
  pago_movil: Smartphone,
  punto: CreditCard,
};

function CajaDelDia() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: payments } = useSuspenseQuery(paymentsQuery);
  const { data: closings } = useSuspenseQuery(closingsQuery);
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const rate = Number(settings.rate);
  const today = localDay();
  const [day, setDay] = useState(today);
  const [docId, setDocId] = useState<string | null>(null);

  const dayPayments = useMemo(
    () => payments.filter((p) => localDay(p.created_at) === day),
    [payments, day],
  );

  const byMethod = useMemo(() => {
    const map = new Map<string, { usd: number; bs: number; count: number }>();
    for (const m of PAYMENT_METHODS) map.set(m.key, { usd: 0, bs: 0, count: 0 });
    for (const p of dayPayments) {
      const cur = map.get(p.method) ?? { usd: 0, bs: 0, count: 0 };
      cur.usd = round2(cur.usd + Number(p.amount_usd));
      cur.bs = round2(cur.bs + Number(p.amount_bs));
      cur.count += 1;
      map.set(p.method, cur);
    }
    return map;
  }, [dayPayments]);

  const totalUsd = round2(dayPayments.reduce((s, p) => s + Number(p.amount_usd), 0));
  const divisasUsd = byMethod.get("divisas")?.usd ?? 0;
  const cashBs = byMethod.get("bolivares")?.bs ?? 0;
  const pagoMovilBs = byMethod.get("pago_movil")?.bs ?? 0;
  const puntoBs = byMethod.get("punto")?.bs ?? 0;
  const digitalUsd = round2((byMethod.get("pago_movil")?.usd ?? 0) + (byMethod.get("punto")?.usd ?? 0));

  const existingClosing = closings.find((c) => c.day === day) ?? null;

  const [openingUsd, setOpeningUsd] = useState("");
  const [openingBs, setOpeningBs] = useState("");
  const [countedUsd, setCountedUsd] = useState("");
  const [countedBs, setCountedBs] = useState("");
  const [posBatch, setPosBatch] = useState("");
  const [posAmountBs, setPosAmountBs] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (existingClosing) {
      setOpeningUsd(existingClosing.opening_usd ? fmtNum(existingClosing.opening_usd) : "");
      setOpeningBs(existingClosing.opening_bs ? fmtNum(existingClosing.opening_bs) : "");
      setCountedUsd(existingClosing.counted_usd ? fmtNum(existingClosing.counted_usd) : "");
      setCountedBs(existingClosing.counted_bs ? fmtNum(existingClosing.counted_bs) : "");
      setPosBatch(existingClosing.pos_batch ?? "");
      setPosAmountBs(existingClosing.pos_amount_bs ? fmtNum(existingClosing.pos_amount_bs) : "");
      setNote(existingClosing.note ?? "");
    } else {
      setOpeningUsd("");
      setOpeningBs("");
      setCountedUsd("");
      setCountedBs("");
      setPosBatch("");
      setPosAmountBs("");
      setNote("");
    }
  }, [existingClosing, day]);

  const opUsd = parseAmount(openingUsd);
  const opBs = parseAmount(openingBs);
  const cntUsd = parseAmount(countedUsd);
  const cntBs = parseAmount(countedBs);
  const posBs = parseAmount(posAmountBs);

  const expectedUsd = round2(opUsd + divisasUsd);
  const expectedBs = round2(opBs + cashBs);
  const diffUsd = round2(cntUsd - expectedUsd);
  const diffBs = round2(cntBs - expectedBs);
  const diffPos = round2(posBs - puntoBs);

  const saveClosing = useDbMutation(api.saveClosing);
  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const openDoc = docs.find((d) => d.id === docId) ?? null;

  async function submitClosing(e: FormEvent) {
    e.preventDefault();
    try {
      await saveClosing.mutateAsync({
        day,
        opening_usd: opUsd,
        opening_bs: opBs,
        counted_usd: cntUsd,
        counted_bs: cntBs,
        pos_batch: posBatch.trim(),
        pos_amount_bs: posBs,
        note: note.trim(),
      });
      toast.success("Cierre de caja guardado");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function printClosing() {
    const logoUrl = new URL(logo, window.location.origin).href;
    const methodRows = PAYMENT_METHODS.map((m) => {
      const v = byMethod.get(m.key)!;
      return `<tr><td>${escapeHtml(m.label)}</td><td class="r">${v.count}</td><td class="r">${fmtUsd(v.usd)}</td><td class="r">${v.bs > 0 ? fmtBs(v.bs) : "—"}</td></tr>`;
    }).join("");
    printHtml(
      `Cierre de caja ${day}`,
      `<div class="head"><img src="${logoUrl}"><div><h1>${escapeHtml(settings.company_name)}</h1>
       <div class="muted">${escapeHtml(settings.rif)} · ${escapeHtml(settings.phone)}</div></div>
       <div style="margin-left:auto;text-align:right"><h1>Cierre de Caja</h1><div>${fmtDate(day + "T12:00:00")}</div></div></div>
       <h2>Entradas por forma de pago</h2>
       <table><thead><tr><th>Forma de pago</th><th class="r">Operaciones</th><th class="r">USD</th><th class="r">Bolívares</th></tr></thead><tbody>${methodRows}</tbody></table>
       <p class="r tot">Total cobrado: ${fmtUsd(totalUsd)} <span class="muted">(${fmtBs(usdToBs(totalUsd, rate))})</span></p>
       <h2>Cuadre de efectivo y punto</h2>
       <table><tbody>
         <tr><td>Divisas: inicial ${fmtUsd(opUsd)} + cobrado ${fmtUsd(divisasUsd)} = esperado ${fmtUsd(expectedUsd)}</td><td class="r">Contado ${fmtUsd(cntUsd)} · Dif. <b>${fmtUsd(diffUsd)}</b></td></tr>
         <tr><td>Efectivo Bs: inicial ${fmtBs(opBs)} + cobrado ${fmtBs(cashBs)} = esperado ${fmtBs(expectedBs)}</td><td class="r">Contado ${fmtBs(cntBs)} · Dif. <b>${fmtBs(diffBs)}</b></td></tr>
         <tr><td>Punto de venta (Lote ${escapeHtml(posBatch || "—")}): sistema ${fmtBs(puntoBs)}</td><td class="r">Cierre punto ${fmtBs(posBs)} · Dif. <b>${fmtBs(diffPos)}</b></td></tr>
       </tbody></table>
       ${note ? `<p><b>Observaciones:</b> ${escapeHtml(note)}</p>` : ""}`,
    );
  }

  function exportDayCsv() {
    downloadCsv(`caja-${day}.csv`, [
      ["Fecha", "Documento", "Cliente", "Método", "Referencia", "USD", "Bolívares", "Tasa"],
      ...dayPayments.map((p) => {
        const d = p.doc_id ? docById.get(p.doc_id) : null;
        return [
          fmtDateTime(p.created_at),
          d?.number ?? "—",
          d?.client_name ?? "—",
          methodLabel(p.method),
          p.reference || "",
          Number(p.amount_usd),
          Number(p.amount_bs),
          Number(p.rate),
        ];
      }),
    ]);
  }

  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDay(d);
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja del día"
        subtitle="Entradas por forma de pago, cierre del punto de venta y cuadre de efectivo."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={day === today ? "accent" : "outline"} size="sm" onClick={() => setDay(today)}>
              Hoy
            </Button>
            <Button variant={day === yesterday ? "accent" : "outline"} size="sm" onClick={() => setDay(yesterday)}>
              Ayer
            </Button>
            <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-40" />
            <Button variant="outline" size="sm" onClick={exportDayCsv} disabled={dayPayments.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={printClosing}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          tone="panel"
          label="Total cobrado"
          value={fmtUsd(totalUsd)}
          hint={`${dayPayments.length} ${dayPayments.length === 1 ? "cobro" : "cobros"} · ${fmtBs(usdToBs(totalUsd, rate))}`}
        />
        <StatCard label="Divisas (efectivo)" value={fmtUsd(divisasUsd)} hint={`${byMethod.get("divisas")?.count ?? 0} operaciones`} icon={<Banknote className="h-4 w-4" />} />
        <StatCard label="Bolívares (efectivo)" value={fmtBs(cashBs)} hint={`≈ ${fmtUsd(byMethod.get("bolivares")?.usd ?? 0)}`} icon={<Wallet className="h-4 w-4" />} />
        <StatCard
          label="Pago móvil + Punto"
          value={fmtBs(round2(pagoMovilBs + puntoBs))}
          hint={`≈ ${fmtUsd(digitalUsd)}`}
          icon={<CreditCard className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6">
          <Panel title="Desglose por forma de pago">
            <div className="grid gap-3 sm:grid-cols-2">
              {PAYMENT_METHODS.map((m) => {
                const Icon = METHOD_ICON[m.key];
                const v = byMethod.get(m.key)!;
                return (
                  <div key={m.key} className="flex items-center justify-between rounded-xl border bg-muted/30 p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-panel text-accent">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{m.label}</p>
                        <p className="text-xs text-muted-foreground">{v.count} {v.count === 1 ? "pago" : "pagos"}</p>
                      </div>
                    </div>
                    <div className="text-right tabular">
                      <p className="font-display text-2xl font-extrabold">{m.currency === "usd" ? fmtUsd(v.usd) : fmtBs(v.bs)}</p>
                      {m.currency === "bs" && <p className="text-xs text-muted-foreground">{fmtUsd(v.usd)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Movimientos de caja del día" description={`${dayPayments.length} operaciones registradas`}>
            {dayPayments.length === 0 ? (
              <EmptyState icon={<Wallet className="h-7 w-7" />} title="Sin cobros este día">
                Los pagos cobrados en Mostrador, Ventas y Por cobrar aparecerán aquí.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Hora</th>
                      <th className="px-3 py-2">Documento</th>
                      <th className="px-3 py-2">Forma</th>
                      <th className="px-3 py-2 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayPayments.map((p) => {
                      const d = p.doc_id ? docById.get(p.doc_id) : null;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => d && setDocId(d.id)}
                          className={cn("border-t", d && "cursor-pointer hover:bg-muted/50")}
                        >
                          <td className="px-3 py-2 text-xs text-muted-foreground tabular">{fmtDateTime(p.created_at)}</td>
                          <td className="px-3 py-2">
                            <p className="font-semibold">{d?.number ?? "Pago"}</p>
                            <p className="text-xs text-muted-foreground">{d?.client_name ?? "—"}</p>
                          </td>
                          <td className="px-3 py-2">
                            <span>{methodLabel(p.method)}</span>
                            {p.reference && <p className="text-xs text-muted-foreground">Ref. {p.reference}</p>}
                          </td>
                          <td className="px-3 py-2 text-right tabular">
                            <p className="font-semibold">{fmtUsd(p.amount_usd)}</p>
                            {Number(p.amount_bs) > 0 && <p className="text-xs text-muted-foreground">{fmtBs(p.amount_bs)}</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel
          title="Cierre y cuadre del día"
          description={existingClosing ? `Último cierre guardado: ${fmtDateTime(existingClosing.closed_at)}` : "Registra el conteo físico y el lote del punto."}
          actions={
            existingClosing ? (
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Cerrado
              </Badge>
            ) : undefined
          }
        >
          <form onSubmit={submitClosing} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="opUsd">Fondo inicial ($)</Label>
                <Input id="opUsd" inputMode="decimal" placeholder="0,00" className="tabular" value={openingUsd} onChange={(e) => setOpeningUsd(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="opBs">Fondo inicial (Bs)</Label>
                <Input id="opBs" inputMode="decimal" placeholder="0,00" className="tabular" value={openingBs} onChange={(e) => setOpeningBs(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cntUsd">Efectivo contado ($)</Label>
                <Input id="cntUsd" inputMode="decimal" placeholder="0,00" className="tabular" value={countedUsd} onChange={(e) => setCountedUsd(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cntBs">Efectivo contado (Bs)</Label>
                <Input id="cntBs" inputMode="decimal" placeholder="0,00" className="tabular" value={countedBs} onChange={(e) => setCountedBs(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="posBatch">Nro. lote del punto</Label>
                <Input id="posBatch" placeholder="Ej. 042" value={posBatch} onChange={(e) => setPosBatch(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="posBs">Cierre de punto (Bs)</Label>
                <Input id="posBs" inputMode="decimal" placeholder="0,00" className="tabular" value={posAmountBs} onChange={(e) => setPosAmountBs(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
              <DiffRow label="Divisas ($)" expected={fmtUsd(expectedUsd)} counted={fmtUsd(cntUsd)} diff={diffUsd} fmt={fmtUsd} />
              <DiffRow label="Efectivo (Bs)" expected={fmtBs(expectedBs)} counted={fmtBs(cntBs)} diff={diffBs} fmt={fmtBs} />
              <DiffRow label="Punto de venta (Bs)" expected={fmtBs(puntoBs)} counted={fmtBs(posBs)} diff={diffPos} fmt={fmtBs} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="closingNote">Observaciones</Label>
              <Textarea id="closingNote" rows={2} placeholder="Novedades del turno, billetes dañados, etc." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={saveClosing.isPending}>
              {saveClosing.isPending ? "Guardando cierre…" : existingClosing ? "Actualizar cierre" : "Guardar cierre del día"}
            </Button>
          </form>
        </Panel>
      </div>

      {closings.length > 0 && (
        <Panel title="Historial de cierres">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Día</th>
                  <th className="px-3 py-2 text-right">Contado $</th>
                  <th className="px-3 py-2 text-right">Contado Bs</th>
                  <th className="px-3 py-2">Lote punto</th>
                  <th className="px-3 py-2 text-right">Cierre punto</th>
                  <th className="px-3 py-2">Nota</th>
                </tr>
              </thead>
              <tbody>
                {closings.slice(0, 20).map((c) => (
                  <tr key={c.id} onClick={() => setDay(c.day)} className={cn("cursor-pointer border-t hover:bg-muted/50", c.day === day && "bg-accent/15")}>
                    <td className="px-3 py-2 font-semibold">{fmtDate(c.day + "T12:00:00")}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtUsd(c.counted_usd)}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtBs(c.counted_bs)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.pos_batch || "—"}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtBs(c.pos_amount_bs)}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">{c.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <DocDialog doc={openDoc} onOpenChange={(v) => !v && setDocId(null)} />
    </div>
  );
}

function DiffRow({
  label,
  expected,
  counted,
  diff,
  fmt,
}: {
  label: string;
  expected: string;
  counted: string;
  diff: number;
  fmt: (n: number) => string;
}) {
  const ok = Math.abs(diff) < 0.01;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground tabular">Esperado {expected} · Contado {counted}</p>
      </div>
      <Badge variant={ok ? "success" : diff > 0 ? "info" : "danger"} className="tabular">
        {ok ? "Cuadrado" : diff > 0 ? `Sobra ${fmt(diff)}` : `Falta ${fmt(Math.abs(diff))}`}
      </Badge>
    </div>
  );
}
