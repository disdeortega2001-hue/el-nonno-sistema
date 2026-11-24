import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Home,
  Store,
  ReceiptText,
  HandCoins,
  Wallet,
  Package,
  Tags,
  Boxes,
  Truck,
  Users,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  Clock,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api, meQuery, settingsQuery } from "@/lib/db";
import { fetchBcvRate } from "@/lib/bcv.functions";
import { fmtRate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageLoading } from "./ui-bits";
import logo from "@/assets/nonno-logo.webp";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }> };
const NAV: { section?: string; items: NavItem[] }[] = [
  { items: [{ to: "/inicio", label: "Inicio", icon: Home }] },
  {
    section: "Vender",
    items: [
      { to: "/mostrador", label: "Mostrador", icon: Store },
      { to: "/ventas", label: "Ventas", icon: ReceiptText },
      { to: "/por-cobrar", label: "Por cobrar", icon: HandCoins },
      { to: "/caja", label: "Caja del día", icon: Wallet },
    ],
  },
  {
    section: "Mercancía",
    items: [
      { to: "/productos", label: "Productos", icon: Package },
      { to: "/lista-precios", label: "Lista de precios", icon: Tags },
      { to: "/inventario", label: "Inventario", icon: Boxes },
      { to: "/compras", label: "Compras", icon: Truck },
    ],
  },
  {
    section: "Más",
    items: [
      { to: "/clientes", label: "Clientes", icon: Users },
      { to: "/reportes", label: "Reportes", icon: BarChart3 },
      { to: "/configuracion", label: "Configuración", icon: SettingsIcon },
    ],
  },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {NAV.map((group, gi) => (
        <div key={gi}>
          {group.section && <p className="eyebrow mb-1.5 px-3 text-sidebar-muted">{group.section}</p>}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = path === item.to || path.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/inicio" className="flex items-center gap-3 px-5 py-5">
      <img src={logo} alt="El Nonno" className="h-11 w-11 rounded-full ring-2 ring-sidebar-primary/60" />
      <div>
        <p className="font-display text-2xl font-extrabold uppercase leading-none tracking-wide text-sidebar-primary">El Nonno</p>
        <p className="text-[11px] text-sidebar-muted">Todo para surtir tu negocio</p>
      </div>
    </Link>
  );
}

/** Keeps the BCV rate fresh: refreshes automatically when it is older than 1 hour (unless set by hand). */
function useAutoBcv() {
  const { data: settings } = useQuery(settingsQuery);
  const qc = useQueryClient();
  const getRate = useServerFn(fetchBcvRate);
  const done = useRef(false);
  useEffect(() => {
    if (!settings || done.current) return;
    if (settings.rate_source !== "bcv") return;
    const age = Date.now() - new Date(settings.rate_updated_at).getTime();
    if (age < 60 * 60 * 1000) return;
    done.current = true;
    getRate()
      .then(async (r) => {
        if (!r.rate) return;
        await api.updateSettings({ rate: r.rate, rate_updated_at: new Date().toISOString() });
        qc.invalidateQueries({ queryKey: ["db", "settings"] });
      })
      .catch(() => {});
  }, [settings, getRate, qc]);
}

export function AppShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery(meQuery);
  const active = !!me?.profile?.active;
  const { data: settings } = useQuery({ ...settingsQuery, enabled: active });
  const [open, setOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading) return <PageLoading />;

  if (!active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar p-6 text-sidebar-foreground">
        <div className="max-w-md text-center animate-pop-in">
          <img src={logo} alt="" className="mx-auto mb-6 h-24 w-24 rounded-full" />
          <Clock className="mx-auto mb-3 h-8 w-8 text-sidebar-primary" />
          <h1 className="font-display text-4xl font-extrabold uppercase">Esperando aprobación</h1>
          <p className="mt-3 text-sidebar-muted">
            Tu cuenta <b className="text-sidebar-foreground">{me?.email}</b> ya está creada. Pídele al administrador de El
            Nonno que te active en <b className="text-sidebar-foreground">Configuración → Usuarios</b>.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="accent" onClick={() => qc.invalidateQueries({ queryKey: ["db", "me"] })}>
              Ya me activaron
            </Button>
            <Button variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}>
              Salir
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <ActiveShell me={me!} rate={Number(settings?.rate ?? 0)} rateSource={settings?.rate_source ?? "bcv"} open={open} setOpen={setOpen} signOut={signOut} />;
}

function ActiveShell({
  me,
  rate,
  rateSource,
  open,
  setOpen,
  signOut,
}: {
  me: { email: string; profile: { display_name: string } | null };
  rate: number;
  rateSource: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  signOut: () => void;
}) {
  useAutoBcv();
  const name = me.profile?.display_name || me.email;
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <Brand />
        <SidebarNav />
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-64 flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <Brand />
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </Button>
          <Link
            to="/configuracion"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground shadow-sm"
            title="Cambiar tasa en Configuración"
          >
            <span className="eyebrow">{rateSource === "bcv" ? "Tasa BCV" : "Tasa manual"}</span>
            <span className="tabular">{fmtRate(rate)}</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Salir
            </Button>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
