import { useEffect, useState, type FormEvent } from "react";
import { Calculator, ChevronDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, useDbMutation, type Category, type Product } from "@/lib/db";
import { fmtNum, fmtQty, parseAmount, round2 } from "@/lib/format";
import { packProductPresentations } from "@/lib/meta";
import type { Presentation } from "@/lib/pricing";
import { round3 } from "@/lib/pricing";

interface PresDraft {
  name: string;
  qty: string;
  price_detal: string;
  price_mayor: string;
}

const UNITS = ["und", "kg", "lt", "pq", "cja", "bot", "doc"] as const;

function autoCodeFromName(name: string) {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 4);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${clean || "PROD"}-${rand}`;
}

export function ProductFormDialog({
  editing,
  onClose,
  categories,
  rate = 0,
  onSaved,
}: {
  editing: Product | "new" | null;
  onClose: () => void;
  categories: Category[];
  rate?: number;
  onSaved?: (product: Product) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [unit, setUnit] = useState("und");
  const [cost, setCost] = useState("");
  const [costBs, setCostBs] = useState("");
  const [priceDetal, setPriceDetal] = useState("");
  const [priceMayor, setPriceMayor] = useState("");
  const [stock, setStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [active, setActive] = useState(true);
  const [presList, setPresList] = useState<PresDraft[]>([]);

  const [showMore, setShowMore] = useState(false);
  const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [keepOpen, setKeepOpen] = useState(false);

  const saveProduct = useDbMutation(
    async (v: { payload: Record<string, unknown>; stockDelta?: { productId: string; qty: number } }) => {
      const saved = await api.upsertReturning("products", v.payload);
      if (v.stockDelta && Math.abs(v.stockDelta.qty) > 0.0001) {
        await api.adjustStock({
          productId: v.stockDelta.productId,
          qty: v.stockDelta.qty,
          kind: "ajuste",
          reason: "Ajuste al editar producto",
        });
      }
      return saved;
    },
  );

  function resetForNew() {
    setCode("");
    setName("");
    setCategoryId(categories[0]?.id ?? "none");
    setUnit("und");
    setCost("");
    setCostBs("");
    setPriceDetal("");
    setPriceMayor("");
    setStock("0");
    setMinStock("5");
    setActive(true);
    setPresList([]);
    setBrand("");
    setBarcode("");
    setLocation("");
    setNotes("");
    setShowMore(false);
  }

  useEffect(() => {
    if (!editing) return;
    if (editing === "new") {
      resetForNew();
    } else {
      setCode(editing.code);
      setName(editing.name);
      setCategoryId(editing.category_id ?? "none");
      setUnit(editing.unit || "und");
      setCost(fmtNum(editing.cost));
      setCostBs("");
      setPriceDetal(fmtNum(editing.price_detal));
      setPriceMayor(fmtNum(editing.price_mayor));
      setStock(fmtQty(editing.stock));
      setMinStock(fmtQty(editing.min_stock));
      setActive(editing.active);
      setPresList(
        (editing.presentations ?? []).map((pr) => ({
          name: pr.name,
          qty: String(pr.qty),
          price_detal: fmtNum(pr.price_detal),
          price_mayor: fmtNum(pr.price_mayor),
        })),
      );
      const m = editing.meta ?? {};
      setBrand(m.brand ?? "");
      setBarcode(m.barcode ?? "");
      setLocation(m.location ?? "");
      setNotes(m.notes ?? "");
      setShowMore(Boolean(m.brand || m.barcode || m.location || m.notes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function applyCostBs(bsInput: string) {
    setCostBs(bsInput);
    if (rate > 0) {
      const bs = parseAmount(bsInput);
      if (bs > 0) setCost(fmtNum(round2(bs / rate)));
    }
  }

  function applyMargin(detalPct: number, mayorPct: number) {
    const c = parseAmount(cost);
    if (c <= 0) {
      toast.error("Ingresa primero el costo en $.");
      return;
    }
    setPriceDetal(fmtNum(round2(c * (1 + detalPct / 100))));
    setPriceMayor(fmtNum(round2(c * (1 + mayorPct / 100))));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!name.trim()) {
      toast.error("El nombre del producto es obligatorio.");
      return;
    }

    const finalCode = (code.trim() || autoCodeFromName(name)).toUpperCase();

    const cleanPres: Presentation[] = presList
      .filter((pr) => pr.name.trim() && parseAmount(pr.qty) > 0)
      .map((pr) => ({
        name: pr.name.trim(),
        qty: parseAmount(pr.qty),
        price_detal: round2(parseAmount(pr.price_detal)),
        price_mayor: round2(parseAmount(pr.price_mayor)),
      }));

    const packedPresentations = packProductPresentations(cleanPres, {
      brand,
      barcode,
      location,
      notes,
    });

    const stockVal = Math.max(0, round3(parseAmount(stock)));
    const costVal = round2(parseAmount(cost));
    const detalVal = round2(parseAmount(priceDetal));
    const mayorVal = round2(parseAmount(priceMayor)) || detalVal;

    const payload: Record<string, unknown> = {
      code: finalCode,
      name: name.trim(),
      category_id: categoryId === "none" ? null : categoryId,
      unit: unit.trim() || "und",
      cost: costVal,
      price_detal: detalVal,
      price_mayor: mayorVal,
      min_stock: Math.max(0, round3(parseAmount(minStock))),
      active,
      presentations: packedPresentations,
    };

    let stockDelta: { productId: string; qty: number } | undefined;
    if (editing === "new") {
      payload["stock"] = stockVal;
    } else {
      payload["id"] = editing.id;
      const delta = round3(stockVal - Number(editing.stock));
      if (Math.abs(delta) > 0.0001) {
        stockDelta = { productId: editing.id, qty: delta };
      }
    }

    try {
      const saved = await saveProduct.mutateAsync(stockDelta ? { payload, stockDelta } : { payload });
      const normalized: Product = {
        ...saved,
        presentations: cleanPres,
        meta: {
          ...(brand.trim() ? { brand: brand.trim() } : {}),
          ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      };
      onSaved?.(normalized);
      toast.success(editing === "new" ? "Producto registrado" : "Producto actualizado");
      if (editing === "new" && keepOpen) {
        resetForNew();
      } else {
        onClose();
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const costNum = parseAmount(cost);
  const detalNum = parseAmount(priceDetal);
  const marginDetal = costNum > 0 ? round2(((detalNum - costNum) / costNum) * 100) : null;

  return (
    <Dialog open={!!editing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="page-title text-3xl">
            {editing === "new" ? "Registrar producto" : "Editar producto"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="pfCode">Código (opcional)</Label>
                <button
                  type="button"
                  onClick={() => setCode(autoCodeFromName(name))}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-info hover:underline"
                >
                  <Sparkles className="h-3 w-3" /> Auto
                </button>
              </div>
              <Input id="pfCode" placeholder="Se genera automático si se deja vacío" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="pfName">Nombre *</Label>
              <Input id="pfName" required placeholder="Ej. Queso Blanco Duro" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Categoría</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Unidad base</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="pfCost">Costo ($)</Label>
              <Input id="pfCost" inputMode="decimal" className="tabular" placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)} />
              {rate > 0 && (
                <Input
                  inputMode="decimal"
                  className="h-8 text-xs tabular"
                  placeholder={`Ó costo en Bs (tasa ${fmtNum(rate, 2)})`}
                  value={costBs}
                  onChange={(e) => applyCostBs(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pfDetal">
                Precio detal ($) {marginDetal !== null && <span className="text-xs text-muted-foreground">({marginDetal > 0 ? `+${marginDetal}%` : `${marginDetal}%`})</span>}
              </Label>
              <Input id="pfDetal" inputMode="decimal" className="tabular" placeholder="0,00" value={priceDetal} onChange={(e) => setPriceDetal(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pfMayor">Precio mayor ($)</Label>
              <Input id="pfMayor" inputMode="decimal" className="tabular" placeholder="Igual al detal si vacío" value={priceMayor} onChange={(e) => setPriceMayor(e.target.value)} />
            </div>
          </div>

          {costNum > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
                <Calculator className="h-3.5 w-3.5" /> Calcular precios desde costo:
              </span>
              <button type="button" onClick={() => applyMargin(25, 15)} className="rounded border bg-card px-2 py-0.5 font-semibold hover:border-accent">
                +25% / +15%
              </button>
              <button type="button" onClick={() => applyMargin(30, 20)} className="rounded border bg-card px-2 py-0.5 font-semibold hover:border-accent">
                +30% / +20%
              </button>
              <button type="button" onClick={() => applyMargin(35, 22)} className="rounded border bg-card px-2 py-0.5 font-semibold hover:border-accent">
                +35% / +22%
              </button>
              <button type="button" onClick={() => applyMargin(40, 25)} className="rounded border bg-card px-2 py-0.5 font-semibold hover:border-accent">
                +40% / +25%
              </button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="pfStock">{editing === "new" ? "Existencia inicial" : "Existencia física"}</Label>
              <Input id="pfStock" inputMode="decimal" className="tabular" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pfMin">Stock mínimo</Label>
              <Input id="pfMin" inputMode="decimal" className="tabular" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:mt-5">
              <Label htmlFor="pfActive" className="font-semibold">
                Activo
              </Label>
              <Switch id="pfActive" checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
            >
              <span>Más datos opcionales (marca, código de barras, ubicación, notas)</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showMore ? "rotate-180" : ""}`} />
            </button>
            {showMore && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="pfBrand" className="text-xs">Marca</Label>
                  <Input id="pfBrand" placeholder="Ej. Plumrose, Polar…" value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pfBarcode" className="text-xs">Código de barras / SKU</Label>
                  <Input id="pfBarcode" placeholder="7591234567890" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pfLoc" className="text-xs">Ubicación / Estante</Label>
                  <Input id="pfLoc" placeholder="Ej. Cava 1, Pasillo A" value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="pfNotes" className="text-xs">Descripción / Observaciones</Label>
                  <Textarea id="pfNotes" rows={2} placeholder="Detalles del empaque, peso aproximado, proveedor habitual…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Presentaciones (cajas, bultos, paquetes) — opcional</p>
                <p className="text-xs text-muted-foreground">Permite vender por unidad o por paquete completo en el mostrador.</p>
              </div>
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() => setPresList((l) => [...l, { name: "Caja", qty: "12", price_detal: "", price_mayor: "" }])}
              >
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </div>
            {presList.map((pr, idx) => (
              <div key={idx} className="grid grid-cols-[1.2fr_0.7fr_1fr_1fr_auto] items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    placeholder="Caja"
                    value={pr.name}
                    onChange={(e) => setPresList((l) => l.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unds</Label>
                  <Input
                    inputMode="decimal"
                    className="tabular"
                    value={pr.qty}
                    onChange={(e) => setPresList((l) => l.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Detal $</Label>
                  <Input
                    inputMode="decimal"
                    className="tabular"
                    value={pr.price_detal}
                    onChange={(e) => setPresList((l) => l.map((x, i) => (i === idx ? { ...x, price_detal: e.target.value } : x)))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mayor $</Label>
                  <Input
                    inputMode="decimal"
                    className="tabular"
                    value={pr.price_mayor}
                    onChange={(e) => setPresList((l) => l.map((x, i) => (i === idx ? { ...x, price_mayor: e.target.value } : x)))}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => setPresList((l) => l.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter className="flex-wrap items-center gap-2 sm:justify-between">
            {editing === "new" ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={keepOpen} onCheckedChange={setKeepOpen} />
                Guardar y registrar otro seguido
              </label>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="accent" disabled={saveProduct.isPending}>
                {saveProduct.isPending ? "Guardando…" : editing === "new" ? "Registrar producto" : "Guardar cambios"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
