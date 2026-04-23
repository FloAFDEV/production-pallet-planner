export type ProductionStatus =
  | "draft"
  | "ready"
  | "in_progress"
  | "paused"
  | "done"
  | "cancelled";

export type ProductionPriority = 0 | 1;

export type LivraisonStatus =
  | "draft"
  | "ready"
  | "shipped"
  | "delivered";

export type ShipmentStatus = LivraisonStatus;

export const productionStatusMeta: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  ready: { label: "Prêt", cls: "bg-info/15 text-info border border-info/30" },
  in_progress: { label: "En cours", cls: "bg-info/15 text-info border border-info/30" },
  paused: { label: "En pause", cls: "bg-warning/15 text-warning border border-warning/30" },
  done: { label: "Terminé", cls: "bg-success/15 text-success border border-success/30" },
  cancelled: { label: "Annulé", cls: "bg-muted text-muted-foreground border border-border" },
};

export const productionPriorityMeta: Record<ProductionPriority, { label: string; cls: string }> = {
  0: { label: "Normal", cls: "bg-muted text-muted-foreground border border-border" },
  1: { label: "Urgent", cls: "bg-destructive/15 text-destructive border border-destructive/30" },
};

export const livraisonStatusMeta: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  ready: { label: "Prêt", cls: "bg-info/15 text-info border border-info/30" },
  shipped: { label: "Expédié", cls: "bg-warning/15 text-warning border border-warning/30" },
  delivered: { label: "Livré", cls: "bg-success/15 text-success border border-success/30" },
};

export const shipmentStatusMeta: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  ready: { label: "Prêt", cls: "bg-info/15 text-info border border-info/30" },
  shipped: { label: "Expédié", cls: "bg-warning/15 text-warning border border-warning/30" },
  delivered: { label: "Livré", cls: "bg-success/15 text-success border border-success/30" },
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
