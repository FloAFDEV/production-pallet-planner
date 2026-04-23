import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { fmtDateTime, fmtInt, fmtKg } from "@/lib/format";
import { record_stock_movement } from "@/lib/stockMovements";

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
  const [presetComponentId, setPresetComponentId] = useState<string>("");
  const [presetType, setPresetType] = useState<"IN" | "OUT">("IN");
  const [presetReason, setPresetReason] = useState<string>("");

  const composants = useQuery({
    queryKey: ["composants"],
    queryFn: async () => {
      const { data, error } = await sb.from("composants").select("*").order("reference");
      if (error) throw error;
      return data;
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
      if (stockError) throw stockError;

      return {
        stockById: new Map<string, number>((stockRows ?? []).map((row: any) => [row.composant_id, Number(row.available_stock ?? 0)])),
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

      const composantIds = Array.from(
        new Set(((mouvementRows ?? []) as any[]).map((m) => m.composant_id).filter(Boolean))
      );

      let composantMap = new Map<string, any>();
      if (composantIds.length > 0) {
        const { data: composantsData, error: composantsError } = await sb
          .from("composants")
          .select("id,reference,name")
          .in("id", composantIds);
        if (composantsError) throw composantsError;
        composantMap = new Map((composantsData ?? []).map((c: any) => [c.id, c]));
      }

      return ((mouvementRows ?? []) as any[]).map((m) => ({
        ...m,
        composant: composantMap.get(m.composant_id) ?? null,
      }));
    },
  });

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

      <Tabs defaultValue="composants">
        <TabsList>
          <TabsTrigger value="composants">Composants</TabsTrigger>
          <TabsTrigger value="mouvements">Mouvements</TabsTrigger>
        </TabsList>

        <TabsContent value="composants" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-[88px] md:top-0 z-10 bg-muted/95 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="text-left p-3">Référence</th>
                      <th className="text-left p-3">Désignation</th>
                      <th className="text-right p-3">Stock brut</th>
                      <th className="text-right p-3">Réservé</th>
                      <th className="text-right p-3">Disponible</th>
                      <th className="text-right p-3">Seuil min.</th>
                      <th className="text-left p-3">Emplacement</th>
                      <th className="text-right p-3">Poids u.</th>
                      <th className="text-center p-3">État</th>
                      <th className="text-right p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(composants.data ?? []).length === 0 ? (
                      <tr>
                        <td className="p-4 text-sm text-muted-foreground" colSpan={10}>Aucune donnée disponible</td>
                      </tr>
                    ) : (composants.data ?? []).map((c: any) => {
                      const stockBrut = Number(c.stock ?? 0);
                      const disponible = stockAgg.data?.stockById.get(c.id) ?? stockBrut;
                      const reserve = Math.max(0, stockBrut - disponible);
                      const alerte = (c.is_active ?? true) && disponible <= Number(c.min_stock ?? 0);
                      return (
                        <tr key={c.id} className="border-t border-border">
                          <td className="p-3 font-mono text-xs">{c.reference}</td>
                          <td className="p-3 font-medium">{c.name}</td>
                          <td className="p-3 text-right tabular">{fmtInt(stockBrut)}</td>
                          <td className="p-3 text-right tabular text-info">{fmtInt(reserve)}</td>
                          <td className={"p-3 text-right tabular font-semibold " + (alerte ? "text-destructive" : "")}>{fmtInt(disponible)}</td>
                          <td className="p-3 text-right tabular text-muted-foreground">{fmtInt(c.min_stock)}</td>
                          <td className="p-3 text-xs text-muted-foreground">{c.location ?? "—"}</td>
                          <td className="p-3 text-right tabular text-muted-foreground">{fmtKg(c.poids_unitaire)}</td>
                          <td className="p-3 text-center">
                            {(c.is_active ?? true) === false ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border">Inactif</span>
                            ) : alerte ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-destructive/15 text-destructive border border-destructive/30">Bas</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-success/15 text-success border border-success/30">OK</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <Button size="sm" variant="outline" onClick={() => { setPresetComponentId(c.id); setPresetType("IN"); setPresetReason("Correction stock"); setDialogOpen(true); }}>
                              Corriger
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mouvements" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Historique des mouvements (100 derniers)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-[88px] md:top-0 z-10 bg-muted/95 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Composant</th>
                      <th className="text-left p-3">Contexte</th>
                      <th className="text-center p-3">Type</th>
                      <th className="text-right p-3">Quantité</th>
                      <th className="text-left p-3">Motif</th>
                      <th className="text-left p-3">Référence</th>
                      <th className="text-left p-3">Auteur</th>
                      <th className="text-right p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mouvements.data ?? []).length === 0 ? (
                      <tr>
                        <td className="p-4 text-sm text-muted-foreground" colSpan={9}>Aucune donnée disponible</td>
                      </tr>
                    ) : (mouvements.data ?? []).map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="p-3 text-muted-foreground tabular text-xs">{fmtDateTime(m.created_at)}</td>
                        <td className="p-3">
                          <div className="font-medium">{m.composant?.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{m.composant?.reference}</div>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center rounded-sm border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
                            {m.source_type ?? m.entity_type ?? "n/a"}
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
                              {String(m.type ?? "n/a")}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right tabular font-semibold">{fmtInt(m.quantity)}</td>
                        <td className="p-3 text-muted-foreground">{m.reason ?? m.source_type ?? "—"}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{m.source_id ?? m.reference_id ?? "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">{m.created_by ?? "Système"}</td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => { setPresetComponentId(m.composant_id); setPresetType("IN"); setPresetReason("Correction après mouvement"); setDialogOpen(true); }}>
                            Corriger
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
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
      const sb = supabase as any;
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
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      onOpenChange(false);
      setComposantId(""); setQty(""); setReason(""); setType("IN");
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
