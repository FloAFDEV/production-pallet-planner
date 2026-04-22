import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

  const composants = useQuery({
    queryKey: ["composants"],
    queryFn: async () => {
      const { data, error } = await sb.from("composants").select("*").order("reference");
      if (error) throw error;
      return data;
    },
  });

  const mouvements = useQuery({
    queryKey: ["mouvements"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("mouvements")
        .select("*, composant:composants(reference,name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Inventaire</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Stock</h1>
        </div>
        <MouvementDialog composants={composants.data ?? []} />
      </header>

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
                  <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
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
                    </tr>
                  </thead>
                  <tbody>
                    {(composants.data ?? []).map((c: any) => {
                      const reserve = Number(c.reserved_stock ?? 0);
                      const stock = Number(c.stock ?? 0);
                      const disponible = stock - reserve;
                      const alerte = (c.is_active ?? true) && disponible <= Number(c.min_stock ?? 0);
                      return (
                        <tr key={c.id} className="border-t border-border">
                          <td className="p-3 font-mono text-xs">{c.reference}</td>
                          <td className="p-3 font-medium">{c.name}</td>
                          <td className="p-3 text-right tabular">{fmtInt(stock)}</td>
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
                  <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Composant</th>
                      <th className="text-left p-3">Contexte</th>
                      <th className="text-center p-3">Type</th>
                      <th className="text-right p-3">Quantité</th>
                      <th className="text-left p-3">Motif</th>
                      <th className="text-left p-3">Référence</th>
                      <th className="text-left p-3">Auteur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mouvements.data ?? []).map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="p-3 text-muted-foreground tabular text-xs">{fmtDateTime(m.created_at)}</td>
                        <td className="p-3">
                          <div className="font-medium">{m.composant?.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{m.composant?.reference}</div>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center rounded-sm border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
                            {m.entity_type ?? "n/a"}
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
                        <td className="p-3 text-muted-foreground">{m.reason ?? "—"}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{m.reference_id ?? "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">{m.created_by ?? "Système"}</td>
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

function MouvementDialog({ composants }: { composants: { id: string; reference: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [composantId, setComposantId] = useState<string>("");
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const quantity = parseInt(qty, 10);
      if (!composantId || !quantity || quantity <= 0) throw new Error("Composant et quantité requis");

      const payload = {
        p_composant_id: composantId,
        p_type: type,
        p_quantity: quantity,
        p_reason: reason || null,
        p_entity_type: "manual_fix",
        p_reference_id: null,
      };

      // Backward-compatible RPC names while backend converges.
      const rpcCandidates = [
        "record_stock_movement",
        "create_stock_movement",
        "create_inventory_movement",
      ];

      let lastError: any = null;
      for (const fn of rpcCandidates) {
        const { error } = await sb.rpc(fn, payload);
        if (!error) return;
        if (error.code === "PGRST202" || String(error.message ?? "").toLowerCase().includes("function")) {
          lastError = error;
          continue;
        }
        throw error;
      }

      throw new Error(
        `Aucune RPC mouvement disponible (${rpcCandidates.join(", ")}). Vérifier la fonction serveur de ledger.` +
          (lastError ? ` (${lastError.message})` : "")
      );
    },
    onSuccess: () => {
      toast.success("Mouvement enregistré");
      qc.invalidateQueries({ queryKey: ["composants"] });
      qc.invalidateQueries({ queryKey: ["mouvements"] });
      setOpen(false);
      setComposantId(""); setQty(""); setReason(""); setType("IN");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> Nouveau mouvement</Button>
      </DialogTrigger>
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
              <Select value={type} onValueChange={(v) => setType(v as "IN" | "OUT")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Entrée</SelectItem>
                  <SelectItem value="OUT">Sortie</SelectItem>
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
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
