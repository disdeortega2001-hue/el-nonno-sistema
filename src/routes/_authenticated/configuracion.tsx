import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, RefreshCw, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Panel, Segmented } from "@/components/app/ui-bits";
import { ensureAll, pageHead, RouteError, RouteNotFound } from "@/components/app/route-bits";
import { BUILTIN_CATEGORY_IMAGES, CategoryImage } from "@/components/app/CategoryImage";
import { ConfirmButton } from "@/components/app/ConfirmButton";
import {
  api,
  categoriesQuery,
  meQuery,
  profilesQuery,
  rolesQuery,
  settingsQuery,
  useDbMutation,
  type Category,
} from "@/lib/db";
import { fetchBcvRate } from "@/lib/bcv.functions";
import { fmtDateTime, fmtNum, fmtRate, parseAmount } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => pageHead("Configuración", "Tasa BCV, datos de la empresa, categorías y usuarios."),
  loader: ({ context }) => ensureAll(context.queryClient, [settingsQuery, categoriesQuery, profilesQuery, rolesQuery, meQuery]),
  component: Configuracion,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

type Tab = "tasa" | "empresa" | "categorias" | "usuarios";

function Configuracion() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const { data: profiles } = useSuspenseQuery(profilesQuery);
  const { data: roles } = useSuspenseQuery(rolesQuery);
  const { data: me } = useSuspenseQuery(meQuery);

  const [tab, setTab] = useState<Tab>("tasa");

  // --- Tasa BCV ---
  const [rateSource, setRateSource] = useState<"bcv" | "manual">(settings.rate_source === "manual" ? "manual" : "bcv");
  const [manualRate, setManualRate] = useState(fmtNum(settings.rate, 4));
  const [fetchingBcv, setFetchingBcv] = useState(false);
  const getBcvRate = useServerFn(fetchBcvRate);
  const saveSettings = useDbMutation(api.updateSettings);

  async function syncBcvNow() {
    setFetchingBcv(true);
    try {
      const res = await getBcvRate();
      if (!res.rate) {
        toast.error(res.error ?? "No se pudo consultar el BCV");
        return;
      }
      await saveSettings.mutateAsync({
        rate: res.rate,
        rate_source: "bcv",
        rate_updated_at: new Date().toISOString(),
      });
      setRateSource("bcv");
      setManualRate(fmtNum(res.rate, 4));
      toast.success(`Tasa BCV actualizada: ${fmtRate(res.rate)}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setFetchingBcv(false);
    }
  }

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    const n = parseAmount(manualRate);
    if (n <= 0) {
      toast.error("La tasa debe ser mayor a cero.");
      return;
    }
    try {
      await saveSettings.mutateAsync({
        rate: n,
        rate_source: rateSource,
        rate_updated_at: new Date().toISOString(),
      });
      toast.success("Tasa guardada");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // --- Empresa ---
  const [companyName, setCompanyName] = useState(settings.company_name);
  const [rif, setRif] = useState(settings.rif);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [priceListNote, setPriceListNote] = useState(settings.price_list_note);

  async function submitCompany(e: FormEvent) {
    e.preventDefault();
    try {
      await saveSettings.mutateAsync({
        company_name: companyName.trim(),
        rif: rif.trim(),
        phone: phone.trim(),
        address: address.trim(),
        price_list_note: priceListNote.trim(),
      });
      toast.success("Datos de la empresa guardados");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // --- Categorías ---
  const [editingCat, setEditingCat] = useState<Category | "new" | null>(null);
  const [catName, setCatName] = useState("");
  const [catSort, setCatSort] = useState("1");
  const [catImageKey, setCatImageKey] = useState<string>("viveres");
  const [catImageUrl, setCatImageUrl] = useState("");
  const saveCategory = useDbMutation((row: Record<string, unknown>) => api.upsert("categories", row));
  const deleteCategory = useDbMutation((id: string) => api.remove("categories", id));

  function openNewCat() {
    setEditingCat("new");
    setCatName("");
    setCatSort(String((categories.length + 1) * 10));
    setCatImageKey("viveres");
    setCatImageUrl("");
  }

  function openEditCat(c: Category) {
    setEditingCat(c);
    setCatName(c.name);
    setCatSort(String(c.sort));
    setCatImageKey(c.image_key ?? "none");
    setCatImageUrl(c.image_url ?? "");
  }

  async function submitCategory(e: FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    const payload: Record<string, unknown> = {
      name: catName.trim(),
      sort: Math.round(parseAmount(catSort)),
      image_key: catImageKey === "none" ? null : catImageKey,
      image_url: catImageUrl.trim() || null,
    };
    if (editingCat !== "new" && editingCat) payload["id"] = editingCat.id;
    try {
      await saveCategory.mutateAsync(payload);
      toast.success(editingCat === "new" ? "Categoría creada" : "Categoría actualizada");
      setEditingCat(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // --- Usuarios ---
  const [myName, setMyName] = useState(me?.profile?.display_name ?? "");
  const saveMyName = useDbMutation((name: string) => api.updateMyName(me!.id, name));
  const toggleActive = useDbMutation((v: { userId: string; active: boolean }) => api.setMemberActive(v.userId, v.active));
  const toggleAdmin = useDbMutation((v: { userId: string; admin: boolean }) => api.setAdmin(v.userId, v.admin));

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" subtitle="Tasa del dólar BCV, datos del negocio, categorías y permisos de usuarios." />

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "tasa", label: "Tasa BCV" },
          { value: "empresa", label: "Empresa" },
          { value: "categorias", label: "Categorías" },
          { value: "usuarios", label: "Usuarios" },
        ]}
      />

      {tab === "tasa" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-gradient-panel p-6 text-panel-foreground shadow-card">
            <p className="eyebrow text-panel-muted">{settings.rate_source === "bcv" ? "Tasa BCV automática" : "Tasa manual"}</p>
            <p className="mt-1 font-display text-5xl font-extrabold text-accent tabular">{fmtRate(settings.rate)}</p>
            <p className="mt-2 text-xs text-panel-muted">Última actualización: {fmtDateTime(settings.rate_updated_at)}</p>
            <Button variant="accent" className="mt-5" onClick={syncBcvNow} disabled={fetchingBcv}>
              <RefreshCw className={`h-4 w-4 ${fetchingBcv ? "animate-spin" : ""}`} />
              {fetchingBcv ? "Consultando BCV…" : "Consultar tasa BCV ahora"}
            </Button>
          </div>

          <Panel title="Modo y ajuste manual" description="El modo automático actualiza la tasa cada hora al usar el sistema.">
            <form onSubmit={saveRate} className="space-y-4">
              <Segmented<"bcv" | "manual">
                value={rateSource}
                onChange={setRateSource}
                options={[
                  { value: "bcv", label: "Automática (BCV)" },
                  { value: "manual", label: "Manual" },
                ]}
              />
              <div className="space-y-1">
                <Label htmlFor="manualRate">Valor (Bs por $)</Label>
                <Input id="manualRate" inputMode="decimal" className="tabular" value={manualRate} onChange={(e) => setManualRate(e.target.value)} />
              </div>
              <Button type="submit" variant="accent" disabled={saveSettings.isPending}>
                {saveSettings.isPending ? "Guardando…" : "Guardar tasa"}
              </Button>
            </form>
          </Panel>
        </div>
      )}

      {tab === "empresa" && (
        <Panel title="Datos de Inversiones El Nonno" description="Aparecen en los documentos impresos y en la lista de precios.">
          <form onSubmit={submitCompany} className="max-w-2xl space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="coName">Nombre de la empresa</Label>
                <Input id="coName" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="coRif">RIF</Label>
                <Input id="coRif" value={rif} onChange={(e) => setRif(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="coPhone">Teléfono</Label>
                <Input id="coPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="coAddr">Dirección</Label>
                <Input id="coAddr" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="coNote">Nota al pie en lista de precios</Label>
              <Textarea id="coNote" rows={2} placeholder="Ej. Precios sujetos a cambio sin previo aviso. Envíos gratis en la zona." value={priceListNote} onChange={(e) => setPriceListNote(e.target.value)} />
            </div>
            <Button type="submit" variant="accent" disabled={saveSettings.isPending}>
              {saveSettings.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        </Panel>
      )}

      {tab === "categorias" && (
        <Panel
          title="Categorías de productos"
          actions={
            <Button variant="accent" size="sm" onClick={openNewCat}>
              <Plus className="h-4 w-4" /> Nueva categoría
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border p-3">
                <div className="flex items-center gap-3">
                  <CategoryImage category={c} className="h-12 w-12 rounded-lg bg-muted p-1" />
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">Orden: {c.sort}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditCat(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <ConfirmButton
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    title={`¿Eliminar categoría ${c.name}?`}
                    confirmLabel="Eliminar"
                    onConfirm={async () => {
                      try {
                        await deleteCategory.mutateAsync(c.id);
                        toast.success("Categoría eliminada");
                      } catch (err) {
                        toast.error((err as Error).message);
                        throw err;
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === "usuarios" && (
        <div className="space-y-6">
          <Panel title="Mi nombre">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!myName.trim() || !me) return;
                try {
                  await saveMyName.mutateAsync(myName.trim());
                  toast.success("Nombre actualizado");
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
              className="flex max-w-md gap-2"
            >
              <Input value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Tu nombre" />
              <Button type="submit" variant="accent" disabled={saveMyName.isPending}>Guardar</Button>
            </form>
          </Panel>

          <Panel
            title="Equipo y aprobaciones"
            description={
              me?.isAdmin
                ? "Activa las cuentas nuevas para que puedan entrar al sistema o asigna permisos de administrador."
                : "Solo los administradores pueden aprobar usuarios o cambiar roles."
            }
          >
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Usuario</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5">Rol</th>
                    {me?.isAdmin && <th className="px-4 py-2.5 text-right">Acceso activo</th>}
                    {me?.isAdmin && <th className="px-4 py-2.5 text-right">Administrador</th>}
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => {
                    const isAdmin = roles.some((r) => r.user_id === p.id && r.role === "admin");
                    const isSelf = p.id === me?.id;
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="px-4 py-2.5">
                          <p className="font-semibold">
                            {p.display_name || "Sin nombre"} {isSelf && <span className="text-xs text-muted-foreground">(tú)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{p.email ?? "—"}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={p.active ? "success" : "warning"}>{p.active ? "Activo" : "Pendiente"}</Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          {isAdmin ? (
                            <Badge variant="info"><Shield className="mr-1 h-3 w-3" /> Admin</Badge>
                          ) : (
                            <Badge variant="muted">Empleado</Badge>
                          )}
                        </td>
                        {me?.isAdmin && (
                          <td className="px-4 py-2.5 text-right">
                            <Switch
                              checked={p.active}
                              disabled={isSelf}
                              onCheckedChange={async (v) => {
                                try {
                                  await toggleActive.mutateAsync({ userId: p.id, active: v });
                                  toast.success(v ? "Usuario aprobado" : "Usuario desactivado");
                                } catch (err) {
                                  toast.error((err as Error).message);
                                }
                              }}
                            />
                          </td>
                        )}
                        {me?.isAdmin && (
                          <td className="px-4 py-2.5 text-right">
                            <Switch
                              checked={isAdmin}
                              disabled={isSelf}
                              onCheckedChange={async (v) => {
                                try {
                                  await toggleAdmin.mutateAsync({ userId: p.id, admin: v });
                                  toast.success(v ? "Ahora es administrador" : "Permiso de admin retirado");
                                } catch (err) {
                                  toast.error((err as Error).message);
                                }
                              }}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      <Dialog open={!!editingCat} onOpenChange={(v) => !v && setEditingCat(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="page-title text-3xl">{editingCat === "new" ? "Nueva categoría" : "Editar categoría"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCategory} className="space-y-4">
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <div className="space-y-1">
                <Label htmlFor="catName">Nombre</Label>
                <Input id="catName" required value={catName} onChange={(e) => setCatName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="catSort">Orden</Label>
                <Input id="catSort" inputMode="numeric" className="tabular" value={catSort} onChange={(e) => setCatSort(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Icono incluido</Label>
              <Select value={catImageKey} onValueChange={setCatImageKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Inicial del nombre</SelectItem>
                  {Object.keys(BUILTIN_CATEGORY_IMAGES).map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="catUrl">O URL de imagen propia (opcional)</Label>
              <Input id="catUrl" placeholder="https://…" value={catImageUrl} onChange={(e) => setCatImageUrl(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingCat(null)}>Cancelar</Button>
              <Button type="submit" variant="accent" disabled={saveCategory.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
