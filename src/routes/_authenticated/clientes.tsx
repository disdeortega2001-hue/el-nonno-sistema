import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MessageCircle, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Segmented, StatCard } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { Avatar } from "@/components/app/ClientSelect";
import { ClientFormDialog } from "@/components/app/ClientFormDialog";
import { ConfirmButton } from "@/components/app/ConfirmButton";
import { api, clientsQuery, salesDocsQuery, settingsQuery, useDbMutation, type Client } from "@/lib/db";
import { fmtBs, fmtUsd, round2, usdToBs, whatsappUrl } from "@/lib/format";
import { unpackClient } from "@/lib/meta";
import { clientDebt, creditAvailable } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => pageHead("Clientes", "Clientes al detal y al mayor, crédito y recordatorios de pago."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, clientsQuery, salesDocsQuery]),
  component: Clientes,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function Clientes() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: clients } = useSuspenseQuery(clientsQuery);
  const { data: docs } = useSuspenseQuery(salesDocsQuery);
  const rate = Number(settings.rate);

  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "detal" | "mayor">("all");
  const [editing, setEditing] = useState<Client | "new" | null>(null);

  const deleteClient = useDbMutation((id: string) => api.remove("clients", id));

  const enriched = useMemo(() => {
    const s = q.trim().toLowerCase();
    return clients
      .filter(
        (c) =>
          (kindFilter === "all" || c.kind === kindFilter) &&
          (!s ||
            c.name.toLowerCase().includes(s) ||
            c.rif.toLowerCase().includes(s) ||
            c.phone.toLowerCase().includes(s) ||
            c.address.toLowerCase().includes(s)),
      )
      .map((c) => {
        const debt = clientDebt(docs, c.id);
        const avail = creditAvailable(c.credit_limit, debt);
        const parsed = unpackClient(c.address);
        return { client: c, debt, avail, parsed };
      });
  }, [clients, docs, q, kindFilter]);

  const totalDebt = round2(enriched.reduce((s, x) => s + x.debt, 0));
  const withCredit = clients.filter((c) => Number(c.credit_limit) > 0 && c.active).length;

  function reminderUrl(c: Client, debt: number) {
    const text = [
      `Hola ${c.name.split(" ")[0]}, le saluda ${settings.company_name}.`,
      `Le recordamos su saldo pendiente de *${fmtUsd(debt)}* (${fmtBs(usdToBs(debt, rate))} a la tasa BCV de hoy).`,
      "¡Muchas gracias!",
    ].join("\n");
    return whatsappUrl(c.phone, text);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientes"
        subtitle="Cartera de clientes al detal y al mayor, límites de crédito y recordatorios por WhatsApp."
        actions={
          <Button variant="accent" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard tone="panel" label="Clientes activos" value={String(clients.filter((c) => c.active).length)} hint={`de ${clients.length} registrados`} />
        <StatCard label="Con crédito" value={String(withCredit)} hint="Límite mayor a $ 0" />
        <StatCard tone={totalDebt > 0 ? "danger" : "default"} label="Saldo por cobrar" value={fmtUsd(totalDebt)} hint={fmtBs(usdToBs(totalDebt, rate))} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, RIF, teléfono, contacto o zona…" className="pl-9" />
        </div>
        <Segmented
          value={kindFilter}
          onChange={setKindFilter}
          options={[
            { value: "all", label: "Todos" },
            { value: "detal", label: "Detal" },
            { value: "mayor", label: "Mayor" },
          ]}
        />
      </div>

      {enriched.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="No hay clientes aquí">
          Agrega tu primer cliente para venderle a crédito o apartar pedidos.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Contacto</th>
                <th className="px-4 py-2.5 text-right">Límite crédito</th>
                <th className="px-4 py-2.5 text-right">Deuda actual</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map(({ client: c, debt, avail, parsed }) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{c.name}</span>
                          {!c.active && <Badge variant="muted">Inactivo</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {c.rif || "Sin RIF"}
                          {parsed.meta.zone ? ` · ${parsed.meta.zone}` : ""}
                          {parsed.address ? ` · ${parsed.address}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={c.kind === "mayor" ? "info" : "muted"} className="capitalize">
                      {c.kind}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    <p>{c.phone || "—"}</p>
                    {(parsed.meta.contact || parsed.meta.email) && (
                      <p className="text-xs">{[parsed.meta.contact, parsed.meta.email].filter(Boolean).join(" · ")}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {Number(c.credit_limit) > 0 ? (
                      <>
                        <p className="font-semibold">{fmtUsd(c.credit_limit)}</p>
                        <p className="text-[11px] text-muted-foreground">{c.credit_days} días · disp. {fmtUsd(avail)}</p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Solo contado</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {debt > 0 ? <span className="font-bold text-destructive">{fmtUsd(debt)}</span> : <span className="text-muted-foreground">$ 0,00</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {debt > 0 && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={reminderUrl(c, debt)} target="_blank" rel="noreferrer">
                            <MessageCircle className="h-3.5 w-3.5" /> Recordar
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmButton
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        title={`¿Eliminar a ${c.name}?`}
                        description="Si el cliente ya tiene facturas, desactívalo en lugar de eliminarlo."
                        confirmLabel="Eliminar"
                        onConfirm={async () => {
                          try {
                            await deleteClient.mutateAsync(c.id);
                            toast.success("Cliente eliminado");
                          } catch (err) {
                            toast.error("No se puede eliminar porque tiene documentos asociados.");
                            throw err;
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClientFormDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
