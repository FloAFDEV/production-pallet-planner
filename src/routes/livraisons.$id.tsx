import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer } from "lucide-react";
import { fmtDate, fmtInt, fmtKg, fmtPalette } from "@/lib/format";
import { livraisonStatusMeta, shipmentStatusMeta, type ShipmentStatus } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import agecetLogo from "@/assets/logo_agecet_hands.jpg";
import { UI } from "@/lib/uiLabels";

export const Route = createFileRoute("/livraisons/$id")({
  head: () => ({
    meta: [
      { title: "Bon de livraison — Coffret ERP" },
      { name: "description", content: "Bon de livraison imprimable." },
    ],
  }),
  component: LivraisonDetail,
});

function LivraisonDetail() {
  const sb = supabase as any;
  const qc = useQueryClient();
  const { id } = Route.useParams();
  const [allocPaletteId, setAllocPaletteId] = useState<string>("");
  const [allocLineId, setAllocLineId] = useState<string>("");
  const [allocQty, setAllocQty] = useState<string>("1");

  const { data, isLoading } = useQuery({
    queryKey: ["livraison", id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("livraisons")
        .select("*, client_entity:clients(id,name,address,city,postal_code,country), items:livraison_items(*, coffret:coffrets(reference,name,poids_coffret,nb_par_palette))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const shipment = useQuery({
    queryKey: ["shipment", id],
    enabled: Boolean(data?.reference),
    queryFn: async () => {
      const { data: ship, error } = await sb
        .from("shipments")
        .select(
          "id,reference,status,total_weight,total_pallets,lines:shipment_lines(id,quantity,weight,product_variant_id),pallets:shipment_pallets(id,label,type,weight,width,height,depth,computed_weight,pallet_lines:shipment_pallet_lines(id,quantity,shipment_line_id))"
        )
        .eq("reference", data.reference)
        .single();
      if (error) {
        // Si aucune expedition n'est encore reliee au BL, on n'affiche rien.
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return ship;
    },
  });

  async function logAudit(action: string, payload: Record<string, unknown>) {
    await sb.from("logs").insert({
      entity_type: "shipment",
      entity_id: shipment.data?.id ?? null,
      action,
      payload,
      created_by: null,
    });
  }

  async function snapshotLivraison(event: string, reason?: string) {
    if (!data) return;
    const snapshot = {
      livraison: {
        id: data.id,
        reference: data.reference,
        status: data.status,
        date: data.date,
        client_id: data.client_id,
        client: data.client,
        adresse: data.adresse,
        total_palette: data.total_palette,
        total_poids: data.total_poids,
      },
      items: data.items ?? [],
      shipment: shipment.data ?? null,
    };

    const { error } = await sb.from("logs").insert({
      entity_type: "livraison",
      entity_id: data.id,
      action: `livraison_${event}`,
      payload: { reason: reason ?? null, snapshot },
      created_by: null,
    });
    if (error) throw error;
  }

  async function recalcShipmentTotals(shipmentId: string) {
    const { data: lines, error: eLines } = await sb
      .from("shipment_lines")
      .select("id, quantity, weight")
      .eq("shipment_id", shipmentId);
    if (eLines) throw eLines;

    const { data: pallets, error: ePallets } = await sb
      .from("shipment_pallets")
      .select("id, computed_weight, weight")
      .eq("shipment_id", shipmentId);
    if (ePallets) throw ePallets;

    const { data: palletLines, error: ePalletLines } = await sb
      .from("shipment_pallet_lines")
      .select("id, pallet_id, shipment_line_id, quantity")
      .in("pallet_id", (pallets ?? []).map((p: any) => p.id));
    if (ePalletLines) throw ePalletLines;

    const unitWeightByLine = new Map<string, number>();
    for (const line of (lines ?? []) as any[]) {
      const qty = Number(line.quantity ?? 0);
      const w = Number(line.weight ?? 0);
      unitWeightByLine.set(line.id, qty > 0 ? w / qty : 0);
    }

    const computedByPallet = new Map<string, number>();
    for (const pl of (palletLines ?? []) as any[]) {
      const unitW = unitWeightByLine.get(pl.shipment_line_id) ?? 0;
      const prev = computedByPallet.get(pl.pallet_id) ?? 0;
      computedByPallet.set(pl.pallet_id, prev + unitW * Number(pl.quantity ?? 0));
    }

    for (const p of (pallets ?? []) as any[]) {
      if (p.computed_weight) {
        const { error } = await sb
          .from("shipment_pallets")
          .update({ weight: Number(computedByPallet.get(p.id) ?? 0) })
          .eq("id", p.id);
        if (error) throw error;
      }
    }

    const { data: palletsAfter, error: ePalletsAfter } = await sb
      .from("shipment_pallets")
      .select("id, weight")
      .eq("shipment_id", shipmentId);
    if (ePalletsAfter) throw ePalletsAfter;

    const totalWeight = (palletsAfter ?? []).reduce((s: number, p: any) => s + Number(p.weight ?? 0), 0);
    const totalPallets = (palletsAfter ?? []).length;

    const { error: eShipment } = await sb
      .from("shipments")
      .update({ total_weight: totalWeight, total_pallets: totalPallets })
      .eq("id", shipmentId);
    if (eShipment) throw eShipment;

    if (data?.id) {
      const { error: eLivraison } = await sb
        .from("livraisons")
        .update({ total_poids: totalWeight, total_palette: totalPallets })
        .eq("id", data.id);
      if (eLivraison) throw eLivraison;
    }
  }

  const createShipment = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("BL introuvable");
      if (["delivered", "cancelled"].includes(String(data.status ?? ""))) {
        throw new Error("BL fige: expedition non modifiable.");
      }

      const { data: ship, error: eShip } = await sb
        .from("shipments")
        .insert({
          reference: data.reference,
          client_id: data.client_id ?? null,
          total_weight: data.total_poids ?? 0,
          total_pallets: 0,
          status: "draft",
        })
        .select("id")
        .single();
      if (eShip) throw eShip;

      const linePayload = (data.items ?? []).map((it: any) => ({
        shipment_id: ship.id,
        quantity: Number(it.quantity ?? 0),
        weight: Number(it.poids ?? 0),
        product_variant_id: null,
      }));
      if (linePayload.length > 0) {
        const { error: eLines } = await sb.from("shipment_lines").insert(linePayload);
        if (eLines) throw eLines;
      }

      await logAudit("shipment_prepared", {
        livraison_id: data.id,
        reference: data.reference,
      });
    },
    onSuccess: () => {
      toast.success("Expedition preparee");
      qc.invalidateQueries({ queryKey: ["shipment", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateShipmentStatus = useMutation({
    mutationFn: async (status: ShipmentStatus) => {
      if (!shipment.data?.id) throw new Error("Expedition introuvable");
      if (["delivered", "cancelled"].includes(String(data?.status ?? ""))) {
        throw new Error("BL fige: expedition non modifiable.");
      }

      const from = (shipment.data.status ?? "draft") as ShipmentStatus;
      const allowedFrom: Record<ShipmentStatus, ShipmentStatus[]> = {
        draft: ["packing", "packed"],
        packing: ["draft", "ready", "packed"],
        packed: ["draft", "ready", "packing"],
        ready: ["packing", "packed", "shipped"],
        shipped: [],
      };
      if (!allowedFrom[from].includes(status) && from !== status) {
        throw new Error(`Transition interdite: ${from} -> ${status}`);
      }

      if (status === "ready" || status === "shipped") {
        const allRemaining = Array.from(remainingByLine.values());
        const hasUnallocated = allRemaining.some((n) => n > 0);
        if (hasUnallocated) {
          throw new Error("Impossible de passer en ready/shipped: des quantites restent non allouees.");
        }
        if ((shipment.data?.pallets ?? []).length === 0) {
          throw new Error("Impossible de passer en ready/shipped: aucune palette creee.");
        }
      }

      const rpcCandidates = [
        { fn: "change_shipment_status", payload: { shipment_id: shipment.data.id, new_status: status } },
        { fn: "change_shipment_status", payload: { p_shipment_id: shipment.data.id, p_new_status: status } },
        { fn: "set_shipment_status", payload: { shipment_id: shipment.data.id, status } },
        { fn: "transition_shipment_status", payload: { p_shipment_id: shipment.data.id, p_status: status } },
      ] as const;

      let transitionApplied = false;
      let lastError: any = null;
      for (const c of rpcCandidates) {
        const { error } = await sb.rpc(c.fn, c.payload);
        if (!error) {
          transitionApplied = true;
          break;
        }
        const msg = String(error.message ?? "").toLowerCase();
        if (error.code === "PGRST202" || msg.includes("function") || msg.includes("does not exist")) {
          lastError = error;
          continue;
        }
        throw error;
      }

      if (!transitionApplied) {
        throw new Error(
          "RPC de transition indisponible (change_shipment_status / set_shipment_status / transition_shipment_status)." +
            (lastError ? ` ${lastError.message}` : "")
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment", id] });
      qc.invalidateQueries({ queryKey: ["livraison", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPalette = useMutation({
    mutationFn: async () => {
      if (!shipment.data?.id) throw new Error("Expedition introuvable");
      if (["delivered", "cancelled"].includes(String(data?.status ?? ""))) {
        throw new Error("BL fige: expedition non modifiable.");
      }
      const next = ((shipment.data.pallets ?? []).length + 1).toString().padStart(3, "0");
      const { error } = await sb.from("shipment_pallets").insert({
        shipment_id: shipment.data.id,
        label: `PAL-${next}`,
        type: "standard",
        computed_weight: true,
      });
      if (error) throw error;

      await recalcShipmentTotals(shipment.data.id);
      await logAudit("pallet_created", { label: `PAL-${next}` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allocateLine = useMutation({
    mutationFn: async () => {
      if (["delivered", "cancelled"].includes(String(data?.status ?? ""))) {
        throw new Error("BL fige: expedition non modifiable.");
      }
      const qty = parseInt(allocQty, 10);
      if (!allocPaletteId || !allocLineId || !qty || qty <= 0) throw new Error("Allocation invalide");

      const remaining = Number(remainingByLine.get(allocLineId) ?? 0);
      if (qty > remaining) {
        throw new Error(`Allocation invalide: restant ${remaining}`);
      }

      const { error } = await sb.from("shipment_pallet_lines").insert({
        pallet_id: allocPaletteId,
        shipment_line_id: allocLineId,
        quantity: qty,
      });
      if (error) throw error;

      if (shipment.data?.id) {
        await recalcShipmentTotals(shipment.data.id);
      }

      await logAudit("pallet_line_allocated", {
        pallet_id: allocPaletteId,
        shipment_line_id: allocLineId,
        quantity: qty,
      });
    },
    onSuccess: () => {
      setAllocQty("1");
      qc.invalidateQueries({ queryKey: ["shipment", id] });
      qc.invalidateQueries({ queryKey: ["livraison", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAllocatedLine = useMutation({
    mutationFn: async ({ palletLineId, palletId }: { palletLineId: string; palletId: string }) => {
      if (!shipment.data?.id) throw new Error("Expedition introuvable");
      if (["delivered", "cancelled"].includes(String(data?.status ?? ""))) {
        throw new Error("BL fige: expedition non modifiable.");
      }
      const allowed = shipmentStatus === "draft" || shipmentStatus === "packing";
      if (!allowed) {
        throw new Error("Desallocation interdite hors draft/packing.");
      }

      const confirmRemove = window.confirm("Retirer cette ligne de la palette ?");
      if (!confirmRemove) return;

      const { error } = await sb.from("shipment_pallet_lines").delete().eq("id", palletLineId);
      if (error) throw error;

      await recalcShipmentTotals(shipment.data.id);
      await logAudit("pallet_line_deallocated", {
        pallet_line_id: palletLineId,
        pallet_id: palletId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment", id] });
      qc.invalidateQueries({ queryKey: ["livraison", id] });
      toast.success("Ligne retiree de la palette");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLivraisonStatus = useMutation({
    mutationFn: async ({ status, reason }: { status: string; reason?: string }) => {
      if (!data) throw new Error("BL introuvable");
      if (String(data.status ?? "") === "delivered" && status !== "cancelled") {
        throw new Error("BL deja livre: correction via annulation tracee uniquement.");
      }

      await snapshotLivraison("before_status_change", reason);

      const { error } = await sb
        .from("livraisons")
        .update({ status })
        .eq("id", data.id);
      if (error) throw error;

      await sb.from("logs").insert({
        entity_type: "livraison",
        entity_id: data.id,
        action: "livraison_status_changed",
        payload: {
          from: data.status ?? null,
          to: status,
          reason: reason ?? null,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["livraison", id] });
      qc.invalidateQueries({ queryKey: ["livraisons"] });
      toast.success("Statut BL mis a jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shipmentStatus = (shipment.data?.status ?? "draft") as ShipmentStatus;
  const isEditable = shipmentStatus === "draft";
  const isPacking = shipmentStatus === "packing" || shipmentStatus === "packed";
  const isReadonly = shipmentStatus === "shipped";
  const isLivraisonLocked = ["delivered", "cancelled"].includes(String(data?.status ?? ""));

  const remainingByLine = useMemo(() => {
    const map = new Map<string, number>();
    const lines = (shipment.data?.lines ?? []) as any[];
    const pallets = (shipment.data?.pallets ?? []) as any[];
    for (const l of lines) map.set(l.id, Number(l.quantity ?? 0));
    for (const p of pallets) {
      for (const pl of (p.pallet_lines ?? []) as any[]) {
        map.set(pl.shipment_line_id, (map.get(pl.shipment_line_id) ?? 0) - Number(pl.quantity ?? 0));
      }
    }
    return map;
  }, [shipment.data]);

  const lineRecap = useMemo(() => {
    const lines = (shipment.data?.lines ?? []) as any[];
    const recap = lines.map((l) => {
      const total = Number(l.quantity ?? 0);
      const remaining = Number(remainingByLine.get(l.id) ?? 0);
      const allocated = total - remaining;
      const state = remaining === 0 ? "ok" : allocated > 0 ? "partial" : "blocked";
      return { id: l.id, total, allocated, remaining, state };
    });
    return recap;
  }, [shipment.data, remainingByLine]);

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  }

  return (
    <div className="bg-muted/30 min-h-screen">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link to="/livraisons" className="text-sm inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
          <Button
            onClick={() => window.print()}
            size="sm"
          >
            <Printer className="h-4 w-4" /> Imprimer
          </Button>
        </div>

        <div className="bg-card border border-border rounded-md p-6 md:p-10 shadow-sm print:shadow-none print:border-0">
          <div className="flex items-start justify-between border-b border-border pb-6 mb-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Bon de livraison</div>
              <div className="font-mono text-xl font-semibold mt-1">{data.reference}</div>
            </div>
            <div className="text-right">
              <img src={agecetLogo} alt="ESAT AGECET" className="h-10 ml-auto mb-2 rounded-sm" />
              <div className="font-display text-lg font-semibold">Coffret ERP</div>
              <div className="text-xs text-muted-foreground">Production de coffrets</div>
            </div>
          </div>

          <div className="mb-4 print:hidden flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => updateLivraisonStatus.mutate({ status: "prepared" })} disabled={isLivraisonLocked || updateLivraisonStatus.isPending}>Marquer prepare</Button>
            <Button size="sm" variant="outline" onClick={() => updateLivraisonStatus.mutate({ status: "loaded" })} disabled={isLivraisonLocked || updateLivraisonStatus.isPending}>Marquer charge</Button>
            <Button size="sm" variant="outline" onClick={() => updateLivraisonStatus.mutate({ status: "delivered" })} disabled={String(data.status ?? "") === "cancelled" || updateLivraisonStatus.isPending}>Valider livre</Button>
            <Button size="sm" variant="outline" onClick={() => {
              const reason = window.prompt("Motif d'annulation du BL");
              if (reason && reason.trim()) updateLivraisonStatus.mutate({ status: "cancelled", reason });
            }} disabled={updateLivraisonStatus.isPending}>Annuler BL</Button>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Livré à</div>
              <div className="font-semibold">{data.client_entity?.name ?? data.client ?? "Client"}</div>
              <div className="text-muted-foreground whitespace-pre-line">{data.adresse}</div>
              {data.status && (
                <div className="mt-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${livraisonStatusMeta[data.status]?.cls ?? "bg-muted text-muted-foreground"}`}>
                    {livraisonStatusMeta[data.status]?.label ?? data.status}
                  </span>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Date de livraison</div>
              <div className="font-semibold">{fmtDate(data.date)}</div>
            </div>
          </div>

          <table className="w-full text-sm border border-border">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2.5 border-b border-border">Référence</th>
                <th className="text-left p-2.5 border-b border-border">Désignation</th>
                <th className="text-right p-2.5 border-b border-border">Qté</th>
                <th className="text-right p-2.5 border-b border-border">Palettes</th>
                <th className="text-right p-2.5 border-b border-border">Poids</th>
              </tr>
            </thead>
            <tbody>
              {data.items?.map((it) => (
                <tr key={it.id} className="border-b border-border">
                  <td className="p-2.5 font-mono text-xs">{it.coffret?.reference}</td>
                  <td className="p-2.5">{it.coffret?.name}</td>
                  <td className="p-2.5 text-right tabular">{fmtInt(it.quantity)}</td>
                  <td className="p-2.5 text-right tabular">{fmtPalette(it.palettes)}</td>
                  <td className="p-2.5 text-right tabular">{fmtKg(it.poids)}</td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={3} className="p-2.5 text-right">Totaux</td>
                <td className="p-2.5 text-right tabular">{fmtPalette(data.total_palette)}</td>
                <td className="p-2.5 text-right tabular">{fmtKg(data.total_poids)}</td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-8 mt-12 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Signature expéditeur</div>
              <img src={agecetLogo} alt="ESAT AGECET" className="h-8 mb-2 opacity-70 rounded-sm" />
              <div className="border-b border-border h-16"></div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Signature destinataire</div>
              <img src={agecetLogo} alt="ESAT AGECET" className="h-8 mb-2 opacity-40 rounded-sm" />
              <div className="border-b border-border h-16">{data.signature ?? ""}</div>
            </div>
          </div>

          <div className="mt-10 border-t border-border pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Palettisation expedition</h3>
              {!shipment.data ? (
                <Button size="sm" onClick={() => createShipment.mutate()} disabled={createShipment.isPending}>
                  Preparer expedition
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{shipment.data.pallets?.length ?? 0} palette(s)</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${shipmentStatusMeta[shipmentStatus]?.cls ?? "bg-muted text-muted-foreground"}`}>
                    {shipmentStatusMeta[shipmentStatus]?.label ?? shipmentStatus}
                  </span>
                </div>
              )}
            </div>

            {!shipment.data ? (
              <p className="text-sm text-muted-foreground">Aucune expedition creee. Le BL reste une intention metier tant que la preparation n'est pas lancee.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 print:hidden">
                  <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate("draft")} disabled={isLivraisonLocked || isReadonly || updateShipmentStatus.isPending}>Draft</Button>
                  <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate("packed")} disabled={isLivraisonLocked || isReadonly || updateShipmentStatus.isPending}>Packed</Button>
                  <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate("ready")} disabled={isLivraisonLocked || isReadonly || updateShipmentStatus.isPending}>Ready</Button>
                  <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate("shipped")} disabled={isLivraisonLocked || isReadonly || updateShipmentStatus.isPending}>Shipped</Button>
                </div>

                {isEditable && (
                  <div className="rounded-md border border-border bg-muted/20 p-3 print:hidden">
                    <p className="text-xs text-muted-foreground mb-2">Mode edition (draft): palettes modifiables.</p>
                    <Button size="sm" onClick={() => addPalette.mutate()} disabled={addPalette.isPending}>Ajouter une palette</Button>
                  </div>
                )}

                {isPacking && (
                  <div className="rounded-md border border-info/30 bg-info/5 p-3 print:hidden">
                    <p className="text-xs text-info mb-2">Mode packing: allocation des lignes vers palettes active.</p>
                    <div className="grid md:grid-cols-4 gap-2 items-end">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Palette</div>
                        <Select value={allocPaletteId} onValueChange={setAllocPaletteId}>
                          <SelectTrigger><SelectValue placeholder="Palette" /></SelectTrigger>
                          <SelectContent>
                            {(shipment.data.pallets ?? []).map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.label ?? p.id.slice(0, 8)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Ligne shipment</div>
                        <Select value={allocLineId} onValueChange={setAllocLineId}>
                          <SelectTrigger><SelectValue placeholder="Ligne" /></SelectTrigger>
                          <SelectContent>
                            {(shipment.data.lines ?? []).map((l: any) => (
                              <SelectItem key={l.id} value={l.id}>Ligne {l.id.slice(0, 6)} · restant {fmtInt(remainingByLine.get(l.id) ?? 0)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Quantite</div>
                        <Input type="number" min="1" value={allocQty} onChange={(e) => setAllocQty(e.target.value)} />
                      </div>
                      <Button size="sm" onClick={() => allocateLine.mutate()} disabled={allocateLine.isPending}>Affecter</Button>
                    </div>

                    <div className="mt-3 space-y-1">
                      {lineRecap.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-xs rounded border border-border px-2 py-1 bg-background/70">
                          <span className="font-mono">Ligne {r.id.slice(0, 6)}</span>
                          <span>total {fmtInt(r.total)} · alloue {fmtInt(r.allocated)} · reste {fmtInt(r.remaining)}</span>
                          <span className={r.state === "ok" ? "text-success" : r.state === "partial" ? "text-warning" : "text-destructive"}>
                            {r.state === "ok" ? "OK" : r.state === "partial" ? "Partiel" : "Bloquant"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isReadonly && (
                  <p className="text-sm text-muted-foreground">Expedition shipped: lecture seule.</p>
                )}

                {(shipment.data.pallets ?? []).map((p: any) => {
                  const qty = (p.pallet_lines ?? []).reduce((s: number, l: any) => s + Number(l.quantity ?? 0), 0);
                  return (
                    <div key={p.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">
                          {p.label ?? "Palette"} · {p.type ?? "standard"}
                        </div>
                        <div className="text-xs text-muted-foreground">{qty} coffret(s)</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        poids {fmtKg(p.weight)}
                        {p.width || p.height || p.depth
                          ? ` · ${p.width ?? "?"}x${p.height ?? "?"}x${p.depth ?? "?"}`
                          : ""}
                        {p.computed_weight ? " · calcule" : " · manuel"}
                      </div>

                      {(p.pallet_lines ?? []).length > 0 && (
                        <div className="mt-2 border-t border-border pt-2 space-y-1">
                          {(p.pallet_lines ?? []).map((pl: any) => (
                            <div key={pl.id} className="flex items-center justify-between gap-2 text-xs">
                              <span>Ligne {pl.shipment_line_id?.slice(0, 6)} · qte {fmtInt(pl.quantity)}</span>
                              {(shipmentStatus === "draft" || shipmentStatus === "packing") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => removeAllocatedLine.mutate({ palletLineId: pl.id, palletId: p.id })}
                                  disabled={removeAllocatedLine.isPending}
                                  className="h-7 px-2"
                                >
                                  Retirer de palette
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
