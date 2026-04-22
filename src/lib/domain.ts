export type ProductionStatus =
  | "draft"
  | "in_progress"
  | "priority"
  | "done"
  | "planned"
  | "blocked"
  | "cancelled";

export type LivraisonStatus =
  | "draft"
  | "prepared"
  | "loaded"
  | "delivered"
  | "cancelled";

export const productionStatusMeta: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  planned: { label: "Planifie", cls: "bg-muted text-muted-foreground border border-border" },
  in_progress: { label: "En cours", cls: "bg-info/15 text-info border border-info/30" },
  priority: { label: "Prioritaire", cls: "bg-destructive/15 text-destructive border border-destructive/30" },
  blocked: { label: "Bloque", cls: "bg-warning/15 text-warning border border-warning/30" },
  done: { label: "Termine", cls: "bg-success/15 text-success border border-success/30" },
  cancelled: { label: "Annule", cls: "bg-muted text-muted-foreground border border-border" },
};

export const livraisonStatusMeta: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  prepared: { label: "Prepare", cls: "bg-info/15 text-info border border-info/30" },
  loaded: { label: "Charge", cls: "bg-warning/15 text-warning border border-warning/30" },
  delivered: { label: "Livre", cls: "bg-success/15 text-success border border-success/30" },
  cancelled: { label: "Annule", cls: "bg-muted text-muted-foreground border border-border" },
};

export function formatClientAddress(client: {
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}) {
  const line1 = (client.address ?? "").trim();
  const line2 = [client.postal_code, client.city].filter(Boolean).join(" ").trim();
  const line3 = (client.country ?? "").trim();
  return [line1, line2, line3].filter(Boolean).join("\n");
}
