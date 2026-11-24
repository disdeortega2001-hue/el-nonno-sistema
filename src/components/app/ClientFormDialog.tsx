import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/app/ui-bits";
import { api, useDbMutation, type Client } from "@/lib/db";
import { fmtNum, parseAmount, round2 } from "@/lib/format";
import { packClient, unpackClient } from "@/lib/meta";

export function ClientFormDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: Client | "new" | null;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}) {
  const [name, setName] = useState("");
  const [rif, setRif] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<"detal" | "mayor">("detal");
  const [creditLimit, setCreditLimit] = useState("0");
  const [creditDays, setCreditDays] = useState("7");
  const [active, setActive] = useState(true);

  const [showMore, setShowMore] = useState(false);
  const [contact, setContact] = useState("");
  const [phone2, setPhone2] = useState("");
  const [email, setEmail] = useState("");
  const [zone, setZone] = useState("");
  const [notes, setNotes] = useState("");

  const saveClient = useDbMutation((row: Record<string, unknown>) => api.upsertReturning("clients", row));

  useEffect(() => {
    if (!editing) return;
    if (editing === "new") {
      setName("");
      setRif("");
      setPhone("");
      setAddress("");
      setKind("detal");
      setCreditLimit("0");
      setCreditDays("7");
      setActive(true);
      setContact("");
      setPhone2("");
      setEmail("");
      setZone("");
      setNotes("");
      setShowMore(false);
    } else {
      const parsed = unpackClient(editing.address);
      setName(editing.name);
      setRif(editing.rif);
      setPhone(editing.phone);
      setAddress(parsed.address);
      setKind(editing.kind === "mayor" ? "mayor" : "detal");
      setCreditLimit(fmtNum(editing.credit_limit));
      setCreditDays(String(editing.credit_days));
      setActive(editing.active);
      setContact(parsed.meta.contact ?? "");
      setPhone2(parsed.meta.phone2 ?? "");
      setEmail(parsed.meta.email ?? "");
      setZone(parsed.meta.zone ?? "");
      setNotes(parsed.meta.notes ?? "");
      setShowMore(
        Boolean(parsed.meta.contact || parsed.meta.phone2 || parsed.meta.email || parsed.meta.zone || parsed.meta.notes),
      );
    }
  }, [editing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("El nombre del cliente es obligatorio.");
      return;
    }
    const packedAddress = packClient(address, { contact, phone2, email, zone, notes });
    const payload: Record<string, unknown> = {
      name: name.trim(),
      rif: rif.trim().toUpperCase(),
      phone: phone.trim(),
      address: packedAddress,
      kind,
      credit_limit: round2(parseAmount(creditLimit)),
      credit_days: Math.max(0, Math.round(parseAmount(creditDays))),
      active,
    };
    if (editing !== "new" && editing) payload["id"] = editing.id;
    try {
      const saved = await saveClient.mutateAsync(payload);
      toast.success(editing === "new" ? "Cliente registrado" : "Cliente actualizado");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={!!editing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="page-title text-3xl">{editing === "new" ? "Nuevo cliente" : "Editar cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="cfName">Nombre o razón social *</Label>
              <Input
                id="cfName"
                required
                placeholder="Ej. Bodegón La Esquina"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cfRif">RIF / Cédula (opcional)</Label>
              <Input id="cfRif" placeholder="J-12345678-9 o V-12345678" value={rif} onChange={(e) => setRif(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cfPhone">Teléfono / WhatsApp (opcional)</Label>
              <Input id="cfPhone" placeholder="0414-1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cfAddr">Dirección (opcional)</Label>
            <Input id="cfAddr" placeholder="Dirección de entrega o local" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Lista de precios por defecto</Label>
            <Segmented<"detal" | "mayor">
              value={kind}
              onChange={setKind}
              options={[
                { value: "detal", label: "Detal" },
                { value: "mayor", label: "Mayor" },
              ]}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="cfLimit">Límite crédito ($)</Label>
              <Input id="cfLimit" inputMode="decimal" className="tabular" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cfDays">Días de crédito</Label>
              <Input id="cfDays" inputMode="numeric" className="tabular" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:mt-5">
              <Label htmlFor="cfActive" className="font-semibold">
                Activo
              </Label>
              <Switch id="cfActive" checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
            >
              <span>Más datos opcionales (contacto, correo, zona, notas)</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showMore ? "rotate-180" : ""}`} />
            </button>
            {showMore && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="cfContact" className="text-xs">Persona de contacto</Label>
                  <Input id="cfContact" placeholder="Ej. Sr. Carlos" value={contact} onChange={(e) => setContact(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cfPhone2" className="text-xs">Teléfono alternativo</Label>
                  <Input id="cfPhone2" placeholder="0212-0000000" value={phone2} onChange={(e) => setPhone2(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cfEmail" className="text-xs">Correo electrónico</Label>
                  <Input id="cfEmail" type="email" placeholder="cliente@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cfZone" className="text-xs">Zona / Sector / Ruta</Label>
                  <Input id="cfZone" placeholder="Ej. Centro, Mercado..." value={zone} onChange={(e) => setZone(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="cfNotes" className="text-xs">Observaciones</Label>
                  <Textarea id="cfNotes" rows={2} placeholder="Horario de recepción, preferencias…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="accent" disabled={saveClient.isPending}>
              {saveClient.isPending ? "Guardando…" : "Guardar cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
