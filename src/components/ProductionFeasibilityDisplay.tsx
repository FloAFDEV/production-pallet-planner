/**
 * ProductionFeasibilityDisplay
 * Affiche la vérification de faisabilité avec codes couleur et résumé
 */

import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductionFeasibilityResult, ComponentRequirement } from "@/lib/productionLogic";
import { formatQty } from "@/lib/productionLogic";

interface Props {
  feasibility: ProductionFeasibilityResult;
  isLoading?: boolean;
}

export function ProductionFeasibilityDisplay({ feasibility, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Analyse de faisabilité...</p>
        </CardContent>
      </Card>
    );
  }

  if (!feasibility) {
    return null;
  }

  const { ok, quantity, summary, components, blockers } = feasibility;

  // Résumé global
  return (
    <div className="space-y-4">
      {/* 1. RÉSUMÉ GLOBAL */}
      <Card
        className={ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {ok ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-green-700">Fabrication possible ✓</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="text-red-700">Fabrication impossible</span>
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Quantité demandée
              </div>
              <div className="text-lg font-bold">{formatQty(quantity)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Composants vérifiés
              </div>
              <div className="text-lg font-bold">{summary.total}</div>
            </div>
            {!ok && (
              <div>
                <div className="text-xs font-medium text-red-600 mb-1">
                  Pièces manquantes
                </div>
                <div className="text-lg font-bold text-red-700">
                  {blockers.length} composant{blockers.length > 1 ? "s" : ""}
                </div>
              </div>
            )}
          </div>

          {/* Détail des blocages */}
          {!ok && (
            <div className="mt-4 pt-4 border-t">
              <Alert className="border-red-200 bg-red-100/50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800 ml-2">
                  <strong>Blocage fabrication:</strong>
                  {blockers.length === 1
                    ? ` 1 composant manquant`
                    : ` ${blockers.length} composants manquants`}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. TABLEAU DÉTAILLÉ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Détail par composant</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-32">Composant</TableHead>
                  <TableHead className="text-right w-20">Références</TableHead>
                  <TableHead className="text-right w-20">Nécessaires</TableHead>
                  <TableHead className="text-right w-20">Disponibles</TableHead>
                  <TableHead className="text-right w-16">Manquants</TableHead>
                  <TableHead className="text-right w-20">Après prod</TableHead>
                  <TableHead className="text-center w-16">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map((comp) => (
                  <ComponentRow key={comp.id} component={comp} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 3. LÉGENDE */}
      <div className="flex gap-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded" />
          <span>Stock OK</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-orange-500 rounded" />
          <span>Stock bas</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded" />
          <span>Manquant</span>
        </div>
      </div>
    </div>
  );
}

function ComponentRow({ component }: { component: ComponentRequirement }) {
  const bgClass = (() => {
    switch (component.status) {
      case "OK":
        return "bg-green-50 hover:bg-green-100";
      case "LOW":
        return "bg-orange-50 hover:bg-orange-100";
      case "MISSING":
        return "bg-red-50 hover:bg-red-100";
    }
  })();

  const statusBadgeClass = (() => {
    switch (component.status) {
      case "OK":
        return "bg-green-100 text-green-800 border-green-200";
      case "LOW":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "MISSING":
        return "bg-red-100 text-red-800 border-red-200";
    }
  })();

  const statusLabel = (() => {
    switch (component.status) {
      case "OK":
        return "✓ OK";
      case "LOW":
        return "⚠ Bas";
      case "MISSING":
        return "✗ Manque";
    }
  })();

  return (
    <TableRow className={bgClass}>
      <TableCell>
        <div className="font-medium">{component.name}</div>
        <div className="text-[11px] text-muted-foreground">{component.reference}</div>
      </TableCell>
      <TableCell className="text-right text-[11px] font-mono">
        {component.reference}
      </TableCell>
      <TableCell className="text-right font-mono font-semibold">
        {formatQty(component.required)}
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatQty(component.available)}
      </TableCell>
      <TableCell className="text-right">
        {component.missing > 0 ? (
          <span className="font-mono font-semibold text-red-600">
            -{formatQty(component.missing)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">
        <span
          className={
            component.status === "MISSING"
              ? "text-red-600 font-semibold"
              : component.status === "LOW"
                ? "text-orange-600 font-semibold"
                : "text-green-600"
          }
        >
          {formatQty(component.afterProduction)}
        </span>
        <div className="text-[10px] text-muted-foreground">
          (min: {formatQty(component.minStock)})
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="outline" className={statusBadgeClass}>
          {statusLabel}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
