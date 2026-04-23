/**
 * React hook for production feasibility checking
 * Gère la récupération de BOM et le calcul de faisabilité
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  checkProductionFeasibility,
  type ProductionFeasibilityResult,
} from "@/lib/productionLogic";

/**
 * Hook pour vérifier la faisabilité d'une production
 * Recalcule automatiquement quand variantId ou quantity change
 */
export function useProductionFeasibility(
  variantId: string | undefined,
  quantity: number
) {
  const sb = supabase as any;

  // 1. Récupère le variant
  const variantQuery = useQuery({
    queryKey: ["product_variants", variantId],
    enabled: !!variantId,
    queryFn: async () => {
      // product_variants = VIEW sur coffrets
      const { data, error } = await sb
        .from("product_variants")
        .select("id, reference, name")
        .eq("id", variantId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // 2. Récupère la BOM active
  const bomQuery = useQuery({
    queryKey: ["bom_versions_active", variantId],
    enabled: !!variantId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("bom_versions")
        .select("id")
        .eq("product_variant_id", variantId)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.warn(`[useProductionFeasibility] No active BOM for ${variantId}:`, error);
        throw error;
      }

      return data;
    },
  });

  // 3. Récupère les lignes BOM avec composants enrichis
  const bomLinesQuery = useQuery({
    queryKey: ["bom_lines", bomQuery.data?.id],
    enabled: !!bomQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("bom_lines")
        .select("id, quantity, composant_id")
        .eq("bom_version_id", bomQuery.data?.id);

      if (error) throw error;

      // Enrichir avec données composants
      const lineIds = (data ?? []).map((l) => l.composant_id);
      if (lineIds.length === 0) return [];

      // Fetch tous les composants
      const { data: composants, error: compError } = await sb
        .from("composants")
        .select("id, reference, name, stock, reserved_stock, min_stock")
        .in("id", lineIds);

      if (compError) throw compError;

      const compMap = new Map(composants.map((c: any) => [c.id, c]));

      return (data ?? []).map((line: any) => ({
        id: line.id,
        quantity: line.quantity,
        composant: compMap.get(line.composant_id),
      }));
    },
  });

  // 4. Calculer la faisabilité
  const feasibility = (() => {
    if (!variantQuery.data || !bomLinesQuery.data || quantity <= 0) {
      return null;
    }

    try {
      const result = checkProductionFeasibility(
        bomLinesQuery.data,
        quantity,
        variantQuery.data.id,
        variantQuery.data.name
      );
      return result;
    } catch (err) {
      console.error("[useProductionFeasibility] Calc error:", err);
      return null;
    }
  })();

  return {
    isLoading: variantQuery.isLoading || bomQuery.isLoading || bomLinesQuery.isLoading,
    isError: variantQuery.isError || bomQuery.isError || bomLinesQuery.isError,
    error:
      variantQuery.error ||
      bomQuery.error ||
      bomLinesQuery.error ||
      null,
    feasibility,
    variant: variantQuery.data,
  };
}
