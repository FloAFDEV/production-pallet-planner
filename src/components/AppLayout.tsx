import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Factory, Boxes, Truck, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/livraisons", label: "Livraisons", icon: Truck },
] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  return (
    <div className="min-h-screen flex bg-background">
      {/* SIDEBAR */}
      <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-2">
          <div className="h-9 w-9 rounded-md grid place-items-center bg-amber-500/20">
            <Package className="h-5 w-5 text-primary" />
          </div>

          <div>
            <div className="font-semibold">Coffret ERP</div>
            <div className="text-[11px] opacity-60 uppercase">
              Production
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);

            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition",
                  active
                    ? "bg-sidebar-accent text-accent"
                    : "hover:bg-sidebar-accent/40"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 text-[11px] opacity-50">
          v1.0 · ERP coffrets
        </div>
      </aside>

      {/* MOBILE */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-sidebar border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            <span className="font-semibold">Coffret ERP</span>
          </div>
        </div>

        <div className="flex overflow-x-auto border-t">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);

            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex-1 min-w-[80px] flex flex-col items-center py-2 text-xs",
                  active ? "text-accent" : "opacity-60"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* CONTENT */}
      <main className="flex-1 pt-[88px] md:pt-0">
        {children}
      </main>
    </div>
  );
}