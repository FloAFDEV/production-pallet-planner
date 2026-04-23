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
 * Lecture unique: coffret_components + snapshot stock PostgreSQL
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
        const coffretIds = Array.from(new Set(orders.map((order) => order.variantId).filter(Boolean)));
        const { data: bomRows, error: bomError } = await (supabase as any)
          .from("coffret_components")
          .select("coffret_id, composant_id, quantity")
          .in("coffret_id", coffretIds);
        if (bomError) throw bomError;

        const composantIds = Array.from(
          new Set(((bomRows ?? []) as any[]).map((row) => row.composant_id).filter(Boolean))
        );

        const { data: stockRows, error: stockError } = await (supabase as any).rpc("get_stock_snapshot_by_components", {
          component_ids: composantIds,
        });
        if (stockError) throw stockError;

        const { data: composantsRows, error: composantsError } = await (supabase as any)
          .from("composants")
          .select("id, reference, name, min_stock")
          .in("id", composantIds);
        if (composantsError) throw composantsError;

        const bomByCoffret = new Map<string, any[]>();
        for (const row of (bomRows ?? []) as any[]) {
          const current = bomByCoffret.get(row.coffret_id) ?? [];
          current.push(row);
          bomByCoffret.set(row.coffret_id, current);
        }

        const stockById = new Map<string, number>((stockRows ?? []).map((row: any) => [row.composant_id, Number(row.available_stock ?? 0)]));
        const compById = new Map<string, any>((composantsRows ?? []).map((row: any) => [row.id, row]));

        const neededByComposant = new Map<string, number>();
        for (const order of orders) {
          const bomLines = bomByCoffret.get(order.variantId) ?? [];
          for (const line of bomLines) {
            const current = neededByComposant.get(line.composant_id) ?? 0;
            neededByComposant.set(line.composant_id, current + Number(line.quantity ?? 0) * Number(order.quantity ?? 0));
          }
        }

        const components = Array.from(neededByComposant.entries()).map(([composant_id, needed]) => {
          const comp = compById.get(composant_id);
          const stock = stockById.get(composant_id) ?? 0;
          const after_production = stock - needed;
          const missing = Math.max(0, needed - stock);
          const min_stock = Number(comp?.min_stock ?? 0);

          const status: "OK" | "LOW" | "MISSING" =
            missing > 0 ? "MISSING" : after_production <= min_stock ? "LOW" : "OK";

          return {
            composant_id,
            reference: String(comp?.reference ?? ""),
            name: String(comp?.name ?? ""),
            stock,
            reserved: 0,
            available: stock,
            needed,
            missing,
            after_production,
            min_stock,
            status,
          };
        });

        const okCount = components.filter((c) => c.status === "OK").length;
        const lowCount = components.filter((c) => c.status === "LOW").length;
        const missingCount = components.filter((c) => c.status === "MISSING").length;

        return {
          ok: missingCount === 0,
          orders,
          summary: {
            total_components: components.length,
            ok_count: okCount,
            low_count: lowCount,
            missing_count: missingCount,
          },
          components,
        } as MultiCoffretFeasibility;
      } catch (error) {
        console.error("[MultiCoffretFeasibility]", error);
        throw error;
      }
    },
  });
}

/**
 * CREATE PRODUCTION ORDER (RPC ONLY)
 * Toute creation OF passe par create_production_order_atomic.
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
      const idempotencyKey = `multi:${params.coffret_id}:${params.quantity}:${params.status ?? "draft"}:${params.priority ?? 0}:${params.notes ?? ""}`;

      const { data, error } = await (supabase as any).rpc("create_production_order_atomic", {
        p_coffret_id: params.coffret_id,
        p_quantity: params.quantity,
        p_status: params.status ?? "draft",
        p_priority: params.priority ?? 0,
        p_notes: params.notes ?? null,
        p_idempotency_key: idempotencyKey,
      });

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || "Creation production impossible");
      }

      return {
        success: true,
        data,
      };
    },
  });
}

/**
 * CANCEL ORDER (RPC ONLY)
 */
export function useCancelProductionOrderSafe() {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await (supabase as any).rpc("cancel_production_order_with_unreserve", {
        p_order_id: orderId,
      });

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || "Annulation production impossible");
      }

      return {
        success: true,
        data,
      };
    },
  });
}