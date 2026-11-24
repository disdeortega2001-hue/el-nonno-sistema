import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, HandCoins, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { Avatar } from "@/components/app/ClientSelect";
import { DocDialog } from "@/components/app/DocDialog";
import { PaymentDialog } from "@/components/app/PaymentDialog";
import { api, clientsQuery, paymentsQuery, salesDocsQuery, settingsQuery, useDbMutation, type Client, type SalesDoc } from "@/lib/db";
import { fmtBs, fmtDate, fmtUsd, localDay, round2, usdToBs, whatsappUrl } from "@/lib/format";
import { balance } from "@/lib/pricing";
import { distributePayments } from "@/lib/payments";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/por-cobrar")({
  head: () => pageHead("Por cobrar", "Facturas con saldo pendiente, agrupadas por cliente."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, salesDocsQuery, clientsQuery, paymentsQuery]),
  component: PorCobrar,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

interface Group {
  key: string;
  client: Client | null;
  name: string;
  invoices: SalesDoc[];
  owed: number;
  overdue: number;
  oldestDue: string | null;
}

function PorCobrar() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const { data: clients } = useSuspenseQuery(clientsQuery);
  const rate = Number(settings.rate);
  const today = localDay();
  const [open, setOpen] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [paying, setPaying] = useState<Group | null>(null);
  const pay = useDbMutation(async (list: ReturnType<typeof distributePayments>) => {
    for (const p of list) await api.addPayment({ docId: p.docId, method: p.method, amountUsd: p.amount_usd, amountBs: p.amount_bs, rate });
  });

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    const pending = docs
      .filter((d) => d.kind === "factura" && d.status === "pendiente")
      .sort((a, b) => (a.due_date ?? a.created_at).localeCompare(b.due_date ?? b.created_at));
    for (const d of pending) {
      const key = d.client_id ?? "contado";
      const g =
        m.get(key) ??
        ({ key, client: clients.find((c) => c.id === d.client_id) ?? null, name: d.client_name, invoices: [], owed: 0, overdue: 0, oldestDue: null } as Group);
      g.invoices.push(d);
      g.owed = round2(g.owed + balance(d));
      if (d.due_date && d.due_date < today) g.overdue = round2(g.overdue + balance(d));
      if (!g.oldestDue && d.due_date) g.oldestDue = d.due_date;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.overdue - a.overdue || b.owed - a.owed);
  }, [docs, clients, today]);

  const total = groups.reduce((s, g) => s + g.owed, 0);
  const overdue = groups.reduce((s, g) => s + g.overdue, 0);
  const doc = docs.find((d) => d.id === docId) ?? null;

  function reminder(g: Group) {
    const lines = [
      `Hola ${g.name.split(" ")[0]}, le saluda ${settings.company_name}.`,
      `Le recordamos que tiene un saldo pendiente de *${fmtUsd(g.owed)}* (${fmtBs(usdToBs(g.owed, rate))} a la tasa BCV de hoy):`,
      ...g.invoices.map((d) => `• ${d.number} del ${fmtDate(d.created_at)}: ${fmtUsd(balance(d))}${d.due_date ? ` (vence ${fmtDate(d.due_date)})` : ""}`),
      "",
      "¡Muchas gracias!",
    ];
    return whatsappUrl(g.client?.phone ?? "", lines.join("\n"));
  }

  return (
    <div>
      <PageHeader title="Por cobrar" subtitle="Lo que te deben, cliente por cliente. Las vencidas aparecen primero." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard tone="panel" label="Te deben" value={fmtUsd(total)} hint={fmtBs(usdToBs(total, rate))} />
        <StatCard tone={overdue > 0 ? "danger" : "default"} label="Ya vencido" value={fmtUsd(overdue)} hint={overdue > 0 ? "Conviene llamar hoy" : "Nada vencido"} />
        <StatCard label="Clientes que deben" value={String(groups.length)} hint={`${groups.reduce((s, g) => s + g.invoices.length, 0)} facturas pendientes`} />
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<HandCoins className="h-8 w-8" />} title="Nadie te debe nada">
          Cuando vendas a crédito, las facturas aparecerán aquí.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => {
            const expanded = open === g.key;
            return (
              <li key={g.key} className="overflow-hidden rounded-xl border bg-card shadow-card">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button type="button" onClick={() => setOpen(expanded ? null : g.key)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar name={g.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.invoices.length} {g.invoices.length === 1 ? "factura" : "facturas"}
                        {g.oldestDue && ` · la más vieja vence ${fmtDate(g.oldestDue)}`}
                      </p>
                    </div>
                    <ChevronDown className={cn("ml-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                  </button>
                  <div className="text-right">
                    <p className="font-display text-2xl font-extrabold tabular">{fmtUsd(g.owed)}</p>
                    {g.overdue > 0 && <p className="text-xs font-semibold text-destructive tabular">Vencido {fmtUsd(g.overdue)}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={reminder(g)} target="_blank" rel="noreferrer">
                        <MessageCircle className="h-4 w-4" /> Recordar
                      </a>
                    </Button>
                    <Button variant="success" size="sm" onClick={() => setPaying(g)}>
                      Registrar pago
                    </Button>
                  </div>
                </div>
                {expanded && (
                  <table className="w-full border-t text-sm">
                    <tbody>
                      {g.invoices.map((d) => {
                        const late = d.due_date && d.due_date < today;
                        return (
                          <tr key={d.id} onClick={() => setDocId(d.id)} className="cursor-pointer border-t first:border-t-0 hover:bg-muted/50">
                            <td className="px-4 py-2 font-semibold">{d.number}</td>
                            <td className="px-4 py-2 text-muted-foreground">{fmtDate(d.created_at)}</td>
                            <td className={cn("px-4 py-2", late ? "font-semibold text-destructive" : "text-muted-foreground")}>
                              {d.due_date ? `${late ? "Venció" : "Vence"} ${fmtDate(d.due_date)}` : "—"}
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground tabular">de {fmtUsd(d.total_usd)}</td>
                            <td className="px-4 py-2 text-right font-bold tabular">{fmtUsd(balance(d))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <DocDialog doc={doc} onOpenChange={(v) => !v && setDocId(null)} />
      <PaymentDialog
        open={!!paying}
        onOpenChange={(v) => !v && setPaying(null)}
        totalUsd={paying?.owed ?? 0}
        rate={rate}
        title="Registrar pago"
        description={paying ? `${paying.name} · se abona a las facturas más viejas primero` : ""}
        creditOnly
        confirmLabel="Guardar pago"
        onConfirm={async (r) => {
          if (!paying) return;
          try {
            const list = distributePayments(
              paying.invoices.map((d) => ({ id: d.id, balance: balance(d) })),
              r.payments,
            );
            await pay.mutateAsync(list);
            toast.success("Pago registrado");
            setPaying(null);
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}
