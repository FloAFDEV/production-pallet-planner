import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Boxes, Factory, Flame, TrendingDown } from "lucide-react";
import { fmtInt } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Coffret ERP" },
      { name: "description", content: "Vue d'ensemble du stock, des alertes et de la production en cours." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const composants = useQuery({
    queryKey: ["composants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("composants").select("*").order("reference");
      if (error) throw error;
      return data;
    },
  });

  const orders = useQuery({
    queryKey: ["production_orders", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("*, coffret:coffrets(reference,name)")
        .in("status", ["in_progress", "priority", "draft"])
        .order("status", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totalStock = (composants.data ?? []).reduce((s, c) => s + c.stock, 0);
  const alertes = (composants.data ?? []).filter((c) => c.stock <= c.min_stock);
  const enCours = (orders.data ?? []).filter((o) => o.status === "in_progress");
  const prioritaires = (orders.data ?? []).filter((o) => o.status === "priority");

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6 md:mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Vue d'ensemble</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Dashboard</h1>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <KPI icon={<Boxes className="h-4 w-4" />} label="Stock total (pièces)" value={fmtInt(totalStock)} />
        <KPI icon={<TrendingDown className="h-4 w-4 text-warning" />} label="Composants en alerte" value={String(alertes.length)} accent={alertes.length > 0 ? "warning" : undefined} />
        <KPI icon={<Factory className="h-4 w-4 text-info" />} label="Production en cours" value={String(enCours.length)} />
        <KPI icon={<Flame className="h-4 w-4 text-destructive" />} label="Ordres prioritaires" value={String(prioritaires.length)} accent={prioritaires.length > 0 ? "destructive" : undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Alertes stock bas
            </CardTitle>
            <Badge variant="outline">{alertes.length}</Badge>
          </CardHeader>
          <CardContent>
            {alertes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Aucune alerte. Tous les stocks sont au-dessus du seuil minimum.</p>
            ) : (
              <ul className="divide-y divide-border">
                {alertes.map((c) => (
                  <li key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.reference}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold text-destructive">{fmtInt(c.stock)}</div>
                      <div className="text-[11px] text-muted-foreground">min {fmtInt(c.min_stock)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Factory className="h-4 w-4 text-info" /> Ordres de fabrication actifs
            </CardTitle>
            <Badge variant="outline">{(orders.data ?? []).length}</Badge>
          </CardHeader>
          <CardContent>
            {(orders.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Aucun ordre actif.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(orders.data ?? []).map((o) => (
                  <li key={o.id} className="py-2.5 flex items-center justify-between text-sm gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{o.coffret?.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{o.reference}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">×{fmtInt(o.quantity)}</span>
                      <StatusBadge status={o.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPI({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "warning" | "destructive" }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className={"mt-2 text-2xl md:text-3xl font-display font-semibold tabular " + (accent === "destructive" ? "text-destructive" : accent === "warning" ? "text-warning" : "")}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
    in_progress: { label: "En cours", cls: "bg-info/15 text-info border border-info/30" },
    priority: { label: "Prioritaire", cls: "bg-destructive/15 text-destructive border border-destructive/30" },
    done: { label: "Terminé", cls: "bg-success/15 text-success border border-success/30" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${m.cls}`}>{m.label}</span>;
}
