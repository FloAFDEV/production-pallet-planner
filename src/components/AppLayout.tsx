import { Link, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, Factory, Boxes, Truck, Package, Layers } from "lucide-react";
import { UI } from "@/lib/uiLabels";
import agecetLogo from "@/assets/logo_agecet_hands.jpg";

const NAV = [
  { to: "/", label: UI.dashboard, icon: LayoutDashboard },
  { to: "/production", label: UI.production_orders, icon: Factory },
  { to: "/coffrets", label: "Coffrets", icon: Layers },
  { to: "/stock", label: UI.stock, icon: Boxes },
  { to: "/livraisons", label: UI.livraisons, icon: Truck },
] as const;

export function AppLayout() {
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-56 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-4 py-4 border-b border-sidebar-border flex items-center gap-2">
          <img src={agecetLogo} alt="ESAT AGECET" className="h-9 w-9 rounded-sm object-cover border border-sidebar-border" />

          <div>
            <div className="font-semibold leading-tight text-sm">
              Coffret ERP
            </div>
            <div className="text-[11px] text-sidebar-foreground/60 uppercase tracking-wider">
              Production
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            return (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-xs transition-colors"
                activeProps={{ className: "flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-xs transition-colors bg-sidebar-accent text-foreground font-semibold" }}
                inactiveProps={{ className: "flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-xs transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground" }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 text-[10px] text-sidebar-foreground/50 border-t border-sidebar-border">
          v1.0 · ERP coffrets
        </div>
      </aside>

      {/* Mobile */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={agecetLogo} alt="ESAT AGECET" className="h-6 w-6 rounded-sm object-cover border border-sidebar-border" />
            <span className="font-semibold text-sm">
              Coffret ERP
            </span>
          </div>
        </div>

        <div className="flex border-t border-sidebar-border overflow-x-auto">
          {NAV.map(({ to, label, icon: Icon }) => {
            return (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex-1 min-w-[80px] flex flex-col items-center gap-1 py-2 text-xs"
                activeProps={{ className: "flex-1 min-w-[80px] flex flex-col items-center gap-1 py-2 text-xs text-accent" }}
                inactiveProps={{ className: "flex-1 min-w-[80px] flex flex-col items-center gap-1 py-2 text-xs text-sidebar-foreground/70" }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      <main className="flex-1 md:ml-0 mt-[88px] md:mt-0">
        <Outlet />
      </main>
    </div>
  );
}