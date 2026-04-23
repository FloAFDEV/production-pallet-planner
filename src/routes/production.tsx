import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fmtInt } from "@/lib/format";
import {
  normalizeProductionStatus,
  productionStatusMeta,
  toDbProductionStatus,
} from "@/lib/domain";
import { getProductionFeasibility } from "@/lib/getProductionFeasibility";

type ProdRow = { id: string; coffret_id: string; quantity: number };

type LineCheck = {
  rowId: string;
  ok: boolean;
  missing: Array<{ reference: string; name: string; manquant: number }>;
  remaining: Array<{ reference: string; name: string; apres_production: number }>;
};

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { title: "Production — Atelier" },
      { name: "description", content: "Fabrication de coffrets et suivi d'avancement." },
    ],
  }),
  component: ProductionPage,
});


function ProductionPage() {
  const sb = supabase as any;
  const qc = useQueryClient();

  const [rows, setRows] = useState<ProdRow[]>([{ id: crypto.randomUUID(), coffret_id: "", quantity: 1 }]);
  const [urgent, setUrgent] = useState(false);

  const coffrets = useQuery({
    queryKey: ["coffrets", "production"],
    queryFn: async () => {
      const { data, error } = await sb.from("coffrets").select("id,reference,name").order("reference");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lineChecks = useQuery({
    queryKey: ["production", "checks", JSON.stringify(rows.map((r) => ({ coffret_id: r.coffret_id, quantity: r.quantity })))],
    enabled: rows.some((r) => r.coffret_id && r.quantity > 0),
    queryFn: async () => {
      const checks: LineCheck[] = [];

      for (const row of rows) {
        if (!row.coffret_id || row.quantity <= 0) {
          checks.push({ rowId: row.id, ok: false, missing: [], remaining: [] });
          continue;
        }

        const feasibility = await getProductionFeasibility(row.coffret_id, row.quantity);
        const missing: Array<{ reference: string; name: string; manquant: number }> = feasibility.missing.map((item) => ({
          reference: item.composant_id,
          name: item.name,
          manquant: item.missing,
        }));
        const remaining: Array<{ reference: string; name: string; apres_production: number }> = feasibility.components.map((item) => ({
          reference: item.composant_id,
          name: item.name,
          apres_production: item.available - item.needed,
        }));

        checks.push({
          rowId: row.id,
          ok: feasibility.can_produce,
          missing,
          remaining,
        });
      }

      return checks;
    },
  });

  const checksByRow = useMemo(() => {
    const m = new Map<string, LineCheck>();
    for (const check of lineChecks.data ?? []) m.set(check.rowId, check);
    return m;
  }, [lineChecks.data]);

  const validRows = rows.filter((r) => r.coffret_id && r.quantity > 0);
  const canCreate =
    validRows.length > 0 &&
    validRows.every((row) => {
      const check = checksByRow.get(row.id);
      return check?.ok;
    });

  const orders = useQuery({
    queryKey: ["production_orders", "atelier"],
    queryFn: async () => {
      const { data: rawOrders, error } = await sb
        .from("production_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const filtered = ((rawOrders ?? []) as any[]).filter((o) => normalizeProductionStatus(String(o.status)) !== null);
      const ids = Array.from(new Set(filtered.map((o) => o.coffret_id).filter(Boolean)));

      let coffretMap = new Map<string, any>();
      if (ids.length > 0) {
        const { data: coffretsData, error: coffretsError } = await sb
          .from("coffrets")
          .select("id,reference,name")
          .in("id", ids);
        if (coffretsError) throw coffretsError;
        coffretMap = new Map((coffretsData ?? []).map((c: any) => [c.id, c]));
      }

      return filtered.map((o) => ({ ...o, coffret: coffretMap.get(o.coffret_id) ?? null }));
    },
  });

  const createFabrication = useMutation({
    mutationFn: async () => {
      for (const row of validRows) {
        const { data, error } = await sb.rpc("create_production_order_atomic", {
          p_coffret_id: row.coffret_id,
          p_quantity: row.quantity,
          p_status: toDbProductionStatus("draft"),
          p_priority: urgent ? 1 : 0,
          p_notes: null,
          p_idempotency_key: `production:${row.id}:${row.coffret_id}:${row.quantity}:${urgent ? 1 : 0}`,
        });
        if (error) throw error;

        if (data && data.success === false) {
          throw new Error(data.error || "Création production impossible");
        }
      }
    },
    onSuccess: () => {
      toast.success("Fabrication créée");
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["composants"] });
      setRows([{ id: crypto.randomUUID(), coffret_id: "", quantity: 1 }]);
      setUrgent(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transition = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "in_progress" | "paused" }) => {
      const { error } = await sb
        .from("production_orders")
        .update({ status: toDbProductionStatus(status) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["composants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("production_orders")
        .update({ status: toDbProductionStatus("done"), done_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fabrication terminée");
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["composants"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Production</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Fabrication de coffrets</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Créer fabrication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {coffrets.data && coffrets.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune donnée disponible</p>
          )}

          {rows.map((row, idx) => {
            const check = checksByRow.get(row.id);
            const status = check
              ? check.ok
                ? check.missing.length > 0
                  ? "attention"
                  : "ok"
                : "ko"
              : "ko";

            const statusCls =
              status === "ok"
                ? "bg-success/15 text-success border border-success/30"
                : status === "attention"
                  ? "bg-warning/15 text-warning border border-warning/30"
                  : "bg-destructive/15 text-destructive border border-destructive/30";

            const statusTxt =
              status === "ok"
                ? "Fabrication possible"
                : status === "attention"
                  ? "Attention"
                  : "Fabrication impossible";

            return (
              <div key={row.id} className="rounded-md border border-border p-3 space-y-3">
                <div className="grid md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-6">
                    <label className="text-xs text-muted-foreground">Coffret</label>
                    <Select
                      value={row.coffret_id}
                      onValueChange={(value) =>
                        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, coffret_id: value } : r)))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {(coffrets.data ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="font-mono text-xs mr-2">{c.reference}</span>{c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="text-xs text-muted-foreground">Quantité</label>
                    <Input
                      type="number"
                      min="1"
                      value={String(row.quantity)}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, quantity: Math.max(0, Number(e.target.value || 0)) } : r))
                        )
                      }
                    />
                  </div>

                  <div className="md:col-span-3 flex gap-2">
                    <span className={`inline-flex items-center rounded-sm px-2 py-1 text-[11px] font-medium ${statusCls}`}>
                      {statusTxt}
                    </span>
                    {rows.length > 1 && (
                      <Button
                        variant="outline"
                        onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                      >
                        Retirer
                      </Button>
                    )}
                  </div>
                </div>

                {!!check && (
                  <div className="grid md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-md border border-border p-2">
                      <div className="font-medium mb-1">Pièces manquantes</div>
                      {check.missing.length === 0 ? (
                        <div className="text-success">Aucune</div>
                      ) : (
                        <ul className="space-y-1">
                          {check.missing.slice(0, 4).map((m) => (
                            <li key={`${row.id}-${m.reference}`} className="text-destructive">
                              {m.reference} · {m.name} : {fmtInt(m.manquant)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-md border border-border p-2">
                      <div className="font-medium mb-1">Stock après fabrication</div>
                      {check.remaining.length === 0 ? (
                        <div className="text-muted-foreground">Aucune donnée disponible</div>
                      ) : (
                        <ul className="space-y-1">
                          {check.remaining.slice(0, 4).map((m) => (
                            <li key={`${row.id}-${m.reference}-rest`}>
                              {m.reference} · {m.name} : {fmtInt(m.apres_production)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {idx === rows.length - 1 && (
                  <Button
                    variant="outline"
                    onClick={() => setRows((prev) => [...prev, { id: crypto.randomUUID(), coffret_id: "", quantity: 1 }])}
                  >
                    Ajouter ligne
                  </Button>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Priorité</div>
              <div className="text-xs text-muted-foreground">{urgent ? "Urgent" : "Normal"}</div>
            </div>
            <Switch checked={urgent} onCheckedChange={setUrgent} />
          </div>

          <Button className="w-full" onClick={() => createFabrication.mutate()} disabled={!canCreate || createFabrication.isPending}>
            Créer fabrication
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suivi fabrication</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-[88px] md:top-0 z-10 bg-muted/95 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr>
                  <th className="text-left p-3">Coffret</th>
                  <th className="text-right p-3">Quantité</th>
                  <th className="text-center p-3">Priorité</th>
                  <th className="text-center p-3">Statut</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {(orders.data ?? []).length === 0 ? (
                  <tr>
                    <td className="p-4 text-sm text-muted-foreground" colSpan={5}>Aucune donnée disponible</td>
                  </tr>
                ) : (orders.data ?? []).map((o: any) => (
                  (() => {
                    const status = normalizeProductionStatus(String(o.status));
                    const canStart = status === "draft" || status === "ready";
                    const canPause = status === "in_progress";
                    const canResume = status === "paused";
                    const canFinish = status === "draft" || status === "ready" || status === "in_progress" || status === "paused";

                    return (
                      <tr key={o.id} className="border-t border-border">
                        <td className="p-3">
                          <div className="font-medium">{o.coffret?.name ?? "Aucune donnée disponible"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{o.coffret?.reference ?? "Aucune donnée disponible"}</div>
                        </td>
                        <td className="p-3 text-right tabular font-semibold">{fmtInt(o.quantity)}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium ${Number(o.priority ?? 0) === 1 ? "border-destructive/30 bg-destructive/15 text-destructive" : "border-border bg-muted text-muted-foreground"}`}>
                            {Number(o.priority ?? 0) === 1 ? "Urgent" : "Normal"}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium ${productionStatusMeta[status ?? ""]?.cls ?? "bg-muted text-muted-foreground border border-border"}`}>
                            {productionStatusMeta[status ?? ""]?.label ?? String(o.status)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex gap-1.5">
                            {canStart && (
                              <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: o.id, status: "in_progress" })} disabled={transition.isPending}>
                                Démarrer
                              </Button>
                            )}
                            {canPause && (
                              <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: o.id, status: "paused" })} disabled={transition.isPending}>
                                Mettre en pause
                              </Button>
                            )}
                            {canResume && (
                              <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: o.id, status: "in_progress" })} disabled={transition.isPending}>
                                Reprendre
                              </Button>
                            )}
                            {canFinish && (
                              <Button size="sm" variant="outline" onClick={() => finish.mutate(o.id)} disabled={finish.isPending}>
                                Terminer
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
