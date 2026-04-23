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
import { formatClientAddress, livraisonStatusMeta, type LivraisonStatus } from "@/lib/domain";
import { UI } from "@/lib/uiLabels";
import agecetLogo from "@/assets/logo_agecet_hands.jpg";

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
  const sb = supabase as any;

  const commercialOrders = useQuery({
    queryKey: ["orders", "history"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("orders")
        .select("id, created_at, status, client_id, client:clients(id,name), lines:order_lines(quantity, product_variant_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const clientsList = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await sb.from("clients").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const livraisons = useQuery({
    queryKey: ["livraisons"],
    queryFn: async () => {
      const { data: livraisonsData, error } = await sb
        .from("livraisons")
        .select("*, items:livraison_items(*, coffret:coffrets(reference,name))")
        .order("date", { ascending: false });
      if (error) throw error;

      const clientIds = Array.from(
        new Set(((livraisonsData ?? []) as any[]).map((liv) => liv.client_id).filter(Boolean))
      );
      let clientById = new Map<string, any>();

      if (clientIds.length > 0) {
        const { data: clientsData, error: clientsError } = await sb
          .from("clients")
          .select("id,name,address,city,postal_code,country")
          .in("id", clientIds);
        if (clientsError) throw clientsError;
        clientById = new Map((clientsData ?? []).map((client: any) => [client.id, client]));
      }

      return (livraisonsData ?? []).map((liv: any) => ({
        ...liv,
        client_entity: liv.client_id ? clientById.get(liv.client_id) ?? null : null,
      }));
    },
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <img src={agecetLogo} alt="ESAT AGECET" className="h-10 w-auto rounded-sm border border-border mb-2" />
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Logistique</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">{UI.livraisons} / Bons de livraison</h1>
          <p className="text-xs text-muted-foreground mt-1">Les clients se renseignent ici (bouton Nouveau client), puis sont selectionnables a la creation d'un BL.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <CreateClientDialog />
          <NewLivraisonDialog />
        </div>
      </header>

      <ClientHistoryPanel
        livraisons={(livraisons.data ?? []) as any[]}
        clients={(clientsList.data ?? []) as any[]}
        commercialOrders={(commercialOrders.data ?? []) as any[]}
      />

      <div className="grid gap-4">
        {(livraisons.data ?? []).length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Aucun bon de livraison pour le moment.</CardContent></Card>
        )}
        {(livraisons.data ?? []).map((l: any) => (
          <Card key={l.id}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4 text-info" /> {l.client_entity?.name ?? l.client ?? "Client"}
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  <span className="font-mono">{l.reference}</span> · {fmtDate(l.date)} · {l.adresse}
                </div>
                {l.status && (
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${livraisonStatusMeta[l.status]?.cls ?? "bg-muted text-muted-foreground"}`}>
                      {livraisonStatusMeta[l.status]?.label ?? l.status}
                    </span>
                  </div>
                )}
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

function ClientHistoryPanel({
  livraisons,
  clients,
  commercialOrders,
}: {
  livraisons: any[];
  clients: any[];
  commercialOrders: any[];
}) {
  const rows = useMemo(() => {
    const byClient = new Map<string, {
      name: string;
      deliveries: number;
      totalWeight: number;
      totalPallets: number;
      totalUnits: number;
      dates: Date[];
      coffretIds: Set<string>;
    }>();

    for (const c of clients) {
      byClient.set(c.id, {
        name: c.name,
        deliveries: 0,
        totalWeight: 0,
        totalPallets: 0,
        totalUnits: 0,
        dates: [],
        coffretIds: new Set<string>(),
      });
    }

    for (const l of livraisons) {
      const key = l.client_id ?? `legacy:${l.client ?? "Sans client"}`;
      const row = byClient.get(key) ?? {
        name: l.client_entity?.name ?? l.client ?? "Sans client",
        deliveries: 0,
        totalWeight: 0,
        totalPallets: 0,
        totalUnits: 0,
        dates: [],
        coffretIds: new Set<string>(),
      };
      row.deliveries += 1;
      row.totalWeight += Number(l.total_poids ?? 0);
      row.totalPallets += Number(l.total_palette ?? 0);
      row.dates.push(new Date(l.date));

      for (const it of (l.items ?? []) as any[]) {
        row.totalUnits += Number(it.quantity ?? 0);
        if (it.coffret_id) row.coffretIds.add(it.coffret_id);
      }

      byClient.set(key, row);
    }

    const ordersByClient = new Map<string, number>();
    for (const o of commercialOrders ?? []) {
      const status = String(o.status ?? "").toLowerCase();
      if (status === "annule") continue;
      const key = o.client_id ?? o.client?.id;
      if (!key) continue;
      const current = ordersByClient.get(key) ?? 0;
      const units = ((o.lines ?? []) as any[]).reduce((s, l) => s + Number(l.quantity ?? 0), 0);
      ordersByClient.set(key, current + units);
    }

    return Array.from(byClient.entries())
      .map(([id, r]) => {
        const dates = [...r.dates].sort((a, b) => a.getTime() - b.getTime());
        const first = dates[0];
        const last = dates[dates.length - 1];
        const avgFreqDays = dates.length <= 1
          ? null
          : Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24) / (dates.length - 1));

        const indirectProductionUnits = ordersByClient.get(id) ?? 0;

        return {
          id,
          name: r.name,
          deliveries: r.deliveries,
          totalWeight: r.totalWeight,
          totalPallets: r.totalPallets,
          totalUnits: r.totalUnits,
          avgFreqDays,
          lastDate: last,
          indirectProductionUnits,
        };
      })
      .filter((r) => r.deliveries > 0)
      .sort((a, b) => b.deliveries - a.deliveries);
  }, [clients, livraisons, commercialOrders]);

  return (
    <Card className="mb-4">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Historique clients (BL / volumes / poids / frequence / demande via commandes)</CardTitle>
        <span className="text-xs text-muted-foreground">{rows.length} client(s) actif(s)</span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2.5">Client</th>
                <th className="text-right p-2.5">BL</th>
                <th className="text-right p-2.5">Volume (u.)</th>
                <th className="text-right p-2.5">Poids total</th>
                <th className="text-right p-2.5">Palettes</th>
                <th className="text-right p-2.5">Frequence (j)</th>
                <th className="text-right p-2.5">Demande cmd (u.)</th>
                <th className="text-right p-2.5">Dernier BL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2.5 font-medium">{r.name}</td>
                  <td className="p-2.5 text-right tabular">{fmtInt(r.deliveries)}</td>
                  <td className="p-2.5 text-right tabular">{fmtInt(r.totalUnits)}</td>
                  <td className="p-2.5 text-right tabular">{fmtKg(r.totalWeight)}</td>
                  <td className="p-2.5 text-right tabular">{fmtPalette(r.totalPallets)}</td>
                  <td className="p-2.5 text-right tabular">{r.avgFreqDays == null ? "—" : fmtInt(r.avgFreqDays)}</td>
                  <td className="p-2.5 text-right tabular">{fmtInt(r.indirectProductionUnits)}</td>
                  <td className="p-2.5 text-right tabular text-muted-foreground">{r.lastDate ? fmtDate(r.lastDate.toISOString()) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="p-3 text-sm text-muted-foreground" colSpan={8}>Aucun historique client exploitable pour le moment.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateClientDialog() {
  const sb = supabase as any;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("France");

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nom client requis");
      const { error } = await sb.from("clients").insert({
        name: name.trim(),
        address: address.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client cree");
      setOpen(false);
      setName("");
      setAddress("");
      setPostalCode("");
      setCity("");
      setCountry("France");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Nouveau client</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Creer un client</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Adresse</Label>
            <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label>Code postal</Label>
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Ville</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Pays</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Creer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type LineDraft = { coffret_id: string; quantity: number };

function NewLivraisonDialog() {
  const sb = supabase as any;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<LivraisonStatus>("brouillon");
  const [adresse, setAdresse] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineDraft[]>([{ coffret_id: "", quantity: 1 }]);

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await sb.from("clients").select("*").order("name");
      if (error) throw error;
      return data;
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
      const selectedClient = (clients.data ?? []).find((c: any) => c.id === clientId);
      if (!clientId || !selectedClient) throw new Error("Client requis");
      if (!adresse.trim()) throw new Error("Adresse requise");
      if (totals.items.length === 0) throw new Error("Ajoutez au moins une ligne");

      const { data: liv, error: e1 } = await sb
        .from("livraisons")
        .insert({
          client_id: clientId,
          client: selectedClient.name,
          adresse,
          date,
          status: status || "brouillon",
          total_palette: totals.palettes,
          total_poids: totals.poids,
        })
        .select("id")
        .single();
      if (e1) throw e1;

      await sb.from("logs").insert({
        entity_type: "livraison",
        entity_id: liv.id,
        action: "livraison_created",
        payload: {
          status: status || "brouillon",
          total_palette: totals.palettes,
          total_poids: totals.poids,
        },
      });

      const { error: e2 } = await sb.from("livraison_items").insert(
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
      setClientId("");
      setAdresse("");
      setStatus("brouillon");
      setLines([{ coffret_id: "", quantity: 1 }]);
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
              <Select
                value={clientId}
                onValueChange={(v) => {
                  setClientId(v);
                  const c = (clients.data ?? []).find((x: any) => x.id === v);
                  if (c) setAdresse(formatClientAddress(c));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selectionner un client" /></SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Statut livraison</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LivraisonStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="brouillon">Brouillon</SelectItem>
                <SelectItem value="pret">Pret</SelectItem>
                <SelectItem value="expedie">Expedie</SelectItem>
                <SelectItem value="livre">Livre</SelectItem>
              </SelectContent>
            </Select>
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
