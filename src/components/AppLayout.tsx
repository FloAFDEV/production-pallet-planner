import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Factory, Boxes, Truck, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/livraisons", label: "Livraisons", icon: Truck },
] as const;

export function AppLayout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-2">
          <div className="h-9 w-9 rounded-md grid place-items-center" style={{ background: "var(--gradient-amber)" }}>
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-display font-semibold leading-tight">Coffret ERP</div>
            <div className="text-[11px] text-sidebar-foreground/60 uppercase tracking-wider">Production</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-accent font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 text-[11px] text-sidebar-foreground/50">
          v1.0 · ERP coffrets
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-accent" />
            <span className="font-display font-semibold">Coffret ERP</span>
          </div>
        </div>
        <div className="flex border-t border-sidebar-border overflow-x-auto">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex-1 min-w-[80px] flex flex-col items-center gap-1 py-2 text-xs",
                  active ? "text-accent" : "text-sidebar-foreground/70"
                )}
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
