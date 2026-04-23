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

  const nomenclaturesQuery = useQuery({
    queryKey: ["bom_lines", "feasibility", coffretId],
    enabled: !!coffretId,
    queryFn: async () => {
      const { data: activeVersion, error: versionError } = await sb
        .from("bom_versions")
        .select("id")
        .eq("product_variant_id", coffretId)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (versionError) throw versionError;
      if (!activeVersion?.id) return [];

      const { data, error } = await sb
        .from("bom_lines")
        .select("id, quantity, composant_id")
        .eq("bom_version_id", activeVersion.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const composantsQuery = useQuery({
    queryKey: ["composants", "feasibility", coffretId],
    enabled: !!coffretId,
    queryFn: async () => {
      const lineIds = (nomenclaturesQuery.data ?? []).map((line: any) => line.composant_id);
      if (lineIds.length === 0) return [];

      const { data, error } = await sb
        .from("composants")
        .select("id, reference, name, stock, reserved_stock, min_stock")
        .in("id", lineIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const feasibility = (() => {
    if (!coffretQuery.data || quantity <= 0) {
      return null;
    }

    const lines = nomenclaturesQuery.data ?? [];
    const compMap = new Map((composantsQuery.data ?? []).map((component: any) => [component.id, component]));
    const enrichedLines = lines.map((line: any) => ({
      id: line.id,
      quantity: line.quantity,
      composant: compMap.get(line.composant_id),
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
    isLoading: coffretQuery.isLoading || nomenclaturesQuery.isLoading || composantsQuery.isLoading,
    isError: coffretQuery.isError || nomenclaturesQuery.isError || composantsQuery.isError,
    error:
      coffretQuery.error ||
      nomenclaturesQuery.error ||
      composantsQuery.error ||
      null,
    feasibility,
    variant: coffretQuery.data,
  };
}
