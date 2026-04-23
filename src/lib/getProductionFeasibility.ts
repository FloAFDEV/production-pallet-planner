import { supabase } from "@/integrations/supabase/client";

export type ProductionFeasibilityResult = {
  can_produce: boolean;
  summary: {
    total_missing: number;
    total_components: number;
  };
  components: Array<{
    composant_id: string;
    name: string;
    needed: number;
    available: number;
    missing: number;
    status: "ok" | "missing";
  }>;
  missing: Array<{
    composant_id: string;
    name: string;
    needed: number;
    available: number;
    missing: number;
  }>;
};

export async function getProductionFeasibility(
  coffretId: string,
  quantity: number
): Promise<ProductionFeasibilityResult> {
  if (!coffretId) {
    return {
      can_produce: false,
      summary: { total_missing: 0, total_components: 0 },
      components: [],
      missing: [],
    };
  }

  const qty = Math.trunc(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      can_produce: false,
      summary: { total_missing: 0, total_components: 0 },
      components: [],
      missing: [],
    };
  }

  const sb = supabase as any;

  const { data: bomRows, error: bomError } = await sb
    .from("coffret_components")
    .select("composant_id,quantity")
    .eq("coffret_id", coffretId);
  if (bomError) throw bomError;

  const neededByComposant = new Map<string, number>();
  for (const line of (bomRows ?? []) as Array<{ composant_id: string; quantity: number }>) {
    const current = neededByComposant.get(line.composant_id) ?? 0;
    neededByComposant.set(line.composant_id, current + Number(line.quantity ?? 0) * qty);
  }

  const composantIds = Array.from(neededByComposant.keys());
  if (composantIds.length === 0) {
    return {
      can_produce: false,
      summary: { total_missing: 0, total_components: 0 },
      components: [],
      missing: [],
    };
  }

  const { data: composantRows, error: composantError } = await sb
    .from("composants")
    .select("id,name")
    .in("id", composantIds);
  if (composantError) throw composantError;

  const nameById = new Map<string, string>((composantRows ?? []).map((row: any) => [row.id, String(row.name ?? "Inconnu")]));
  const { data: stockRows, error: stockError } = await sb.rpc("get_stock_snapshot_by_components", {
    component_ids: composantIds,
  });
  if (stockError) {
    console.warn("[getProductionFeasibility] stock snapshot unavailable", stockError.message);
  }
  const stockById = new Map<string, number>((stockRows ?? []).map((row) => [row.composant_id, Number(row.available_stock ?? 0)]));

  const components = composantIds.map((composantId) => {
    const needed = neededByComposant.get(composantId) ?? 0;
    const available = stockById.get(composantId) ?? 0;
    const missing = Math.max(0, needed - available);

    return {
      composant_id: composantId,
      name: nameById.get(composantId) ?? "Inconnu",
      needed,
      available,
      missing,
      status: missing > 0 ? "missing" : "ok",
    } as const;
  });

  const missing = components
    .filter((item) => item.missing > 0)
    .map((item) => ({
      composant_id: item.composant_id,
      name: item.name,
      needed: item.needed,
      available: item.available,
      missing: item.missing,
    }));

  const totalMissing = missing.reduce((sum, item) => sum + item.missing, 0);

  return {
    can_produce: missing.length === 0,
    summary: {
      total_missing: totalMissing,
      total_components: components.length,
    },
    components,
    missing,
  };
}
