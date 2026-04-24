import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp } from "lucide-react";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { record_stock_movement } from "@/lib/stockMovements";
import { getStockHealth, stockHealthMeta } from "@/lib/domain";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock — Coffret ERP" },
      { name: "description", content: "Liste des composants, niveaux de stock et historique des mouvements." },
    ],
  }),
  component: StockPage,
});

function StockPage() {
  const sb = supabase as any;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [presetComponentId, setPresetComponentId] = useState<string>("");
  const [presetType, setPresetType] = useState<"IN" | "OUT" | "ADJUST">("IN");
  const [presetReason, setPresetReason] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "rupture" | "critical" | "ok">("all");
  const [selectedComponentId, setSelectedComponentId] = useState<string>("");

  const composants = useQuery({
    queryKey: ["composants"],
    queryFn: async () => {
      const { data, error } = await sb.from("composants").select("*").order("reference");
      if (error) throw error;
      return data ?? [];
    },
  });

  const composantIds = useMemo(() => (composants.data ?? []).map((c: any) => c.id), [composants.data]);

  const stockAgg = useQuery({
    queryKey: ["stock_snapshot", composantIds],
    enabled: composantIds.length > 0,
    queryFn: async () => {
      const { data: stockRows, error: stockError } = await sb.rpc("get_stock_snapshot_by_components", {
        component_ids: composantIds,
      });
      if (stockError) return { stockById: new Map<string, number>(), degraded: true };

      return {
        stockById: new Map<string, number>(
          ((stockRows ?? []) as any[]).map((row) => [row.composant_id, Number(row.available_stock ?? 0)])
        ),
        degraded: false,
      };
    },
  });

  const mouvements = useQuery({
    queryKey: ["stock_movements"],
    queryFn: async () => {
      const { data: mouvementRows, error } = await sb
        .from("stock_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const mouvementComposantIds = Array.from(
        new Set(((mouvementRows ?? []) as any[]).map((m) => m.composant_id).filter(Boolean))
      );

      let composantMap = new Map<string, any>();
      if (mouvementComposantIds.length > 0) {
        const { data: composantsData, error: composantsError } = await sb
          .from("composants")
          .select("id,reference,name")
          .in("id", mouvementComposantIds);
        if (composantsError) throw composantsError;
        composantMap = new Map((composantsData ?? []).map((c: any) => [c.id, c]));
      }

      return ((mouvementRows ?? []) as any[]).map((m) => ({
        ...m,
        composant: composantMap.get(m.composant_id) ?? null,
      }));
    },
  });

  const stockRows = useMemo(() => {
    return (composants.data ?? []).map((c: any) => {
      const stockActuel = Number(c.stock ?? 0);
      const stockDisponible = stockAgg.data?.stockById.get(c.id) ?? stockActuel;
      const stockReserve = Math.max(0, stockActuel - stockDisponible);
      const health = getStockHealth(stockDisponible, Number(c.min_stock ?? 0));

      return {
        ...c,
        stockActuel,
        stockDisponible,
        stockReserve,
        health,
      };
    });
  }, [composants.data, stockAgg.data]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return stockRows;
    return stockRows.filter((row) => row.health === filter);
  }, [filter, stockRows]);

  const selectedComponent = useMemo(() => {
    return stockRows.find((row: any) => row.id === selectedComponentId) ?? null;
  }, [stockRows, selectedComponentId]);

  const counts = useMemo(() => ({
    all: stockRows.length,
    rupture: stockRows.filter((row) => row.health === "rupture").length,
    critical: stockRows.filter((row) => row.health === "critical").length,
    ok: stockRows.filter((row) => row.health === "ok").length,
  }), [stockRows]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Inventaire</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Stock</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/production" className="inline-flex items-center rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">Réserver</Link>
          <Button variant="outline" onClick={() => { setPresetComponentId(""); setPresetType("OUT"); setPresetReason("Sortie stock"); setDialogOpen(true); }}>Sortie</Button>
          <Button onClick={() => { setPresetComponentId(""); setPresetType("IN"); setPresetReason("Correction stock"); setDialogOpen(true); }}>Corriger</Button>
        </div>
      </header>

      <MouvementDialog
        composants={composants.data ?? []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        presetComponentId={presetComponentId}
        presetType={presetType}
        presetReason={presetReason}
      />
      <div className="mb-4 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">Stock atelier</div>
            <div className="text-xs text-muted-foreground">Lecture métier immédiate, sans IDs ni bruit technique.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "Tous", counts.all],
              ["rupture", "En rupture", counts.rupture],
              ["critical", "Presque en rupture", counts.critical],
              ["ok", "OK", counts.ok],
            ] as const).map(([key, label, count]) => (
              <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} onClick={() => setFilter(key)}>
                {label} ({count})
              </Button>
            ))}
          </div>
        </div>
        {stockAgg.data?.degraded && (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Donnée de disponibilité incomplète. Le stock affiché reste exploitable, mais le détail mouvement doit être vérifié.
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-[88px] md:top-0 z-10 bg-muted/95 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr>
                  <th className="text-left p-3">Produit</th>
                  <th className="text-right p-3">Stock actuel</th>
                  <th className="text-right p-3">Réservé</th>
                  <th className="text-right p-3">Disponible</th>
                  <th className="text-center p-3">État</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.length === 0 ? (
                  <tr>
                    <td className="p-4 text-sm text-muted-foreground text-center" colSpan={6}>
                      <div className="flex flex-col items-center gap-2 py-2">
                        <span>Aucune donnée disponible</span>
                        <Link to="/production" className="inline-flex items-center rounded-sm border border-input px-2 py-0.5 text-xs hover:bg-accent">Réserver stock</Link>
                      </div>
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td className="p-4 text-sm text-muted-foreground text-center" colSpan={6}>
                      <div className="flex flex-col items-center gap-2 py-2">
                        <span>Aucune donnée disponible</span>
                        <Button size="sm" variant="outline" onClick={() => setFilter("all")}>Voir tous les stocks</Button>
                      </div>
                    </td>
                  </tr>
                ) : filteredRows.map((c: any) => {
                  const meta = stockHealthMeta[c.health];
                  return (
                    <tr key={c.id} className="border-t border-border">
                      <td className="p-3">
                        <div className="font-medium">{c.name}</div>
                      </td>
                      <td className="p-3 text-right tabular font-semibold">{fmtInt(c.stockActuel)}</td>
                      <td className="p-3 text-right tabular text-info">{fmtInt(c.stockReserve)}</td>
                      <td className={"p-3 text-right tabular font-semibold " + (c.health === "rupture" ? "text-destructive" : c.health === "critical" ? "text-warning" : "text-success")}>{fmtInt(c.stockDisponible)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => { setSelectedComponentId(c.id); setDetailOpen(true); }}>Voir détail</Button>
                          <Button size="sm" variant="outline" onClick={() => { setPresetComponentId(c.id); setPresetType("ADJUST"); setPresetReason("Mouvement atelier"); setDialogOpen(true); }}>Créer mouvement</Button>
                          <Link to="/production" className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent">Réserver stock</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Mouvements récents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-[88px] md:top-0 z-10 bg-muted/95 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Produit</th>
                  <th className="text-left p-3">Mouvement</th>
                  <th className="text-center p-3">Type</th>
                  <th className="text-right p-3">Quantité</th>
                  <th className="text-left p-3">Motif</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {(mouvements.data ?? []).length === 0 ? (
                  <tr>
                    <td className="p-4 text-sm text-muted-foreground text-center" colSpan={7}>
                      <div className="flex flex-col items-center gap-2 py-2">
                        <span>Aucune donnée disponible</span>
                        <Button size="sm" variant="outline" onClick={() => { setPresetComponentId(stockRows[0]?.id ?? ""); setDialogOpen(true); }}>Créer mouvement</Button>
                      </div>
                    </td>
                  </tr>
                ) : (mouvements.data ?? []).map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-3 text-muted-foreground tabular text-xs">{fmtDateTime(m.created_at)}</td>
                    <td className="p-3">
                      <div className="font-medium">{m.composant?.name ?? "Produit inconnu"}</div>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center rounded-sm border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
                        Atelier
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {m.type === "IN" ? (
                        <span className="inline-flex items-center gap-1 rounded-sm border border-success/30 bg-success/15 px-2 py-0.5 text-[11px] font-medium">
                          <ArrowDown className="h-3 w-3" /> Entrée
                        </span>
                      ) : m.type === "OUT" ? (
                        <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-[11px] font-medium">
                          <ArrowUp className="h-3 w-3" /> Sortie
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-sm border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
                          Ajustement
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular font-semibold">{fmtInt(m.quantity)}</td>
                    <td className="p-3 text-muted-foreground">{m.reason ?? "Aucun motif"}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => { setSelectedComponentId(m.composant_id); setDetailOpen(true); }}>Voir détail</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        component={selectedComponent}
        onCreateMovement={() => {
          if (!selectedComponent) return;
          setPresetComponentId(selectedComponent.id);
          setPresetType("ADJUST");
          setPresetReason("Mouvement atelier");
          setDialogOpen(true);
        }}
      />
    </div>
  );
}

function DetailDialog({
  open,
  onOpenChange,
  component,
  onCreateMovement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  component: any | null;
  onCreateMovement: () => void;
}) {
  const meta = component ? stockHealthMeta[component.health] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Détail stock</DialogTitle>
        </DialogHeader>
        {!component ? (
          <p className="text-sm text-muted-foreground">Aucune donnée disponible</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-lg font-semibold">{component.name}</div>
              <div className="mt-1 inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-medium ${meta?.cls ?? "bg-muted text-muted-foreground"}">{meta?.label ?? "Aucune donnée disponible"}</div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Stock actuel</div>
                <div className="font-semibold tabular">{fmtInt(component.stockActuel)}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Réservé</div>
                <div className="font-semibold tabular">{fmtInt(component.stockReserve)}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Disponible</div>
                <div className="font-semibold tabular">{fmtInt(component.stockDisponible)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onCreateMovement}>Créer mouvement</Button>
              <Link to="/production" className="inline-flex items-center rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">Réserver stock</Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MouvementDialog({
  composants,
  open,
  onOpenChange,
  presetComponentId,
  presetType,
  presetReason,
}: {
  composants: { id: string; reference: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetComponentId?: string;
  presetType?: "IN" | "OUT" | "ADJUST";
  presetReason?: string;
}) {
  const [composantId, setComposantId] = useState<string>("");
  const [type, setType] = useState<"IN" | "OUT" | "ADJUST">("IN");
  const [qty, setQty] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setComposantId(presetComponentId ?? "");
    setType(presetType ?? "IN");
    setReason(presetReason ?? "");
  }, [open, presetComponentId, presetType, presetReason]);

  const mut = useMutation({
    mutationFn: async () => {
      const quantity = parseInt(qty, 10);
      if (!composantId || !quantity || quantity <= 0) throw new Error("Composant et quantité requis");

      await record_stock_movement({
        composant_id: composantId,
        type,
        quantity,
        source_type: "manual_fix",
        source_id: null,
      });
    },
    onSuccess: () => {
      toast.success("Mouvement enregistré");
      qc.invalidateQueries({ queryKey: ["composants"] });
      qc.invalidateQueries({ queryKey: ["stock_snapshot"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      onOpenChange(false);
      setComposantId("");
      setQty("");
      setReason("");
      setType("IN");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Entrée / sortie de stock</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Ecriture via RPC serveur uniquement. Aucune insertion directe front.</p>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Composant</Label>
            <Select value={composantId} onValueChange={setComposantId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>
                {composants.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-mono text-xs mr-2">{c.reference}</span>{c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "IN" | "OUT" | "ADJUST")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Entrée</SelectItem>
                  <SelectItem value="OUT">Sortie</SelectItem>
                  <SelectItem value="ADJUST">Ajustement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantité</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Motif (optionnel)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Réception fournisseur, casse…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
