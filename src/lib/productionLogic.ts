/**
 * Production feasibility check logic
 * Détermine si une production est possible en vérifiant le stock disponible
 */

export type ComponentRequirement = {
  id: string;
  reference: string;
  name: string;
  required: number; // quantité nécessaire
  available: number; // stock - reserved_stock
  stock: number; // stock brut
  reserved: number; // réservé
  missing: number; // max(0, required - available)
  afterProduction: number; // available - required
  minStock: number;
  isEnough: boolean; // available >= required
  isLowStock: boolean; // afterProduction <= minStock
  status: "OK" | "LOW" | "MISSING";
};

export type ProductionFeasibilityResult = {
  ok: boolean; // tout est disponible
  variantId: string;
  variantName: string;
  quantity: number;
  components: ComponentRequirement[];
  summary: {
    total: number;
    okCount: number;
    lowCount: number;
    missingCount: number;
  };
  blockers: ComponentRequirement[]; // composants avec status MISSING
};

/**
 * Vérifie la faisabilité d'une production
 * @param bomLines - Lignes de BOM active avec composants enrichis
 * @param quantity - Quantité à produire
 * @param variantId - ID du variant (pour ref)
 * @param variantName - Nom du variant (pour affichage)
 */
export function checkProductionFeasibility(
  bomLines: Array<{
    id: string;
    composant: {
      id: string;
      reference: string;
      name: string;
      stock: number;
      reserved_stock?: number;
      min_stock: number;
    };
    quantity: number;
  }>,
  quantity: number,
  variantId: string,
  variantName: string
): ProductionFeasibilityResult {
  const components: ComponentRequirement[] = [];
  let okCount = 0;
  let lowCount = 0;
  let missingCount = 0;

  for (const bomLine of bomLines) {
    const comp = bomLine.composant;
    const required = bomLine.quantity * quantity;
    const stock = comp.stock ?? 0;
    const reserved = comp.reserved_stock ?? 0;
    const available = stock - reserved;
    const missing = Math.max(0, required - available);
    const afterProduction = available - required;
    const minStock = comp.min_stock ?? 0;

    let status: "OK" | "LOW" | "MISSING" = "OK";
    if (missing > 0) {
      status = "MISSING";
      missingCount++;
    } else if (afterProduction <= minStock) {
      status = "LOW";
      lowCount++;
    } else {
      okCount++;
    }

    components.push({
      id: comp.id,
      reference: comp.reference,
      name: comp.name,
      required,
      available: Math.max(0, available),
      stock,
      reserved,
      missing,
      afterProduction,
      minStock,
      isEnough: available >= required,
      isLowStock: afterProduction <= minStock,
      status,
    });
  }

  const ok = missingCount === 0;
  const blockers = components.filter((c) => c.status === "MISSING");

  return {
    ok,
    variantId,
    variantName,
    quantity,
    components,
    summary: {
      total: bomLines.length,
      okCount,
      lowCount,
      missingCount,
    },
    blockers,
  };
}

/**
 * Format un nombre avec séparateur de milliers
 */
export function formatQty(num: number): string {
  return num.toLocaleString("fr-FR");
}
