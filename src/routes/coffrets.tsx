import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtInt, fmtKg } from "@/lib/format";

export const Route = createFileRoute("/coffrets")({
  head: () => ({
    meta: [
      { title: "Coffrets — Coffret ERP" },
      { name: "description", content: "Edition des coffrets, nomenclatures et types de palettes." },
    ],
  }),
  component: CoffretsPage,
});

function CoffretsPage() {
  const sb = supabase as any;
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string>("");
  const [editRef, setEditRef] = useState("");
  const [editName, setEditName] = useState("");
  const [editWeight, setEditWeight] = useState("0");
  const [editActive, setEditActive] = useState<boolean>(true);

  const [newCompId, setNewCompId] = useState("");
  const [newCompQty, setNewCompQty] = useState("1");

  const [newPaletteLabel, setNewPaletteLabel] = useState("");
  const [newPaletteLength, setNewPaletteLength] = useState("");
  const [newPaletteWidth, setNewPaletteWidth] = useState("");
  const [newPaletteHeight, setNewPaletteHeight] = useState("");
  const [newPaletteMax, setNewPaletteMax] = useState("");

  const [linkPaletteTypeId, setLinkPaletteTypeId] = useState("");
  const [linkNbPerPalette, setLinkNbPerPalette] = useState("1");
  const [linkWeight, setLinkWeight] = useState("0");

  const coffrets = useQuery({
    queryKey: ["coffrets", "manage"],
    queryFn: async () => {
      const { data, error } = await sb.from("coffrets").select("*").order("reference");
      if (error) throw error;
      return data as any[];
    },
  });

  const composants = useQuery({
    queryKey: ["composants", "light"],
    queryFn: async () => {
      const { data, error } = await sb.from("composants").select("id,reference,name").order("reference");
      if (error) throw error;
      return data as any[];
    },
  });

  const nomenclatures = useQuery({
    queryKey: ["nomenclatures", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data, error } = await sb
        .from("nomenclatures")
        .select("id, quantity, is_active, composant_id, composant:composants(reference,name)")
        .eq("coffret_id", selectedId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const paletteTypes = useQuery({
    queryKey: ["palette_types"],
    queryFn: async () => {
      const { data, error } = await sb.from("palette_types").select("*").order("label");
      if (error) throw error;
      return data as any[];
    },
  });

  const coffretPalettes = useQuery({
    queryKey: ["coffret_palettes", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data, error } = await sb
        .from("coffret_palettes")
        .select("id, nb_par_palette, poids_calcule, palette_type_id, palette_type:palette_types(label,length,width,height,poids_max)")
        .eq("coffret_id", selectedId);
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (!selectedId && (coffrets.data ?? []).length > 0) setSelectedId((coffrets.data ?? [])[0].id);
  }, [coffrets.data, selectedId]);

  useEffect(() => {
    const current = (coffrets.data ?? []).find((c) => c.id === selectedId);
    if (!current) return;
    setEditRef(current.reference ?? "");
    setEditName(current.name ?? "");
    setEditWeight(String(current.poids_coffret ?? 0));
    setEditActive((current.is_active ?? true) as boolean);
  }, [coffrets.data, selectedId]);

  const activeCoffret = useMemo(() => (coffrets.data ?? []).find((c) => c.id === selectedId), [coffrets.data, selectedId]);

  const saveCoffret = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Coffret non selectionne");
      const payload: Record<string, unknown> = {
        reference: editRef.trim(),
        name: editName.trim(),
        poids_coffret: Number(editWeight || 0),
        is_active: editActive,
      };
      const { error } = await sb.from("coffrets").update(payload).eq("id", selectedId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Coffret mis a jour");
      qc.invalidateQueries({ queryKey: ["coffrets", "manage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNomenclature = useMutation({
    mutationFn: async () => {
      if (!selectedId || !newCompId) throw new Error("Coffret et composant requis");
      const quantity = parseInt(newCompQty, 10);
      if (!quantity || quantity <= 0) throw new Error("Quantite invalide");

      const { error } = await sb.from("nomenclatures").insert({
        coffret_id: selectedId,
        composant_id: newCompId,
        quantity,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ligne nomenclature ajoutee");
      setNewCompId("");
      setNewCompQty("1");
      qc.invalidateQueries({ queryKey: ["nomenclatures", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateNomenclature = useMutation({
    mutationFn: async ({ id, quantity, is_active }: { id: string; quantity?: number; is_active?: boolean }) => {
      const payload: Record<string, unknown> = {};
      if (quantity != null) payload.quantity = quantity;
      if (is_active != null) payload.is_active = is_active;
      const { error } = await sb.from("nomenclatures").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nomenclatures", selectedId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNomenclature = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("nomenclatures").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ligne nomenclature supprimee");
      qc.invalidateQueries({ queryKey: ["nomenclatures", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createPaletteType = useMutation({
    mutationFn: async () => {
      if (!newPaletteLabel.trim()) throw new Error("Libelle requis");
      const { error } = await sb.from("palette_types").insert({
        label: newPaletteLabel.trim(),
        length: Number(newPaletteLength || 0),
        width: Number(newPaletteWidth || 0),
        height: Number(newPaletteHeight || 0),
        poids_max: Number(newPaletteMax || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Type de palette cree");
      setNewPaletteLabel("");
      setNewPaletteLength("");
      setNewPaletteWidth("");
      setNewPaletteHeight("");
      setNewPaletteMax("");
      qc.invalidateQueries({ queryKey: ["palette_types"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePaletteType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("palette_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Type de palette supprime");
      qc.invalidateQueries({ queryKey: ["palette_types"] });
      qc.invalidateQueries({ queryKey: ["coffret_palettes", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkPalette = useMutation({
    mutationFn: async () => {
      if (!selectedId || !linkPaletteTypeId) throw new Error("Coffret et type de palette requis");
      const payload = {
        coffret_id: selectedId,
        palette_type_id: linkPaletteTypeId,
        nb_par_palette: Number(linkNbPerPalette || 0),
        poids_calcule: Number(linkWeight || 0),
      };
      const { error } = await sb.from("coffret_palettes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Liaison coffret/palette ajoutee");
      setLinkPaletteTypeId("");
      setLinkNbPerPalette("1");
      setLinkWeight("0");
      qc.invalidateQueries({ queryKey: ["coffret_palettes", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCoffretPalette = useMutation({
    mutationFn: async ({ id, nb_par_palette, poids_calcule }: { id: string; nb_par_palette: number; poids_calcule: number }) => {
      const { error } = await sb.from("coffret_palettes").update({ nb_par_palette, poids_calcule }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coffret_palettes", selectedId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCoffretPalette = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("coffret_palettes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Liaison supprimee");
      qc.invalidateQueries({ queryKey: ["coffret_palettes", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Referentiel</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1">Gestion des coffrets</h1>
      </header>

      <div className="grid lg:grid-cols-4 gap-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Coffrets</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-y-auto">
              {(coffrets.data ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={"w-full text-left px-3 py-2 border-t border-border text-xs " + (selectedId === c.id ? "bg-muted" : "bg-background hover:bg-muted/50")}
                >
                  <div className="font-mono">{c.reference}</div>
                  <div className="truncate text-muted-foreground">{c.name}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Edition coffret</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <Label>Reference</Label>
                <Input value={editRef} onChange={(e) => setEditRef(e.target.value)} disabled={!activeCoffret} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Nom</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={!activeCoffret} />
              </div>
              <div className="space-y-1">
                <Label>Poids coffret</Label>
                <Input type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} disabled={!activeCoffret} />
              </div>
              <div className="space-y-1">
                <Label>Etat</Label>
                <Select value={editActive ? "active" : "inactive"} onValueChange={(v) => setEditActive(v === "active")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Actif</SelectItem>
                    <SelectItem value="inactive">Inactif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3 text-right">
                <Button onClick={() => saveCoffret.mutate()} disabled={!activeCoffret || saveCoffret.isPending}>Enregistrer</Button>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="nomenclature">
            <TabsList>
              <TabsTrigger value="nomenclature">Nomenclature</TabsTrigger>
              <TabsTrigger value="palettes">Palettes PRO</TabsTrigger>
            </TabsList>

            <TabsContent value="nomenclature" className="mt-3">
              <Card>
                <CardHeader><CardTitle className="text-base">Composants du coffret</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid md:grid-cols-4 gap-2 items-end">
                    <div className="md:col-span-2 space-y-1">
                      <Label>Composant</Label>
                      <Select value={newCompId} onValueChange={setNewCompId}>
                        <SelectTrigger><SelectValue placeholder="Selectionner..." /></SelectTrigger>
                        <SelectContent>
                          {(composants.data ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.reference} · {c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Quantite</Label>
                      <Input type="number" min="1" value={newCompQty} onChange={(e) => setNewCompQty(e.target.value)} />
                    </div>
                    <Button onClick={() => addNomenclature.mutate()} disabled={addNomenclature.isPending || !selectedId}>Ajouter</Button>
                  </div>

                  <div className="overflow-x-auto border border-border rounded-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left p-2">Reference</th>
                          <th className="text-left p-2">Composant</th>
                          <th className="text-right p-2">Qte</th>
                          <th className="text-center p-2">Etat</th>
                          <th className="text-right p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(nomenclatures.data ?? []).map((n) => (
                          <NomenclatureRow
                            key={n.id}
                            row={n}
                            onSave={(quantity, is_active) => updateNomenclature.mutate({ id: n.id, quantity, is_active })}
                            onDelete={() => deleteNomenclature.mutate(n.id)}
                          />
                        ))}
                        {(nomenclatures.data ?? []).length === 0 && (
                          <tr><td className="p-3 text-sm text-muted-foreground" colSpan={5}>Aucune ligne.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="palettes" className="mt-3">
              <div className="grid lg:grid-cols-2 gap-3">
                <Card>
                  <CardHeader><CardTitle className="text-base">Types de palettes</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Libelle" value={newPaletteLabel} onChange={(e) => setNewPaletteLabel(e.target.value)} />
                      <Input type="number" placeholder="Poids max" value={newPaletteMax} onChange={(e) => setNewPaletteMax(e.target.value)} />
                      <Input type="number" placeholder="Longueur" value={newPaletteLength} onChange={(e) => setNewPaletteLength(e.target.value)} />
                      <Input type="number" placeholder="Largeur" value={newPaletteWidth} onChange={(e) => setNewPaletteWidth(e.target.value)} />
                      <Input type="number" placeholder="Hauteur" value={newPaletteHeight} onChange={(e) => setNewPaletteHeight(e.target.value)} />
                      <Button onClick={() => createPaletteType.mutate()} disabled={createPaletteType.isPending}>Creer</Button>
                    </div>

                    <div className="overflow-x-auto border border-border rounded-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="text-left p-2">Type</th>
                            <th className="text-right p-2">Dimensions</th>
                            <th className="text-right p-2">Poids max</th>
                            <th className="text-right p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(paletteTypes.data ?? []).map((p) => (
                            <tr key={p.id} className="border-t border-border">
                              <td className="p-2 font-medium">{p.label}</td>
                              <td className="p-2 text-right tabular text-xs text-muted-foreground">{fmtInt(p.length)} x {fmtInt(p.width)} x {fmtInt(p.height)}</td>
                              <td className="p-2 text-right tabular">{fmtKg(p.poids_max)}</td>
                              <td className="p-2 text-right"><Button variant="outline" size="sm" onClick={() => deletePaletteType.mutate(p.id)}>Supprimer</Button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Lier au coffret</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div className="space-y-1">
                        <Label>Type palette</Label>
                        <Select value={linkPaletteTypeId} onValueChange={setLinkPaletteTypeId}>
                          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                          <SelectContent>
                            {(paletteTypes.data ?? []).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Nb / palette</Label>
                        <Input type="number" min="1" value={linkNbPerPalette} onChange={(e) => setLinkNbPerPalette(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Poids calcule</Label>
                        <Input type="number" min="0" value={linkWeight} onChange={(e) => setLinkWeight(e.target.value)} />
                      </div>
                    </div>
                    <Button onClick={() => linkPalette.mutate()} disabled={linkPalette.isPending || !selectedId}>Ajouter liaison</Button>

                    <div className="overflow-x-auto border border-border rounded-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="text-left p-2">Type</th>
                            <th className="text-right p-2">Nb/palette</th>
                            <th className="text-right p-2">Poids</th>
                            <th className="text-right p-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(coffretPalettes.data ?? []).map((cp) => (
                            <CoffretPaletteRow
                              key={cp.id}
                              row={cp}
                              onSave={(nb_par_palette, poids_calcule) => updateCoffretPalette.mutate({ id: cp.id, nb_par_palette, poids_calcule })}
                              onDelete={() => deleteCoffretPalette.mutate(cp.id)}
                            />
                          ))}
                          {(coffretPalettes.data ?? []).length === 0 && (
                            <tr><td colSpan={4} className="p-3 text-sm text-muted-foreground">Aucune liaison palette pour ce coffret.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function NomenclatureRow({ row, onSave, onDelete }: { row: any; onSave: (quantity: number, is_active: boolean) => void; onDelete: () => void }) {
  const [qty, setQty] = useState(String(row.quantity ?? 0));
  const [active, setActive] = useState((row.is_active ?? true) as boolean);

  return (
    <tr className="border-t border-border">
      <td className="p-2 font-mono text-xs">{row.composant?.reference}</td>
      <td className="p-2">{row.composant?.name}</td>
      <td className="p-2 text-right w-28">
        <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
      </td>
      <td className="p-2 text-center w-32">
        <Select value={active ? "active" : "inactive"} onValueChange={(v) => setActive(v === "active")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="inactive">Inactif</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="p-2 text-right">
        <div className="inline-flex gap-1">
          <Button variant="outline" size="sm" onClick={() => onSave(parseInt(qty, 10) || 1, active)}>Sauver</Button>
          <Button variant="outline" size="sm" onClick={onDelete}>Suppr.</Button>
        </div>
      </td>
    </tr>
  );
}

function CoffretPaletteRow({ row, onSave, onDelete }: { row: any; onSave: (nb_par_palette: number, poids_calcule: number) => void; onDelete: () => void }) {
  const [nb, setNb] = useState(String(row.nb_par_palette ?? 0));
  const [poids, setPoids] = useState(String(row.poids_calcule ?? 0));

  return (
    <tr className="border-t border-border">
      <td className="p-2">{row.palette_type?.label ?? "Type"}</td>
      <td className="p-2 text-right w-28"><Input type="number" min="1" value={nb} onChange={(e) => setNb(e.target.value)} /></td>
      <td className="p-2 text-right w-28"><Input type="number" min="0" value={poids} onChange={(e) => setPoids(e.target.value)} /></td>
      <td className="p-2 text-right">
        <div className="inline-flex gap-1">
          <Button variant="outline" size="sm" onClick={() => onSave(parseInt(nb, 10) || 1, Number(poids || 0))}>Sauver</Button>
          <Button variant="outline" size="sm" onClick={onDelete}>Suppr.</Button>
        </div>
      </td>
    </tr>
  );
}
