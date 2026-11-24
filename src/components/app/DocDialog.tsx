import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Printer, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "./ConfirmButton";
import { PaymentDialog } from "./PaymentDialog";
import { StatusBadge } from "./ui-bits";
import {
  api,
  clientsQuery,
  DOC_KIND_LABEL,
  paymentsQuery,
  settingsQuery,
  useDbMutation,
  type Client,
  type Payment,
  type SalesDoc,
  type Settings,
} from "@/lib/db";
import { useRate } from "@/lib/hooks";
import { fmtBs, fmtDate, fmtDateTime, fmtQty, fmtUsd, usdToBs, whatsappUrl } from "@/lib/format";
import { unpackClient } from "@/lib/meta";
import { balance, methodLabel } from "@/lib/pricing";
import { escapeHtml, printHtml, printTicketHtml } from "@/lib/print";
import logo from "@/assets/nonno-logo.webp";

export function docText(doc: SalesDoc, settings: Settings | undefined, rate: number) {
  const lines = [
    `*${settings?.company_name ?? "El Nonno"}*`,
    `${DOC_KIND_LABEL[doc.kind]} ${doc.number} · ${fmtDate(doc.created_at)}`,
    `Cliente: ${doc.client_name}`,
    "",
    ...doc.items.map(
      (i) => `• ${fmtQty(i.count)} ${i.presentation ? i.presentation : i.unit} ${i.name} — ${fmtUsd(i.line_total)}`,
    ),
    "",
    `*Total: ${fmtUsd(doc.total_usd)}* (${fmtBs(usdToBs(Number(doc.total_usd), rate))})`,
  ];
  if (doc.kind === "factura" && balance(doc) > 0) lines.push(`Pendiente: ${fmtUsd(balance(doc))}`);
  lines.push(`Tasa BCV: Bs ${rate.toLocaleString("de-DE", { maximumFractionDigits: 4 })}`);
  return lines.join("\n");
}

export function printDoc(
  doc: SalesDoc,
  settings: Settings | undefined,
  options?: { format?: "carta" | "ticket" | undefined; client?: Client | undefined; payments?: Payment[] | undefined },
) {
  const format = options?.format ?? "carta";
  const client = options?.client;
  const clientAddress = client ? unpackClient(client.address).address : "";
  const docPayments = options?.payments ?? [];
  const docRate = Number(doc.rate) || Number(settings?.rate ?? 1);
  const owed = balance(doc);

  if (format === "ticket") {
    const itemRows = doc.items
      .map((i) => {
        const label = `${escapeHtml(i.name)}${i.presentation ? ` (${escapeHtml(i.presentation)} x${fmtQty(i.pres_qty)})` : ""}`;
        return `<tr>
          <td colspan="3" class="b">${label}</td>
        </tr>
        <tr>
          <td class="muted">${fmtQty(i.count)} x ${fmtUsd(i.price)}</td>
          <td></td>
          <td class="r b">${fmtUsd(i.line_total)}</td>
        </tr>`;
      })
      .join("");

    const payRows = docPayments
      .map(
        (p) =>
          `<tr><td>${escapeHtml(methodLabel(p.method))}</td><td class="r">${fmtUsd(p.amount_usd)}${Number(p.amount_bs) > 0 ? ` (${fmtBs(p.amount_bs)})` : ""}</td></tr>`,
      )
      .join("");

    printTicketHtml(
      `${DOC_KIND_LABEL[doc.kind]} ${doc.number}`,
      `<div class="c">
        <p class="title">${escapeHtml(settings?.company_name ?? "El Nonno")}</p>
        ${settings?.rif ? `<div class="muted">RIF: ${escapeHtml(settings.rif)}</div>` : ""}
        ${settings?.phone ? `<div class="muted">Tel: ${escapeHtml(settings.phone)}</div>` : ""}
        ${settings?.address ? `<div class="muted">${escapeHtml(settings.address)}</div>` : ""}
        <div class="hr"></div>
        <p class="doc">${escapeHtml(DOC_KIND_LABEL[doc.kind] ?? doc.kind)} ${escapeHtml(doc.number)}</p>
        <div class="muted">${fmtDateTime(doc.created_at)}</div>
      </div>
      <div class="hr"></div>
      <div><b>Cliente:</b> ${escapeHtml(doc.client_name)}</div>
      ${client?.rif ? `<div class="muted">RIF/CI: ${escapeHtml(client.rif)}</div>` : ""}
      ${client?.phone ? `<div class="muted">Tel: ${escapeHtml(client.phone)}</div>` : ""}
      <div><b>Pago:</b> ${doc.payment_type === "credito" ? "Crédito" : "Contado"}${doc.due_date ? ` · Vence: ${fmtDate(doc.due_date)}` : ""}</div>
      <div class="hr"></div>
      <table>
        <thead><tr><th>Descripción</th><th></th><th class="r">Total</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="hr"></div>
      <table>
        <tr><td class="tot">TOTAL USD</td><td class="r tot">${fmtUsd(doc.total_usd)}</td></tr>
        <tr><td class="muted">TOTAL BS</td><td class="r muted">${fmtBs(usdToBs(Number(doc.total_usd), docRate))}</td></tr>
        <tr><td class="muted">Tasa BCV</td><td class="r muted">Bs ${docRate.toLocaleString("de-DE", { maximumFractionDigits: 4 })}</td></tr>
      </table>
      ${payRows ? `<div class="hr"></div><div class="b">Pagos recibidos</div><table><tbody>${payRows}</tbody></table>` : ""}
      ${doc.kind === "factura" && owed > 0 ? `<div class="hr"></div><div class="r b">SALDO PENDIENTE: ${fmtUsd(owed)}</div>` : ""}
      ${doc.note ? `<div class="hr"></div><div class="muted">Nota: ${escapeHtml(doc.note)}</div>` : ""}
      <div class="hr"></div>
      <div class="c muted">¡Gracias por su compra!</div>`,
    );
    return;
  }

  const rows = doc.items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.code)}</td><td>${escapeHtml(i.name)}${i.presentation ? ` <span class="muted">(${escapeHtml(i.presentation)} x${fmtQty(i.pres_qty)})</span>` : ""}</td><td class="r">${fmtQty(i.count)}</td><td class="r">${fmtUsd(i.price)}</td><td class="r">${fmtUsd(i.line_total)}</td></tr>`,
    )
    .join("");
  const logoUrl = new URL(logo, window.location.origin).href;
  const paySummary = docPayments.length
    ? `<h2>Pagos recibidos</h2><table><tbody>${docPayments
        .map(
          (p) =>
            `<tr><td>${escapeHtml(methodLabel(p.method))} · <span class="muted">${fmtDateTime(p.created_at)}</span></td><td class="r">${fmtUsd(p.amount_usd)}${Number(p.amount_bs) > 0 ? ` <span class="muted">(${fmtBs(p.amount_bs)})</span>` : ""}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  printHtml(
    `${DOC_KIND_LABEL[doc.kind]} ${doc.number}`,
    `<div class="head"><img src="${logoUrl}"><div><h1>${escapeHtml(settings?.company_name ?? "El Nonno")}</h1>
     <div class="muted">${escapeHtml(settings?.rif ?? "")} · ${escapeHtml(settings?.phone ?? "")} · ${escapeHtml(settings?.address ?? "")}</div></div>
     <div style="margin-left:auto;text-align:right"><h1>${DOC_KIND_LABEL[doc.kind]}</h1><div>${doc.number}</div><div class="muted">${fmtDate(doc.created_at)}</div></div></div>
     <p><b>Cliente:</b> ${escapeHtml(doc.client_name)}${client?.rif ? ` · <b>RIF/CI:</b> ${escapeHtml(client.rif)}` : ""}${client?.phone ? ` · <b>Tel:</b> ${escapeHtml(client.phone)}` : ""}${clientAddress ? ` · <b>Dir:</b> ${escapeHtml(clientAddress)}` : ""}<br>
     <b>Condición:</b> ${doc.payment_type === "credito" ? "Crédito" : "Contado"}${doc.due_date ? ` · <b>Vence:</b> ${fmtDate(doc.due_date)}` : ""}</p>
     <table><thead><tr><th>Código</th><th>Producto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
     <p class="r tot">Total ${fmtUsd(doc.total_usd)}</p>
     <p class="r muted">${fmtBs(usdToBs(Number(doc.total_usd), docRate))} · Tasa Bs ${docRate.toLocaleString("de-DE", { maximumFractionDigits: 4 })}</p>
     ${doc.kind === "factura" && owed > 0 ? `<p class="r"><b>Pagado:</b> ${fmtUsd(doc.paid_usd)} · <b>Saldo pendiente:</b> ${fmtUsd(owed)}</p>` : ""}
     ${paySummary}
     ${doc.note ? `<p><b>Nota:</b> ${escapeHtml(doc.note)}</p>` : ""}`,
  );
}

/** Detail of a cotización / pedido / factura with every action it allows. */
export function DocDialog({ doc, onOpenChange }: { doc: SalesDoc | null; onOpenChange: (v: boolean) => void }) {
  const rate = useRate();
  const { data: settings } = useQuery(settingsQuery);
  const { data: payments = [] } = useQuery(paymentsQuery);
  const { data: clients = [] } = useQuery(clientsQuery);
  const [pay, setPay] = useState<null | "facturar" | "abonar">(null);
  const mConvert = useDbMutation(api.convertDoc);
  const mCancel = useDbMutation(api.cancelDoc);
  const mPay = useDbMutation(async (v: { docId: string; list: { method: string; amount_usd: number; amount_bs: number }[] }) => {
    for (const p of v.list) await api.addPayment({ docId: v.docId, method: p.method, amountUsd: p.amount_usd, amountBs: p.amount_bs, rate });
  });

  if (!doc) return null;
  const client = clients.find((c) => c.id === doc.client_id);
  const docPayments = payments.filter((p) => p.doc_id === doc.id);
  const owed = balance(doc);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  }

  return (
    <>
      <Dialog open={!!doc && !pay} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <p className="eyebrow text-muted-foreground">{DOC_KIND_LABEL[doc.kind]}</p>
            <DialogTitle className="page-title flex flex-wrap items-center gap-3 text-3xl">
              {doc.number} <StatusBadge status={doc.status} />
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <p className="eyebrow text-muted-foreground">Cliente</p>
              <p className="font-semibold">{doc.client_name}</p>
              <p className="text-xs text-muted-foreground">{doc.price_kind === "mayor" ? "Precios al mayor" : "Precios al detal"}</p>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Fecha</p>
              <p className="font-semibold">{fmtDateTime(doc.created_at)}</p>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Pago</p>
              <p className="font-semibold">{doc.payment_type === "credito" ? "Crédito" : "Contado"}</p>
              {doc.due_date && doc.kind === "factura" && <p className="text-xs text-muted-foreground">Vence {fmtDate(doc.due_date)}</p>}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((i) => (
                  <tr key={i.product_id + (i.presentation ?? "")} className="border-t">
                    <td className="px-3 py-2">
                      {i.name}
                      {i.presentation && <span className="text-xs text-muted-foreground"> · {i.presentation} x{fmtQty(i.pres_qty)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{fmtQty(i.count)}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtUsd(i.price)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular">{fmtUsd(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-gradient-panel p-4 text-panel-foreground">
            <div>
              <p className="eyebrow text-panel-muted">Total</p>
              <p className="font-display text-3xl font-extrabold text-accent tabular">{fmtUsd(doc.total_usd)}</p>
              <p className="text-xs text-panel-muted tabular">{fmtBs(usdToBs(Number(doc.total_usd), rate))} a la tasa de hoy</p>
            </div>
            {doc.kind === "factura" && (
              <div className="text-right text-sm">
                <p className="tabular">Pagado {fmtUsd(doc.paid_usd)}</p>
                <p className="font-bold tabular text-accent">Debe {fmtUsd(owed)}</p>
              </div>
            )}
          </div>

          {doc.note && <p className="text-sm"><b>Nota:</b> {doc.note}</p>}

          {docPayments.length > 0 && (
            <div>
              <p className="eyebrow mb-1 text-muted-foreground">Pagos recibidos</p>
              <ul className="divide-y rounded-lg border text-sm">
                {docPayments.map((p) => (
                  <li key={p.id} className="flex justify-between px-3 py-2">
                    <span>
                      {methodLabel(p.method)} · <span className="text-muted-foreground">{fmtDateTime(p.created_at)}</span>
                    </span>
                    <span className="font-semibold tabular">
                      {fmtUsd(p.amount_usd)}
                      {Number(p.amount_bs) > 0 && <span className="ml-1 text-xs text-muted-foreground">({fmtBs(p.amount_bs)})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => printDoc(doc, settings, { format: "ticket", client, payments: docPayments })}>
              <Receipt className="h-4 w-4" /> Imprimir Ticket
            </Button>
            <Button variant="outline" onClick={() => printDoc(doc, settings, { format: "carta", client, payments: docPayments })}>
              <Printer className="h-4 w-4" /> Imprimir Carta
            </Button>
            <Button variant="outline" asChild>
              <a href={whatsappUrl(client?.phone ?? "", docText(doc, settings, rate))} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
            <div className="ml-auto flex flex-wrap gap-2">
              {doc.kind === "cotizacion" && doc.status === "abierta" && (
                <>
                  <ConfirmButton variant="ghost" title="¿Cancelar esta cotización?" onConfirm={() => run(() => mCancel.mutateAsync(doc.id), "Cotización cancelada")}>
                    Cancelar
                  </ConfirmButton>
                  <ConfirmButton
                    variant="soft"
                    title="¿Pasar a pedido?"
                    description="La mercancía queda apartada hasta que se facture."
                    onConfirm={() => run(() => mConvert.mutateAsync({ docId: doc.id, toKind: "pedido", paymentType: "contado", rate }), "Pedido creado")}
                  >
                    Pasar a pedido
                  </ConfirmButton>
                  <Button variant="accent" onClick={() => setPay("facturar")}>Facturar</Button>
                </>
              )}
              {doc.kind === "pedido" && doc.status === "por_facturar" && (
                <>
                  <ConfirmButton variant="ghost" title="¿Cancelar este pedido?" description="La mercancía apartada vuelve a estar disponible." onConfirm={() => run(() => mCancel.mutateAsync(doc.id), "Pedido cancelado")}>
                    Cancelar pedido
                  </ConfirmButton>
                  <Button variant="accent" onClick={() => setPay("facturar")}>Facturar</Button>
                </>
              )}
              {doc.kind === "factura" && doc.status !== "anulada" && (
                <>
                  <ConfirmButton
                    variant="ghost"
                    className="text-destructive"
                    title="¿Anular esta factura?"
                    description="La mercancía regresa al inventario y se borran sus pagos."
                    confirmLabel="Sí, anular"
                    onConfirm={() => run(() => mCancel.mutateAsync(doc.id), "Factura anulada")}
                  >
                    Anular
                  </ConfirmButton>
                  {doc.status === "pendiente" && <Button variant="success" onClick={() => setPay("abonar")}>Registrar pago</Button>}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        open={pay === "facturar"}
        onOpenChange={(v) => !v && setPay(null)}
        totalUsd={Number(doc.total_usd)}
        rate={rate}
        title={`Facturar ${doc.number}`}
        description={doc.client_name}
        allowCredit={!!doc.client_id}
        confirmLabel="Facturar"
        onConfirm={async (r) => {
          try {
            await mConvert.mutateAsync({ docId: doc.id, toKind: "factura", paymentType: r.paymentType, payments: r.payments, rate });
            toast.success("Factura emitida");
            setPay(null);
            onOpenChange(false);
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
      <PaymentDialog
        open={pay === "abonar"}
        onOpenChange={(v) => !v && setPay(null)}
        totalUsd={owed}
        rate={rate}
        title="Registrar pago"
        description={`${doc.number} · ${doc.client_name}`}
        creditOnly
        confirmLabel="Guardar pago"
        onConfirm={async (r) => {
          try {
            await mPay.mutateAsync({ docId: doc.id, list: r.payments });
            toast.success("Pago registrado");
            setPay(null);
            onOpenChange(false);
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </>
  );
}
