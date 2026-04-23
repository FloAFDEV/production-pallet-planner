import { supabase } from "@/integrations/supabase/client";

export type StockSnapshotRow = {
  composant_id: string;
  available_stock: number;
};

export async function getStockSnapshotByComponents(componentIds: string[]): Promise<StockSnapshotRow[]> {
  const uniqueIds = Array.from(new Set(componentIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const { data, error } = await (supabase as any).rpc("get_stock_snapshot_by_components", {
    component_ids: uniqueIds,
  });

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    composant_id: String(row.composant_id),
    available_stock: Number(row.available_stock ?? 0),
  }));
}
