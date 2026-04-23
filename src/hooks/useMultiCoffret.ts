/**
 * Hook for multi-coffret production planning
 * Allows simulating multiple coffrets at once with cumulative needs
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProductionFeasibilityResult } from "@/lib/productionLogic";

export type MultiCoffretOrder = {
  id: string;
  variantId: string;
  quantity: number;
};

export type MultiCoffretFeasibility = {
  ok: boolean;
  orders: MultiCoffretOrder[];
  summary: {
    total_components: number;
    ok_count: number;
    low_count: number;
    missing_count: number;
  };
  components: Array<{
    composant_id: string;
    reference: string;
    name: string;
    stock: number;
    reserved: number;
    available: number;
    needed: number;
    missing: number;
    after_production: number;
    min_stock: number;
    status: "OK" | "LOW" | "MISSING";
  }>;
};

/**
 * Check feasibility for multiple coffrets combined
 */
export function useMultiCoffretFeasibility(
  orders: MultiCoffretOrder[],
  enabled: boolean = true
) {
  const sb = supabase as any;

  return useQuery({
    queryKey: ["feasibility_multi", JSON.stringify(orders)],
    enabled: enabled && orders.length > 0,
    queryFn: async () => {
      // Build payload for RPC
      const orderPayload = orders.map((o) => ({
        variant_id: o.variantId,
        quantity: o.quantity,
      }));

      const { data, error } = await sb.rpc(
        "check_production_feasibility_multi",
        {
          p_orders: orderPayload,
        }
      );

      if (error) {
        console.error("[useMultiCoffretFeasibility] Error:", error);
        throw error;
      }

      return data as MultiCoffretFeasibility;
    },
  });
}

/**
 * Mutation: Create production order with safe atomicity
 */
export function useCreateProductionOrderSafe() {
  const sb = supabase as any;

  return useMutation({
    mutationFn: async (params: {
      coffret_id: string;
      quantity: number;
      status?: string;
      notes?: string;
    }) => {
      const { data, error } = await sb.rpc("create_production_order_safe", {
        p_coffret_id: params.coffret_id,
        p_quantity: params.quantity,
        p_status: params.status || "draft",
        p_notes: params.notes || null,
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    },
  });
}

/**
 * Mutation: Cancel order and unreserve stock
 */
export function useCancelProductionOrderSafe() {
  const sb = supabase as any;

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await sb.rpc(
        "cancel_production_order_with_unreserve",
        {
          p_order_id: orderId,
        }
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    },
  });
}
