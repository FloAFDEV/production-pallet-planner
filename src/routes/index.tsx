import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Boxes, Factory, Flame, TrendingDown } from "lucide-react";
import { fmtInt } from "@/lib/format";
import { normalizeProductionStatus, productionStatusMeta } from "@/lib/domain";
import { UI } from "@/lib/uiLabels";

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
  const sb = supabase as any;

  const composants = useQuery({
    queryKey: ["composants"],
    queryFn: async () => {
      const { data, error } = await sb.from("composants").select("*").order("reference");
      console.log("[dashboard] composants", { data, error });
      if (error) throw error;
      return data;
    },
  });

  const orders = useQuery({
    queryKey: ["production_orders", "active"],
    queryFn: async () => {
      const { data: ordersData, error } = await sb
        .from("production_orders")
        .select("*")
        .order("status", { ascending: false })
        .order("created_at", { ascending: false });
      console.log("[dashboard] production_orders(active)", { data: ordersData, error });
      if (error) throw error;

      const activeOrders = ((ordersData ?? []) as any[]).filter((o) => {
        const status = normalizeProductionStatus(String(o.status));
        return status === "draft" || status === "ready" || status === "in_progress" || status === "paused";
      });

      const coffretIds = Array.from(new Set(activeOrders.map((o) => o.coffret_id).filter(Boolean)));
      let coffretMap = new Map<string, any>();
      if (coffretIds.length > 0) {
        const { data: coffretsData, error: coffretsError } = await sb
          .from("coffrets")
          .select("id,reference,name")
          .in("id", coffretIds);
        if (coffretsError) throw coffretsError;
        coffretMap = new Map((coffretsData ?? []).map((c: any) => [c.id, c]));
      }

      return activeOrders.map((o) => ({
        ...o,
        coffret: coffretMap.get(o.coffret_id) ?? null,
      }));
    },
  });

  const commercialOrders = useQuery({
    queryKey: ["orders", "open"],
    queryFn: async () => {
      const { data: ordersData, error } = await sb
        .from("orders")
        .select("id, reference, status, created_at, client_id")
        .order("created_at", { ascending: false });
      console.log("[dashboard] orders(open)", { data: ordersData, error });
      if (error) throw error;

      const orderIds = ((ordersData ?? []) as any[]).map((o) => o.id);
      const clientIds = Array.from(new Set(((ordersData ?? []) as any[]).map((o) => o.client_id).filter(Boolean)));

      let clientMap = new Map<string, any>();
      if (clientIds.length > 0) {
        const { data: clientsData, error: clientsError } = await sb
          .from("clients")
          .select("id,name")
          .in("id", clientIds);
        if (clientsError) throw clientsError;
        clientMap = new Map((clientsData ?? []).map((c: any) => [c.id, c]));
      }

      let linesByOrder = new Map<string, any[]>();
      if (orderIds.length > 0) {
        const { data: linesData, error: linesError } = await sb
          .from("order_lines")
          .select("id,order_id,quantity,product_variant_id")
          .in("order_id", orderIds);
        if (linesError) throw linesError;
        for (const line of (linesData ?? []) as any[]) {
          const current = linesByOrder.get(line.order_id) ?? [];
          current.push(line);
          linesByOrder.set(line.order_id, current);
        }
      }

      return ((ordersData ?? []) as any[]).map((o) => ({
        ...o,
        client: clientMap.get(o.client_id) ?? null,
        lines: linesByOrder.get(o.id) ?? [],
      }));
    },
  });

  const activeBomVersions = useQuery({
    queryKey: ["bom_versions", "active"],
    queryFn: async () => {
      const { data: versionsData, error } = await sb
        .from("bom_versions")
        .select("id, product_variant_id, version, is_active")
        .eq("is_active", true)
        .order("version", { ascending: false });
      console.log("[dashboard] bom_versions(active)", { data: versionsData, error });
      if (error) throw error;

      const versionIds = ((versionsData ?? []) as any[]).map((v) => v.id);
      let linesByVersion = new Map<string, any[]>();
      if (versionIds.length > 0) {
        const { data: linesData, error: linesError } = await sb
          .from("bom_lines")
          .select("id,bom_version_id,composant_id,quantity")
          .in("bom_version_id", versionIds);
        if (linesError) throw linesError;
        for (const line of (linesData ?? []) as any[]) {
          const current = linesByVersion.get(line.bom_version_id) ?? [];
          current.push(line);
          linesByVersion.set(line.bom_version_id, current);
        }
      }

      return ((versionsData ?? []) as any[]).map((v) => ({
        ...v,
        lines: linesByVersion.get(v.id) ?? [],
      }));
    },
  });

  const totalStock = (composants.data ?? []).reduce((s: number, c: any) => s + Number(c.stock ?? 0), 0);
  const totalReserve = (composants.data ?? []).reduce((s: number, c: any) => s + Number(c.reserved_stock ?? 0), 0);
  const totalDisponible = totalStock - totalReserve;
  const alertes = (composants.data ?? []).filter((c: any) => {
    const dispo = Number(c.stock ?? 0) - Number(c.reserved_stock ?? 0);
    return (c.is_active ?? true) && dispo <= Number(c.min_stock ?? 0);
  });
  const ordersList: any[] = (orders.data ?? []) as any[];
  const enCours = ordersList.filter((o) => normalizeProductionStatus(String(o.status)) === "in_progress");
  const prioritaires = ordersList.filter((o) => Number(o.priority ?? 0) === 1);
  const openCommercialOrders = ((commercialOrders.data ?? []) as any[]).filter((o) => !["done", "delivered", "canceled", "cancelled"].includes(String(o.status ?? "")));

  const componentDemandByOrder = new Map<string, number>();
  const bomByVariant = new Map<string, any>();
  for (const bom of (activeBomVersions.data ?? []) as any[]) {
    if (!bom.product_variant_id) continue;
    if (!bomByVariant.has(bom.product_variant_id)) {
      bomByVariant.set(bom.product_variant_id, bom);
    }
  }

  for (const order of openCommercialOrders) {
    for (const line of (order.lines ?? []) as any[]) {
      const bom = bomByVariant.get(line.product_variant_id);
      if (!bom) continue;
      for (const bomLine of (bom.lines ?? []) as any[]) {
        const current = componentDemandByOrder.get(bomLine.composant_id) ?? 0;
        componentDemandByOrder.set(
          bomLine.composant_id,
          current + Number(bomLine.quantity ?? 0) * Number(line.quantity ?? 0)
        );
      }
    }
  }

  const projectedRuptures = ((composants.data ?? []) as any[])
    .map((c) => {
      const demand = componentDemandByOrder.get(c.id) ?? 0;
      const dispo = Number(c.stock ?? 0) - Number(c.reserved_stock ?? 0);
      const projected = dispo - demand;
      return { ...c, demand, dispo, projected };
    })
    .filter((c) => c.projected < 0)
    .sort((a, b) => a.projected - b.projected);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <header className="mb-4 md:mb-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Vue d'ensemble</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1">{UI.dashboard}</h1>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-2 md:gap-3 mb-4">
        <KPI icon={<Boxes className="h-4 w-4" />} label="Stock total (pièces)" value={fmtInt(totalStock)} />
        <KPI icon={<Boxes className="h-4 w-4 text-info" />} label="Stock réservé" value={fmtInt(totalReserve)} />
        <KPI icon={<Boxes className="h-4 w-4 text-success" />} label="Stock disponible" value={fmtInt(totalDisponible)} />
        <KPI icon={<TrendingDown className="h-4 w-4 text-warning" />} label="Composants en alerte" value={String(alertes.length)} accent={alertes.length > 0 ? "warning" : undefined} />
        <KPI icon={<Factory className="h-4 w-4 text-info" />} label={`${UI.production_orders} en cours`} value={String(enCours.length)} />
        <KPI icon={<Flame className="h-4 w-4 text-destructive" />} label="OF urgents" value={String(prioritaires.length)} accent={prioritaires.length > 0 ? "destructive" : undefined} />
      </div>

      <div className="grid lg:grid-cols-3 gap-3 mb-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Commandes clients ouvertes</CardTitle>
            <Badge variant="outline">{openCommercialOrders.length}</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {(openCommercialOrders.slice(0, 3) as any[]).map((o) => (
              <div key={o.id} className="py-1.5 flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{o.reference ?? o.id.slice(0, 8)}</span>
                <span className="truncate">{o.client?.name ?? "Données manquantes"}</span>
              </div>
            ))}
            {openCommercialOrders.length === 0 && <p>Aucune commande en attente.</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Rupture previsionnelle (BOM x commandes)
            </CardTitle>
            <Badge variant="outline">{projectedRuptures.length}</Badge>
          </CardHeader>
          <CardContent>
            {projectedRuptures.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune rupture previsionnelle detectee.</p>
            ) : (
              <ul className="divide-y divide-border">
                {projectedRuptures.slice(0, 6).map((c) => (
                  <li key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.reference}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs text-muted-foreground">besoin {fmtInt(c.demand)} / dispo {fmtInt(c.dispo)}</div>
                      <div className="font-mono font-semibold text-destructive">manque {fmtInt(Math.abs(c.projected))}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-3 md:gap-4">
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
                {alertes.map((c: any) => {
                  const dispo = Number(c.stock ?? 0) - Number(c.reserved_stock ?? 0);
                  return (
                  <li key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.reference}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold text-destructive">{fmtInt(dispo)}</div>
                      <div className="text-[11px] text-muted-foreground">stock {fmtInt(c.stock)} · reserve {fmtInt(c.reserved_stock)}</div>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Factory className="h-4 w-4 text-info" /> Ordres de fabrication actifs
            </CardTitle>
            <Badge variant="outline">{ordersList.length}</Badge>
          </CardHeader>
          <CardContent>
            {ordersList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Aucun ordre actif.</p>
            ) : (
              <ul className="divide-y divide-border">
                {ordersList.map((o) => (
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
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className={"mt-1.5 text-xl md:text-2xl font-semibold tabular " + (accent === "destructive" ? "text-destructive" : accent === "warning" ? "text-warning" : "")}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const canonical = normalizeProductionStatus(status);
  const m = productionStatusMeta[canonical ?? ""] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${m.cls}`}>{m.label}</span>;
}
