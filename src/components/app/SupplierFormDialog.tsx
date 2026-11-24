import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, useDbMutation, type Supplier } from "@/lib/db";
import { packSupplier, unpackSupplier } from "@/lib/meta";

export function SupplierFormDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: Supplier | "new" | null;
  onClose: () => void;
  onSaved?: (supplier: Supplier) => void;
}) {
  const [name, setName] = useState("");
  const [rif, setRif] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [showMore, setShowMore] = useState(false);
  const [contact, setContact] = useState("");
  const [phone2, setPhone2] = useState("");
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");

  const saveSupplier = useDbMutation((row: Record<string, unknown>) => api.upsertReturning("suppliers", row));

  useEffect(() => {
    if (!editing) return;
    if (editing === "new") {
      setName("");
      setRif("");
      setPhone("");
      setAddress("");
      setContact("");
      setPhone2("");
      setEmail("");
      setTerms("");
      setNotes("");
      setShowMore(false);
    } else {
      const parsed = unpackSupplier(editing.address);
      setName(editing.name);
      setRif(editing.rif);
      setPhone(editing.phone);
      setAddress(parsed.address);
      setContact(parsed.meta.contact ?? "");
      setPhone2(parsed.meta.phone2 ?? "");
      setEmail(parsed.meta.email ?? "");
      setTerms(parsed.meta.terms ?? "");
      setNotes(parsed.meta.notes ?? "");
      setShowMore(
        Boolean(parsed.meta.contact || parsed.meta.phone2 || parsed.meta.email || parsed.meta.terms || parsed.meta.notes),
      );
    }
  }, [editing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("El nombre del proveedor es obligatorio.");
      return;
    }
    const packedAddress = packSupplier(address, { contact, phone2, email, terms, notes });
    const payload: Record<string, unknown> = {
      name: name.trim(),
      rif: rif.trim().toUpperCase(),
      phone: phone.trim(),
      address: packedAddress,
    };
    if (editing !== "new" && editing) payload["id"] = editing.id;
    try {
      const saved = await saveSupplier.mutateAsync(payload);
      toast.success(editing === "new" ? "Proveedor registrado" : "Proveedor actualizado");
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
          <DialogTitle className="page-title text-3xl">{editing === "new" ? "Nuevo proveedor" : "Editar proveedor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sfName">Nombre o distribuidora *</Label>
            <Input
              id="sfName"
              required
              placeholder="Ej. Distribuidora Central"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sfRif">RIF (opcional)</Label>
              <Input id="sfRif" placeholder="J-12345678-0" value={rif} onChange={(e) => setRif(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sfPhone">Teléfono / WhatsApp (opcional)</Label>
              <Input id="sfPhone" placeholder="0414-0000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sfAddr">Dirección (opcional)</Label>
            <Input id="sfAddr" placeholder="Zona industrial, local…" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="rounded-xl border p-3">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
            >
              <span>Más datos opcionales (vendedor, correo, condiciones, notas)</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showMore ? "rotate-180" : ""}`} />
            </button>
            {showMore && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="sfContact" className="text-xs">Vendedor / Contacto</Label>
                  <Input id="sfContact" placeholder="Nombre del representante" value={contact} onChange={(e) => setContact(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sfPhone2" className="text-xs">Teléfono alternativo</Label>
                  <Input id="sfPhone2" placeholder="0212-0000000" value={phone2} onChange={(e) => setPhone2(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sfEmail" className="text-xs">Correo electrónico</Label>
                  <Input id="sfEmail" type="email" placeholder="ventas@proveedor.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sfTerms" className="text-xs">Condiciones de pago</Label>
                  <Input id="sfTerms" placeholder="Ej. Contado, 15 días crédito" value={terms} onChange={(e) => setTerms(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="sfNotes" className="text-xs">Rubro / Productos que surte / Notas</Label>
                  <Textarea id="sfNotes" rows={2} placeholder="Ej. Quesos, embutidos, entrega los miércoles…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="accent" disabled={saveSupplier.isPending}>
              {saveSupplier.isPending ? "Guardando…" : "Guardar proveedor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
