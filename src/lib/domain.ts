export type ProductionStatus =
  | "brouillon"
  | "pret"
  | "en_cours"
  | "en_pause"
  | "termine"
  | "annule";

export type ProductionPriority = 0 | 1;

export type LivraisonStatus =
  | "brouillon"
  | "pret"
  | "expedie"
  | "livre"
  | "annule";

export type ShipmentStatus = "draft" | "packing" | "packed" | "ready" | "shipped";

export const productionStatusMeta: Record<string, { label: string; cls: string }> = {
  brouillon: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  pret: { label: "Pret", cls: "bg-info/15 text-info border border-info/30" },
  en_cours: { label: "En cours", cls: "bg-info/15 text-info border border-info/30" },
  en_pause: { label: "En pause", cls: "bg-warning/15 text-warning border border-warning/30" },
  termine: { label: "Termine", cls: "bg-success/15 text-success border border-success/30" },
  annule: { label: "Annule", cls: "bg-muted text-muted-foreground border border-border" },
};

export const productionPriorityMeta: Record<ProductionPriority, { label: string; cls: string }> = {
  0: { label: "Normal", cls: "bg-muted text-muted-foreground border border-border" },
  1: { label: "Urgent", cls: "bg-destructive/15 text-destructive border border-destructive/30" },
};

export const livraisonStatusMeta: Record<string, { label: string; cls: string }> = {
  brouillon: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  pret: { label: "Pret", cls: "bg-info/15 text-info border border-info/30" },
  expedie: { label: "Expedie", cls: "bg-warning/15 text-warning border border-warning/30" },
  livre: { label: "Livre", cls: "bg-success/15 text-success border border-success/30" },
  annule: { label: "Annule", cls: "bg-muted text-muted-foreground border border-border" },
};

export const shipmentStatusMeta: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  packing: { label: "Preparation", cls: "bg-info/15 text-info border border-info/30" },
  packed: { label: "Pret", cls: "bg-info/15 text-info border border-info/30" },
  ready: { label: "Expedie", cls: "bg-warning/15 text-warning border border-warning/30" },
  shipped: { label: "Livre", cls: "bg-success/15 text-success border border-success/30" },
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
