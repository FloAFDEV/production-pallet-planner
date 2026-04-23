import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtInt, fmtKg, fmtPalette } from "@/lib/format";
import {
  livraisonStatusMeta,
  normalizeLivraisonStatus,
  toDbLivraisonStatus,
  type LivraisonStatus,
} from "@/lib/domain";
import { UI } from "@/lib/uiLabels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import agecetLogo from "@/assets/logo_agecet_hands.jpg";

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
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["livraison", id],
    queryFn: async () => {
      const { data: livraisonData, error } = await sb
        .from("livraisons")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;

      let clientEntity = null;
      if (livraisonData?.client_id) {
        const { data: clientData, error: clientError } = await sb
          .from("clients")
          .select("id,name,address,city,postal_code,country")
          .eq("id", livraisonData.client_id)
          .single();
        if (clientError) throw clientError;
        clientEntity = clientData;
      }

      const { data: itemRows, error: itemError } = await sb
        .from("livraison_items")
        .select("id,livraison_id,coffret_id,quantity,palettes,poids")
        .eq("livraison_id", id)
        .order("id", { ascending: true });
      if (itemError) throw itemError;

      const coffretIds = Array.from(new Set(((itemRows ?? []) as any[]).map((it) => it.coffret_id).filter(Boolean)));
      let coffretMap = new Map<string, any>();

      if (coffretIds.length > 0) {
        const { data: coffretsData, error: coffretsError } = await sb
          .from("coffrets")
          .select("id,reference,name")
          .in("id", coffretIds);
        if (coffretsError) throw coffretsError;
        coffretMap = new Map((coffretsData ?? []).map((c: any) => [c.id, c]));
      }

      return {
        ...livraisonData,
        client_entity: clientEntity,
        items: ((itemRows ?? []) as any[]).map((it) => ({
          ...it,
          coffret: coffretMap.get(it.coffret_id) ?? null,
        })),
      };
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: LivraisonStatus) => {
      const { data: rpcData, error } = await sb.rpc("transition_livraison_status", {
        p_livraison_id: id,
        p_status: toDbLivraisonStatus(status),
      });
      if (error) throw error;
      if (!rpcData?.success) {
        throw new Error(rpcData?.error || "Transition impossible");
      }
    },
    onSuccess: () => {
      toast.success("Statut BL mis a jour");
      qc.invalidateQueries({ queryKey: ["livraison", id] });
      qc.invalidateQueries({ queryKey: ["livraisons"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = normalizeLivraisonStatus(data?.status);
  const canSetReady = status === "draft";
  const canSetShipped = status === "ready";
  const canSetDelivered = status === "shipped";

  const totals = useMemo(() => {
    const items = (data?.items ?? []) as any[];
    const palettes = items.reduce((s, it) => s + Number(it.palettes ?? 0), 0);
    const poids = items.reduce((s, it) => s + Number(it.poids ?? 0), 0);
    return { palettes, poids };
  }, [data?.items]);

  if (isLoading) {
    return <div className="p-4 md:p-8 max-w-7xl mx-auto text-sm text-muted-foreground">Chargement...</div>;
  }

  if (!data) {
    return <div className="p-4 md:p-8 max-w-7xl mx-auto text-sm text-muted-foreground">Données manquantes</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="print:hidden mb-4 flex items-center justify-between gap-2">
        <Link
          to="/livraisons"
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimer
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="p-6 border-b border-border flex items-start justify-between gap-4">
          <div>
            <img src={agecetLogo} alt="ESAT AGECET" className="h-10 w-auto rounded-sm border border-border mb-3" />
            <h1 className="text-xl font-semibold">{UI.livraisons} · Bon de livraison</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Référence {data.reference ?? "Données manquantes"} · {fmtDate(data.date)}
            </p>
          </div>
          <div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${livraisonStatusMeta[status ?? ""]?.cls ?? "bg-muted text-muted-foreground"}`}>
              {livraisonStatusMeta[status ?? ""]?.label ?? "Données manquantes"}
            </span>
          </div>
        </div>

        <div className="p-6 grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold mb-2">Client</h2>
            <p className="text-sm">{data.client_entity?.name ?? data.client ?? "Données manquantes"}</p>
            <p className="text-sm text-muted-foreground mt-1">{data.adresse ?? "Données manquantes"}</p>
          </div>

          <div className="rounded-md border border-border p-3">
            <h2 className="text-sm font-semibold mb-2">Totaux</h2>
            <div className="text-sm text-muted-foreground">Palettes: {fmtPalette(data.total_palette ?? totals.palettes)}</div>
            <div className="text-sm text-muted-foreground">Poids: {fmtKg(data.total_poids ?? totals.poids)}</div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <h2 className="text-sm font-semibold mb-2">Lignes</h2>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Coffret</th>
                  <th className="text-right p-2">Quantité</th>
                  <th className="text-right p-2">Palettes</th>
                  <th className="text-right p-2">Poids</th>
                </tr>
              </thead>
              <tbody>
                {(data.items ?? []).length === 0 ? (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={4}>Données manquantes</td>
                  </tr>
                ) : (data.items ?? []).map((it: any) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="p-2">
                      <div className="font-medium">{it.coffret?.name ?? "Données manquantes"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{it.coffret?.reference ?? "Données manquantes"}</div>
                    </td>
                    <td className="p-2 text-right tabular">{fmtInt(it.quantity)}</td>
                    <td className="p-2 text-right tabular">{fmtPalette(it.palettes)}</td>
                    <td className="p-2 text-right tabular">{fmtKg(it.poids)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="print:hidden mt-4 rounded-md border border-border p-4">
        <h2 className="text-sm font-semibold mb-3">Statut livraison</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="outline" disabled={!canSetReady || updateStatus.isPending} onClick={() => updateStatus.mutate("ready")}>Marquer prêt</Button>
          <Button variant="outline" disabled={!canSetShipped || updateStatus.isPending} onClick={() => updateStatus.mutate("shipped")}>Marquer expédié</Button>
          <Button variant="outline" disabled={!canSetDelivered || updateStatus.isPending} onClick={() => updateStatus.mutate("delivered")}>Marquer livré</Button>
        </div>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motif interne (optionnel, non persisté)"
          className="max-w-md"
        />
      </div>
    </div>
  );
}
