/**
 * React hook for production feasibility checking
 * Gère la récupération de BOM et le calcul de faisabilité
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { checkProductionFeasibility } from "@/lib/productionLogic";

/**
 * Hook pour vérifier la faisabilité d'une production
 * Recalcule automatiquement quand variantId ou quantity change
 */
export function useProductionFeasibility(
  coffretId: string | undefined,
  quantity: number
) {
  const sb = supabase as any;

  const coffretQuery = useQuery({
    queryKey: ["coffrets", "feasibility", coffretId],
    enabled: !!coffretId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("coffrets")
        .select("id, reference, name")
        .eq("id", coffretId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const bomQuery = useQuery({
    queryKey: ["coffret_components", "feasibility", coffretId],
    enabled: !!coffretId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("coffret_components")
        .select("id, quantity, composant_id")
        .eq("coffret_id", coffretId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const stockQuery = useQuery({
    queryKey: ["stock_snapshot", "feasibility", coffretId],
    enabled: !!coffretId,
    queryFn: async () => {
      const lineIds = (bomQuery.data ?? []).map((line: any) => line.composant_id);
      if (lineIds.length === 0) return [];
      const { data: stockRows, error: stockError } = await sb.rpc("get_stock_snapshot_by_components", {
        component_ids: lineIds,
      });
      if (stockError) {
        console.warn("[useProductionFeasibility] stock snapshot unavailable", stockError.message);
      }
      const stockById = new Map<string, number>((stockRows ?? []).map((row) => [row.composant_id, Number(row.available_stock ?? 0)]));

      return lineIds.map((id: string) => ({
        composant_id: id,
        available: stockById.get(id) ?? 0,
      }));
    },
  });

  const composantsQuery = useQuery({
    queryKey: ["composants", "feasibility", coffretId],
    enabled: !!coffretId,
    queryFn: async () => {
      const lineIds = (bomQuery.data ?? []).map((line: any) => line.composant_id);
      if (lineIds.length === 0) return [];

      const { data, error } = await sb
        .from("composants")
        .select("id, reference, name, min_stock")
        .in("id", lineIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const feasibility = (() => {
    if (!coffretQuery.data || quantity <= 0) {
      return null;
    }

    const lines = bomQuery.data ?? [];
    const availableById = new Map((stockQuery.data ?? []).map((row: any) => [row.composant_id, Number(row.available ?? 0)]));
    const compMap = new Map((composantsQuery.data ?? []).map((component: any) => [component.id, component]));
    const enrichedLines = lines.map((line: any) => ({
      id: line.id,
      quantity: line.quantity,
      composant: {
        ...(compMap.get(line.composant_id) ?? {}),
        stock: availableById.get(line.composant_id) ?? 0,
      },
    }));

    if (enrichedLines.length === 0) {
      return null;
    }

    try {
      const result = checkProductionFeasibility(
        enrichedLines,
        quantity,
        coffretQuery.data.id,
        coffretQuery.data.name
      );
      return result;
    } catch (err) {
      console.error("[useProductionFeasibility] Calc error:", err);
      return null;
    }
  })();

  return {
    isLoading: coffretQuery.isLoading || bomQuery.isLoading || composantsQuery.isLoading || stockQuery.isLoading,
    isError: coffretQuery.isError || bomQuery.isError || composantsQuery.isError || stockQuery.isError,
    error:
      coffretQuery.error ||
      bomQuery.error ||
      composantsQuery.error ||
      stockQuery.error ||
      null,
    feasibility,
    variant: coffretQuery.data,
  };
}
