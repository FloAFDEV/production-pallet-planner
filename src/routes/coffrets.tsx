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
import { fmtInt } from "@/lib/format";

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
  const [editNbPerPalette, setEditNbPerPalette] = useState("1");
  const [editPaletteWeight, setEditPaletteWeight] = useState("0");

  const [newCompId, setNewCompId] = useState("");
  const [newCompQty, setNewCompQty] = useState("1");

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
    queryKey: ["bom_lines", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data: activeVersion, error: versionError } = await sb
        .from("bom_versions")
        .select("id")
        .eq("product_variant_id", selectedId)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (versionError) throw versionError;
      if (!activeVersion?.id) return [];

      const { data: nomenclaturesData, error } = await sb
        .from("bom_lines")
        .select("id, quantity, composant_id")
        .eq("bom_version_id", activeVersion.id)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const composantIds = Array.from(
        new Set(((nomenclaturesData ?? []) as any[]).map((n) => n.composant_id).filter(Boolean))
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

      return ((nomenclaturesData ?? []) as any[]).map((n) => ({
        ...n,
        composant: composantMap.get(n.composant_id) ?? null,
      })) as any[];
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
    setEditNbPerPalette(String(current.nb_par_palette ?? 1));
    setEditPaletteWeight(String(current.poids_palette ?? 0));
  }, [coffrets.data, selectedId]);

  const activeCoffret = useMemo(() => (coffrets.data ?? []).find((c) => c.id === selectedId), [coffrets.data, selectedId]);

  const saveCoffret = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Coffret non selectionne");
      const payload: Record<string, unknown> = {
        reference: editRef.trim(),
        name: editName.trim(),
        poids_coffret: Number(editWeight || 0),
        nb_par_palette: Number(editNbPerPalette || 1),
        poids_palette: Number(editPaletteWeight || 0),
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

      let bomVersionId: string | null = null;
      const { data: activeVersion, error: activeVersionError } = await sb
        .from("bom_versions")
        .select("id")
        .eq("product_variant_id", selectedId)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeVersionError) throw activeVersionError;

      if (activeVersion?.id) {
        bomVersionId = activeVersion.id;
      } else {
        const { data: maxVersionRows, error: maxVersionError } = await sb
          .from("bom_versions")
          .select("version")
          .eq("product_variant_id", selectedId)
          .order("version", { ascending: false })
          .limit(1);
        if (maxVersionError) throw maxVersionError;
        const nextVersion = Number((maxVersionRows ?? [])[0]?.version ?? 0) + 1;

        const { data: createdVersion, error: createVersionError } = await sb
          .from("bom_versions")
          .insert({ product_variant_id: selectedId, version: nextVersion, is_active: true })
          .select("id")
          .single();
        if (createVersionError) throw createVersionError;
        bomVersionId = createdVersion.id;
      }

      const { error } = await sb.from("bom_lines").insert({
        bom_version_id: bomVersionId,
        composant_id: newCompId,
        quantity,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ligne nomenclature ajoutee");
      setNewCompId("");
      setNewCompQty("1");
      qc.invalidateQueries({ queryKey: ["bom_lines", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateNomenclature = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity?: number }) => {
      const payload: Record<string, unknown> = {};
      if (quantity != null) payload.quantity = quantity;
      const { error } = await sb.from("bom_lines").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bom_lines", selectedId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNomenclature = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("bom_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ligne nomenclature supprimee");
      qc.invalidateQueries({ queryKey: ["bom_lines", selectedId] });
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
                <Label>Nb / palette</Label>
                <Input type="number" min="1" value={editNbPerPalette} onChange={(e) => setEditNbPerPalette(e.target.value)} disabled={!activeCoffret} />
              </div>
              <div className="space-y-1">
                <Label>Poids palette</Label>
                <Input type="number" min="0" value={editPaletteWeight} onChange={(e) => setEditPaletteWeight(e.target.value)} disabled={!activeCoffret} />
              </div>
              <div className="md:col-span-4 text-right">
                <Button onClick={() => saveCoffret.mutate()} disabled={!activeCoffret || saveCoffret.isPending}>Enregistrer</Button>
              </div>
            </CardContent>
          </Card>

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
                  <thead className="sticky top-[88px] md:top-0 z-10 bg-muted/95 text-[11px] uppercase tracking-wider text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="text-left p-2">Reference</th>
                      <th className="text-left p-2">Composant</th>
                      <th className="text-right p-2">Qte</th>
                      <th className="text-right p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(nomenclatures.data ?? []).map((n) => (
                      <NomenclatureRow
                        key={n.id}
                        row={n}
                        onSave={(quantity) => updateNomenclature.mutate({ id: n.id, quantity })}
                        onDelete={() => deleteNomenclature.mutate(n.id)}
                      />
                    ))}
                    {(nomenclatures.data ?? []).length === 0 && (
                      <tr><td className="p-3 text-sm text-muted-foreground" colSpan={4}>Aucune ligne.</td></tr>
                    )}
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

function NomenclatureRow({ row, onSave, onDelete }: { row: any; onSave: (quantity: number) => void; onDelete: () => void }) {
  const [qty, setQty] = useState(String(row.quantity ?? 0));

  return (
    <tr className="border-t border-border">
      <td className="p-2 font-mono text-xs">{row.composant?.reference}</td>
      <td className="p-2">{row.composant?.name}</td>
      <td className="p-2 text-right w-28">
        <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
      </td>
      <td className="p-2 text-right">
        <div className="inline-flex gap-1">
          <Button variant="outline" size="sm" onClick={() => onSave(parseInt(qty, 10) || 1)}>Sauver</Button>
          <Button variant="outline" size="sm" onClick={onDelete}>Suppr.</Button>
        </div>
      </td>
    </tr>
  );
}
