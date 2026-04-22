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
import { AlertCircle, CheckCircle2, Flame, PlayCircle, Sparkles } from "lucide-react";
import { fmtInt, fmtKg, fmtPalette } from "@/lib/format";
import { StatusBadge } from "./index";
import { productionStatusMeta, type ProductionStatus } from "@/lib/domain";

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { title: "Production — Coffret ERP" },
      { name: "description", content: "Simulation de production, ordres de fabrication et validation des OF." },
    ],
  }),
  component: ProductionPage,
});

type SimResult = {
  fabricable: boolean;
  coffret: { id: string; reference: string; name: string };
  quantity: number;
  composants_manquants: Array<{ reference: string; name: string; needed: number; available: number; manquant: number }>;
  stock_restant: Array<{ reference: string; name: string; stock_actuel: number; reserve: number; apres_production: number }>;
  palettes: number;
  poids_total: number;
};

function ProductionPage() {
  const sb = supabase as any;
  const qc = useQueryClient();
  const [coffretId, setCoffretId] = useState<string>("");
  const [qty, setQty] = useState<string>("100");
  const [notes, setNotes] = useState<string>("");
  const [newStatus, setNewStatus] = useState<ProductionStatus>("draft");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sim, setSim] = useState<SimResult | null>(null);

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

  const simulate = useMutation({
    mutationFn: async () => {
      const quantity = parseInt(qty, 10);
      if (!coffretId || !quantity) throw new Error("Coffret et quantité requis");
      const { data, error } = await sb.rpc("simulate_production", {
        p_coffret_id: coffretId,
        p_quantity: quantity,
      });
      if (error) throw error;
      return data as unknown as SimResult;
    },
    onSuccess: (data) => {
      setSim(data);
      if (data.fabricable) toast.success("Production possible");
      else toast.error(`Production impossible : ${data.composants_manquants.length} composant(s) manquant(s)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      const quantity = parseInt(qty, 10);
      if (!coffretId || !quantity) throw new Error("Coffret et quantité requis");
      const { error } = await sb.from("production_orders").insert({
        coffret_id: coffretId,
        quantity,
        status: newStatus,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ordre de fabrication créé");
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      setSim(null); setNotes(""); setNewStatus("draft");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setOrderStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: ProductionStatus }) => {
      const payload: Record<string, unknown> = { status };
      if (status === "in_progress") payload.started_at = new Date().toISOString();
      if (status === "done") payload.finished_at = new Date().toISOString();

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

      <div className="grid lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Simulation & nouvel OF</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Coffret</Label>
              <Select value={coffretId} onValueChange={(v) => { setCoffretId(v); setSim(null); }}>
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
              <Input type="number" min="1" value={qty} onChange={(e) => { setQty(e.target.value); setSim(null); }} />
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
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => simulate.mutate()} disabled={simulate.isPending || !coffretId}>
                <Sparkles className="h-4 w-4" /> Simuler
              </Button>
              <Button className="flex-1" onClick={() => createOrder.mutate()} disabled={createOrder.isPending || !coffretId || !sim?.fabricable}>
                Créer l'OF
              </Button>
            </div>
            {!sim?.fabricable && sim && (
              <p className="text-xs text-muted-foreground">La création est bloquée tant que la simulation n'est pas valide.</p>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-4">
          {sim && <SimulationResult sim={sim} />}

          <Card>
            <CardContent className="py-3">
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { key: "all", label: "Tous" },
                  { key: "draft", label: "Brouillons" },
                  { key: "in_progress", label: "En cours" },
                  { key: "priority", label: "Prioritaires" },
                  { key: "done", label: "Termines" },
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
                            {(o.status === "draft" || o.status === "in_progress") && (
                              <Button size="sm" variant="outline" onClick={() => setOrderStatus.mutate({ orderId: o.id, status: "priority" })} disabled={setOrderStatus.isPending}>
                                Prioriser
                              </Button>
                            )}
                            {(o.status === "in_progress" || o.status === "priority") && (
                              <Button size="sm" variant="outline" onClick={() => validateOrder.mutate(o.id)} disabled={validateOrder.isPending}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Valider
                              </Button>
                            )}
                            {o.status === "done" && (
                              <span className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Termine</span>
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
    </div>
  );
}

function SimulationResult({ sim }: { sim: SimResult }) {
  return (
    <Card className={sim.fabricable ? "border-success/40" : "border-destructive/40"}>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            {sim.fabricable ? (
              <><CheckCircle2 className="h-4 w-4 text-success" /> Production possible</>
            ) : (
              <><AlertCircle className="h-4 w-4 text-destructive" /> Production impossible</>
            )}
          </span>
          <span className="text-sm font-normal text-muted-foreground">{sim.coffret.name} × {fmtInt(sim.quantity)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Palettes nécessaires" value={fmtPalette(sim.palettes)} />
          <Stat label="Poids total produit" value={fmtKg(sim.poids_total)} />
        </div>

        {sim.composants_manquants.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-destructive font-semibold mb-2 flex items-center gap-1">
              <Flame className="h-3.5 w-3.5" /> Composants manquants
            </div>
            <div className="rounded-md border border-destructive/30 bg-destructive/5 divide-y divide-destructive/15">
              {sim.composants_manquants.map((c) => (
                <div key={c.reference} className="p-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.reference}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold text-destructive">−{fmtInt(c.manquant)}</div>
                    <div className="text-[11px] text-muted-foreground">besoin {fmtInt(c.needed)} / dispo {fmtInt(c.available)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground font-semibold">Détail stock après production</summary>
          <div className="mt-2 rounded-md border border-border divide-y divide-border">
            {sim.stock_restant.map((c) => (
              <div key={c.reference} className="p-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{c.reference}</div>
                </div>
                <div className="text-right text-xs tabular">
                  <span className="text-muted-foreground">{fmtInt(c.stock_actuel)} − rés. {fmtInt(c.reserve)} →</span>{" "}
                  <span className={c.apres_production < 0 ? "text-destructive font-semibold" : "font-semibold"}>{fmtInt(c.apres_production)}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-display font-semibold tabular">{value}</div>
    </div>
  );
}
