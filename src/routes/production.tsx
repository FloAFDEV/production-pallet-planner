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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Flame, PlayCircle, Sparkles } from "lucide-react";
import { fmtInt, fmtKg, fmtPalette } from "@/lib/format";
import { StatusBadge } from "./index";
import { ProductionFeasibilityDisplay } from "@/components/ProductionFeasibilityDisplay";
import { useProductionFeasibility } from "@/hooks/useProductionFeasibility";
import { useCreateProductionOrderSafe } from "@/hooks/useMultiCoffret";
import { MultiCoffretSimulator } from "@/components/MultiCoffretSimulator";
import type { ProductionStatus } from "@/lib/domain";

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { title: "Production — Coffret ERP" },
      { name: "description", content: "Création d'ordres de fabrication avec vérification automatique du stock." },
    ],
  }),
  component: ProductionPage,
});

function ProductionPage() {
  const sb = supabase as any;
  const qc = useQueryClient();
  const [coffretId, setCoffretId] = useState<string>("");
  const [qty, setQty] = useState<string>("100");
  const [notes, setNotes] = useState<string>("");
  const [newStatus, setNewStatus] = useState<ProductionStatus>("draft");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Hook pour vérifier la faisabilité
  const quantity = parseInt(qty, 10) || 0;
  const { feasibility, isLoading: feasibilityLoading } = useProductionFeasibility(
    coffretId || undefined,
    quantity
  );

  // Mutation RPC atomique pour créer l'OF avec réservations
  const createOrderSafe = useCreateProductionOrderSafe();

  const createOrder = useMutation({
    mutationFn: async () => {
      const quantity = parseInt(qty, 10);
      if (!coffretId || !quantity) throw new Error("Coffret et quantité requis");
      if (!feasibility || feasibility.blockers.length > 0) {
        throw new Error("Production impossible - vérifiez les composants manquants");
      }
      
      // Utilise la RPC atomique
      const result = await createOrderSafe.mutateAsync({
        coffret_id: coffretId,
        quantity,
        status: newStatus,
        notes: notes || undefined,
      });
      
      if (!result.success) {
        throw new Error(result.error || "Erreur lors de la création");
      }
      
      return result;
    },
    onSuccess: (data) => {
      toast.success(`OF créé: ${data.reference}`);
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["composants"] });
      setCoffretId("");
      setQty("100");
      setNotes("");
      setNewStatus("draft");
    },
    onError: (e: Error) => {
      console.error("[createOrder] Error:", e);
      toast.error(e.message);
    },
  });

  const coffrets = useQuery({
    queryKey: ["coffrets"],
    queryFn: async () => {
      const { data, error } = await sb.from("coffrets").select("*").order("reference");
      if (error) throw error;
      return data;
    },
  });

  const orders = useQuery({
    queryKey: ["production_orders", "all"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("production_orders")
        .select("*, coffret:coffrets(reference,name,poids_coffret,nb_par_palette)")
        .order("status", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const setOrderStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: ProductionStatus }) => {
      const payload: Record<string, unknown> = { status };
      if (status === "in_progress") payload.started_at = new Date().toISOString();
      if (status === "done") payload.finished_at = new Date().toISOString();
      if (status === "paused") payload.updated_at = new Date().toISOString();
      if (status === "canceled" || status === "cancelled") payload.updated_at = new Date().toISOString();

      const { error } = await sb.from("production_orders").update(payload).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Statut de l'ordre mis a jour");
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["composants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validateOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await sb.rpc("validate_production_order", { p_order_id: orderId });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "Validation impossible");
    },
    onSuccess: () => {
      toast.success("Production validée — stock décrémenté");
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["composants"] });
      qc.invalidateQueries({ queryKey: ["mouvements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Atelier</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Production</h1>
      </header>

      <Tabs defaultValue="single" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="single">Simple</TabsTrigger>
          <TabsTrigger value="multi">Multi-coffrets</TabsTrigger>
          <TabsTrigger value="orders">Ordres</TabsTrigger>
        </TabsList>

        {/* TAB: SINGLE COFFRET */}
        <TabsContent value="single" className="space-y-6">
          <div className="grid lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Simulation & nouvel OF</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Coffret</Label>
              <Select 
                value={coffretId} 
                onValueChange={(v) => { 
                  setCoffretId(v);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Sélectionner un modèle…" /></SelectTrigger>
                <SelectContent>
                  {(coffrets.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-mono text-xs mr-2">{c.reference}</span>{c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantité à produire</Label>
              <Input 
                type="number" 
                min="1" 
                value={qty} 
                onChange={(e) => { 
                  setQty(e.target.value);
                }} 
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optionnel)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commande client, échéance…" />
            </div>
            <div className="space-y-2">
              <Label>Statut initial de l'OF</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as ProductionStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="priority">Prioritaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              className="w-full" 
              onClick={() => createOrder.mutate()} 
              disabled={
                createOrder.isPending || 
                !coffretId || 
                quantity <= 0 ||
                !feasibility || 
                feasibility.blockers.length > 0
              }
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {!feasibility || feasibility.blockers.length === 0 
                ? "Créer l'OF" 
                : "Bloqué - Composants manquants"}
            </Button>
            {feasibility && feasibility.blockers.length > 0 && (
              <p className="text-xs text-red-600 font-medium">
                ✗ {feasibility.blockers.length} composant{feasibility.blockers.length > 1 ? "s" : ""} insuffisant{feasibility.blockers.length > 1 ? "s" : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-4">
          {coffretId && quantity > 0 && (
            <ProductionFeasibilityDisplay 
              feasibility={feasibility!} 
              isLoading={feasibilityLoading}
            />
          )}

          <Card>
            <CardContent className="py-3">
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { key: "all", label: "Tous" },
                  { key: "draft", label: "Brouillons" },
                  { key: "in_progress", label: "En cours" },
                  { key: "paused", label: "En pause" },
                  { key: "priority", label: "Prioritaires" },
                  { key: "done", label: "Termines" },
                  { key: "canceled", label: "Annules" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={"rounded-md border px-2.5 py-1 transition-colors " + (statusFilter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Ordres de fabrication</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Référence</th>
                      <th className="text-left p-3">Coffret</th>
                      <th className="text-right p-3">Qté</th>
                      <th className="text-center p-3">Statut</th>
                      <th className="text-right p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orders.data ?? [])
                      .filter((o: any) => statusFilter === "all" || o.status === statusFilter)
                      .map((o: any) => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="p-3 font-mono text-xs">{o.reference}</td>
                        <td className="p-3">
                          <div className="font-medium">{o.coffret?.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{o.coffret?.reference}</div>
                        </td>
                        <td className="p-3 text-right tabular font-semibold">{fmtInt(o.quantity)}</td>
                        <td className="p-3 text-center"><StatusBadge status={o.status} /></td>
                        <td className="p-3 text-right">
                          <div className="inline-flex gap-1.5">
                            {o.status === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "in_progress" })} disabled={setOrderStatus.isPending}>
                                <PlayCircle className="h-3.5 w-3.5" /> Lancer
                              </Button>
                            )}
                            {(o.status === "in_progress" || o.status === "priority") && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "paused" })} disabled={setOrderStatus.isPending}>
                                Pause
                              </Button>
                            )}
                            {o.status === "paused" && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "in_progress" })} disabled={setOrderStatus.isPending}>
                                Reprendre
                              </Button>
                            )}
                            {(o.status === "draft" || o.status === "in_progress") && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "priority" })} disabled={setOrderStatus.isPending}>
                                Prioriser
                              </Button>
                            )}
                            {(o.status === "in_progress" || o.status === "priority" || o.status === "paused") && (
                              <Button size="sm" variant="outline" onClick={() => validateOrder.mutate(o.id)} disabled={validateOrder.isPending}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Valider
                              </Button>
                            )}
                            {(o.status === "draft" || o.status === "paused") && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "canceled" })} disabled={setOrderStatus.isPending}>
                                Annuler
                              </Button>
                            )}
                            {o.status === "done" && (
                              <span className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Termine</span>
                            )}
                            {(o.status === "canceled" || o.status === "cancelled") && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">Annule</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB: MULTI COFFRETS */}
        <TabsContent value="multi" className="space-y-6">
          <MultiCoffretSimulator coffrets={coffrets.data ?? []} />
        </TabsContent>

        {/* TAB: TOUS LES ORDRES */}
        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardContent className="py-3">
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { key: "all", label: "Tous" },
                  { key: "draft", label: "Brouillons" },
                  { key: "in_progress", label: "En cours" },
                  { key: "paused", label: "En pause" },
                  { key: "priority", label: "Prioritaires" },
                  { key: "done", label: "Termines" },
                  { key: "canceled", label: "Annules" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={"rounded-md border px-2.5 py-1 transition-colors " + (statusFilter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Ordres de fabrication</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Référence</th>
                      <th className="text-left p-3">Coffret</th>
                      <th className="text-right p-3">Qté</th>
                      <th className="text-center p-3">Statut</th>
                      <th className="text-right p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orders.data ?? [])
                      .filter((o: any) => statusFilter === "all" || o.status === statusFilter)
                      .map((o: any) => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="p-3 font-mono text-xs">{o.reference}</td>
                        <td className="p-3">
                          <div className="font-medium">{o.coffret?.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{o.coffret?.reference}</div>
                        </td>
                        <td className="p-3 text-right tabular font-semibold">{fmtInt(o.quantity)}</td>
                        <td className="p-3 text-center"><StatusBadge status={o.status} /></td>
                        <td className="p-3 text-right">
                          <div className="inline-flex gap-1.5">
                            {o.status === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "in_progress" })} disabled={setOrderStatus.isPending}>
                                <PlayCircle className="h-3.5 w-3.5" /> Lancer
                              </Button>
                            )}
                            {(o.status === "in_progress" || o.status === "priority") && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "paused" })} disabled={setOrderStatus.isPending}>
                                Pause
                              </Button>
                            )}
                            {o.status === "paused" && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "in_progress" })} disabled={setOrderStatus.isPending}>
                                Reprendre
                              </Button>
                            )}
                            {(o.status === "draft" || o.status === "in_progress") && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "priority" })} disabled={setOrderStatus.isPending}>
                                Prioriser
                              </Button>
                            )}
                            {(o.status === "in_progress" || o.status === "priority" || o.status === "paused") && (
                              <Button size="sm" variant="outline" onClick={() => validateOrder.mutate(o.id)} disabled={validateOrder.isPending}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Valider
                              </Button>
                            )}
                            {(o.status === "draft" || o.status === "paused") && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "canceled" })} disabled={setOrderStatus.isPending}>
                                Annuler
                              </Button>
                            )}
                            {o.status === "done" && (
                              <span className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Termine</span>
                            )}
                            {(o.status === "canceled" || o.status === "cancelled") && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">Annule</span>
                            )}
                          </div>
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
