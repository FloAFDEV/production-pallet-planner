/**
 * React hook for production feasibility checking
 * Gère la récupération de BOM et le calcul de faisabilité
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  checkProductionFeasibility,
} from "@/lib/productionLogic";

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
    queryKey: ["stock_movements", "feasibility", coffretId],
    enabled: !!coffretId,
    queryFn: async () => {
      const lineIds = (bomQuery.data ?? []).map((line: any) => line.composant_id);
      if (lineIds.length === 0) return [];

      const { data: inRows, error: inError } = await sb
        .from("stock_movements")
        .select("composant_id,total:quantity.sum()")
        .in("composant_id", lineIds)
        .in("type", ["IN", "ADJUST"]);
      if (inError) throw inError;

      const { data: outRows, error: outError } = await sb
        .from("stock_movements")
        .select("composant_id,total:quantity.sum()")
        .in("composant_id", lineIds)
        .eq("type", "OUT");
      if (outError) throw outError;

      const inById = new Map<string, number>((inRows ?? []).map((row: any) => [row.composant_id, Number(row.total ?? 0)]));
      const outById = new Map<string, number>((outRows ?? []).map((row: any) => [row.composant_id, Number(row.total ?? 0)]));

      return lineIds.map((id: string) => ({
        composant_id: id,
        available: (inById.get(id) ?? 0) - (outById.get(id) ?? 0),
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
