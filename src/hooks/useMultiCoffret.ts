/**
 * Hook for multi-coffret production planning
 * ESAT-AGECET STRICT MODE - aligned with real Supabase backend
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
 * MULTI COFFRET FEASIBILITY (SAFE MODE)
 * Uses simulate_production per coffret (fallback safe architecture)
 */
export function useMultiCoffretFeasibility(
  orders: MultiCoffretOrder[],
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["feasibility_multi", orders],
    enabled: enabled && orders.length > 0,
    queryFn: async () => {
      try {
        const results = [];

        for (const order of orders) {
          const { data, error } = await supabase.rpc(
            "simulate_production",
            {
              p_coffret_id: order.variantId,
              p_quantity: order.quantity,
            }
          );

          if (error) throw error;

          results.push({
            order,
            simulation: data,
          });
        }

        // Aggregation simple côté front (SAFE)
        const okCount = results.filter((r) => r.simulation?.ok).length;
        const total = results.length;

        return {
          ok: okCount === total,
          orders,
          summary: {
            total_components: 0,
            ok_count: okCount,
            low_count: 0,
            missing_count: total - okCount,
          },
          components: [],
        } as MultiCoffretFeasibility;
      } catch (error) {
        console.error("[MultiCoffretFeasibility]", error);
        throw error;
      }
    },
  });
}

/**
 * CREATE PRODUCTION ORDER (REAL FLOW)
 * IMPORTANT: NO FAKE RPC, ONLY REAL INSERT
 */
export function useCreateProductionOrderSafe() {
  return useMutation({
    mutationFn: async (params: {
      coffret_id: string;
      quantity: number;
      status?: "draft" | "ready" | "in_progress" | "paused" | "done" | "cancelled";
      priority?: 0 | 1;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("production_orders")
        .insert({
          coffret_id: params.coffret_id,
          quantity: params.quantity,
          status: params.status ?? "draft",
          priority: params.priority ?? 0,
          notes: params.notes ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data,
      };
    },
  });
}

/**
 * CANCEL ORDER (SAFE SOFT CANCEL)
 * No RPC dependency - direct DB update
 */
export function useCancelProductionOrderSafe() {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase
        .from("production_orders")
        .update({
          status: "cancelled",
        })
        .eq("id", orderId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data,
      };
    },
  });
}