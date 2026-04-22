import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Printer, Trash2, Truck } from "lucide-react";
import { fmtDate, fmtInt, fmtKg, fmtPalette } from "@/lib/format";

export const Route = createFileRoute("/livraisons")({
  head: () => ({
    meta: [
      { title: "Livraisons — Coffret ERP" },
      { name: "description", content: "Création de bons de livraison, calcul automatique des palettes et du poids." },
    ],
  }),
  component: LivraisonsPage,
});

function LivraisonsPage() {
  const livraisons = useQuery({
    queryKey: ["livraisons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("livraisons")
        .select("*, items:livraison_items(*, coffret:coffrets(reference,name))")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Expédition</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Livraisons</h1>
        </div>
        <NewLivraisonDialog />
      </header>

      <div className="grid gap-4">
        {(livraisons.data ?? []).length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Aucun bon de livraison pour le moment.</CardContent></Card>
        )}
        {(livraisons.data ?? []).map((l) => (
          <Card key={l.id}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4 text-info" /> {l.client}
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  <span className="font-mono">{l.reference}</span> · {fmtDate(l.date)} · {l.adresse}
                </div>
              </div>
              <Link
                to="/livraisons/$id"
                params={{ id: l.id }}
                className="inline-flex items-center gap-1.5 text-sm rounded-md border border-input px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimer
              </Link>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Coffret</th>
                      <th className="text-right p-2">Quantité</th>
                      <th className="text-right p-2">Palettes</th>
                      <th className="text-right p-2">Poids</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.items?.map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="p-2">
                          <div className="font-medium">{it.coffret?.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{it.coffret?.reference}</div>
                        </td>
                        <td className="p-2 text-right tabular">{fmtInt(it.quantity)}</td>
                        <td className="p-2 text-right tabular">{fmtPalette(it.palettes)}</td>
                        <td className="p-2 text-right tabular">{fmtKg(it.poids)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                      <td className="p-2">Total</td>
                      <td className="p-2"></td>
                      <td className="p-2 text-right tabular">{fmtPalette(l.total_palette)}</td>
                      <td className="p-2 text-right tabular">{fmtKg(l.total_poids)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

type LineDraft = { coffret_id: string; quantity: number };

function NewLivraisonDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState("");
  const [adresse, setAdresse] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineDraft[]>([{ coffret_id: "", quantity: 1 }]);

  const coffrets = useQuery({
    queryKey: ["coffrets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coffrets").select("*").order("reference");
      if (error) throw error;
      return data;
    },
  });

  const cMap = useMemo(() => {
    const m = new Map<string, { poids_coffret: number; nb_par_palette: number }>();
    (coffrets.data ?? []).forEach((c) => m.set(c.id, { poids_coffret: c.poids_coffret, nb_par_palette: c.nb_par_palette }));
    return m;
  }, [coffrets.data]);

  const totals = useMemo(() => {
    let palettes = 0, poids = 0;
    const items = lines.filter((l) => l.coffret_id && l.quantity > 0).map((l) => {
      const c = cMap.get(l.coffret_id);
      const pal = c ? Math.ceil(l.quantity / Math.max(c.nb_par_palette, 1)) : 0;
      const p = c ? l.quantity * c.poids_coffret : 0;
      palettes += pal; poids += p;
      return { ...l, palettes: pal, poids: p };
    });
    return { items, palettes, poids };
  }, [lines, cMap]);

  const create = useMutation({
    mutationFn: async () => {
      if (!client.trim() || !adresse.trim()) throw new Error("Client et adresse requis");
      if (totals.items.length === 0) throw new Error("Ajoutez au moins une ligne");

      const { data: liv, error: e1 } = await supabase
        .from("livraisons")
        .insert({ client, adresse, date, total_palette: totals.palettes, total_poids: totals.poids })
        .select("id")
        .single();
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("livraison_items").insert(
        totals.items.map((it) => ({
          livraison_id: liv!.id,
          coffret_id: it.coffret_id,
          quantity: it.quantity,
          palettes: it.palettes,
          poids: it.poids,
        }))
      );
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Bon de livraison créé");
      qc.invalidateQueries({ queryKey: ["livraisons"] });
      setOpen(false);
      setClient(""); setAdresse(""); setLines([{ coffret_id: "", quantity: 1 }]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> Nouveau bon de livraison</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nouveau bon de livraison</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Client</Label>
              <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nom du client" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Adresse de livraison</Label>
            <Textarea rows={2} value={adresse} onChange={(e) => setAdresse(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Coffrets à livrer</Label>
              <Button variant="outline" size="sm" onClick={() => setLines((l) => [...l, { coffret_id: "", quantity: 1 }])}>
                <Plus className="h-3.5 w-3.5" /> Ligne
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Select value={l.coffret_id} onValueChange={(v) => setLines((arr) => arr.map((x, j) => (j === i ? { ...x, coffret_id: v } : x)))}>
                      <SelectTrigger><SelectValue placeholder="Coffret" /></SelectTrigger>
                      <SelectContent>
                        {(coffrets.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="font-mono text-xs mr-2">{c.reference}</span>{c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number" min="1" className="w-24"
                    value={l.quantity}
                    onChange={(e) => setLines((arr) => arr.map((x, j) => (j === i ? { ...x, quantity: parseInt(e.target.value, 10) || 0 } : x)))}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setLines((arr) => arr.filter((_, j) => j !== i))} disabled={lines.length === 1}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total palettes</div>
              <div className="font-display text-lg font-semibold tabular">{fmtPalette(totals.palettes)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Poids total</div>
              <div className="font-display text-lg font-semibold tabular">{fmtKg(totals.poids)}</div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Créer le BL</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
