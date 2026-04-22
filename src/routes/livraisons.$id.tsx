import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer } from "lucide-react";
import { fmtDate, fmtInt, fmtKg, fmtPalette } from "@/lib/format";

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
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["livraison", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("livraisons")
        .select("*, items:livraison_items(*, coffret:coffrets(reference,name,poids_coffret,nb_par_palette))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

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
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 text-sm rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:bg-primary/90"
          >
            <Printer className="h-4 w-4" /> Imprimer
          </button>
        </div>

        <div className="bg-card border border-border rounded-md p-6 md:p-10 shadow-sm print:shadow-none print:border-0">
          <div className="flex items-start justify-between border-b border-border pb-6 mb-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Bon de livraison</div>
              <div className="font-mono text-xl font-semibold mt-1">{data.reference}</div>
            </div>
            <div className="text-right">
              <div className="font-display text-lg font-semibold">Coffret ERP</div>
              <div className="text-xs text-muted-foreground">Production de coffrets</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Livré à</div>
              <div className="font-semibold">{data.client}</div>
              <div className="text-muted-foreground whitespace-pre-line">{data.adresse}</div>
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
              <div className="border-b border-border h-16"></div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Signature destinataire</div>
              <div className="border-b border-border h-16">{data.signature ?? ""}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
