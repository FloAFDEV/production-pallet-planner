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
import erpMark from "@/assets/erp-mark.svg";

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
  }

  const createShipment = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("BL introuvable");

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

      const from = (shipment.data.status ?? "draft") as ShipmentStatus;
      const allowedFrom: Record<ShipmentStatus, ShipmentStatus[]> = {
        draft: ["packing"],
        packing: ["draft", "ready"],
        ready: ["packing", "shipped"],
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
      }

      const { error } = await sb.from("shipments").update({ status }).eq("id", shipment.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPalette = useMutation({
    mutationFn: async () => {
      if (!shipment.data?.id) throw new Error("Expedition introuvable");
      const next = ((shipment.data.pallets ?? []).length + 1).toString().padStart(3, "0");
      const { error } = await sb.from("shipment_pallets").insert({
        shipment_id: shipment.data.id,
        label: `PAL-${next}`,
        type: "standard",
        computed_weight: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allocateLine = useMutation({
    mutationFn: async () => {
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
    },
    onSuccess: () => {
      setAllocQty("1");
      qc.invalidateQueries({ queryKey: ["shipment", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shipmentStatus = (shipment.data?.status ?? "draft") as ShipmentStatus;
  const isEditable = shipmentStatus === "draft";
  const isPacking = shipmentStatus === "packing";
  const isReadonly = shipmentStatus === "shipped";

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
              <img src={erpMark} alt="Coffret ERP" className="h-10 ml-auto mb-2" />
              <div className="font-display text-lg font-semibold">Coffret ERP</div>
              <div className="text-xs text-muted-foreground">Production de coffrets</div>
            </div>
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
              <img src={erpMark} alt="Cachet ERP" className="h-8 mb-2 opacity-70" />
              <div className="border-b border-border h-16"></div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Signature destinataire</div>
              <img src={erpMark} alt="Cachet client" className="h-8 mb-2 opacity-40" />
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
                  <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate("draft")} disabled={isReadonly || updateShipmentStatus.isPending}>Draft</Button>
                  <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate("packing")} disabled={isReadonly || updateShipmentStatus.isPending}>Packing</Button>
                  <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate("ready")} disabled={isReadonly || updateShipmentStatus.isPending}>Ready</Button>
                  <Button size="sm" variant="outline" onClick={() => updateShipmentStatus.mutate("shipped")} disabled={isReadonly || updateShipmentStatus.isPending}>Shipped</Button>
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
