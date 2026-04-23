/**
 * MultiCoffretSimulator
 * Permet de simuler la production de plusieurs coffrets en même temps
 * Affiche le cumul des besoins et détecte les conflits
 */

import { useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { MultiCoffretOrder, MultiCoffretFeasibility } from "@/hooks/useMultiCoffret";
import { useMultiCoffretFeasibility } from "@/hooks/useMultiCoffret";
import { formatQty } from "@/lib/productionLogic";

interface Props {
  coffrets: Array<{ id: string; reference: string; name: string }>;
}

export function MultiCoffretSimulator({ coffrets }: Props) {
  const [orders, setOrders] = useState<MultiCoffretOrder[]>([
    { id: "1", variantId: "", quantity: 0 },
  ]);

  const { data: feasibility, isLoading } = useMultiCoffretFeasibility(
    orders.filter((o) => o.variantId && o.quantity > 0),
    true
  );

  const addOrder = () => {
    setOrders([
      ...orders,
      {
        id: String(Date.now()),
        variantId: "",
        quantity: 0,
      },
    ]);
  };

  const removeOrder = (id: string) => {
    if (orders.length > 1) {
      setOrders(orders.filter((o) => o.id !== id));
    }
  };

  const updateOrder = (id: string, key: keyof MultiCoffretOrder, value: any) => {
    setOrders(
      orders.map((o) =>
        o.id === id ? { ...o, [key]: value } : o
      )
    );
  };

  const totalOrders = orders.filter((o) => o.variantId && o.quantity > 0).length;
  const isValid = totalOrders > 0 && feasibility?.ok;

  return (
    <div className="space-y-4">
      {/* INPUTS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Simulation multi-coffrets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {orders.map((order, idx) => (
            <div key={order.id} className="flex gap-2 items-end pb-3 border-b last:border-b-0">
              <div className="flex-1">
                <Label className="text-xs mb-1 block">Coffret</Label>
                <Select
                  value={order.variantId}
                  onValueChange={(v) => updateOrder(order.id, "variantId", v)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent>
                    {coffrets.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="font-mono text-xs mr-2">{c.reference}</span>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28">
                <Label className="text-xs mb-1 block">Quantité</Label>
                <Input
                  type="number"
                  min="0"
                  value={order.quantity}
                  onChange={(e) =>
                    updateOrder(order.id, "quantity", parseInt(e.target.value) || 0)
                  }
                  placeholder="Qty"
                  className="text-sm"
                />
              </div>
              {orders.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeOrder(order.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={addOrder}
            className="w-full mt-2"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un coffret
          </Button>
        </CardContent>
      </Card>

      {/* RÉSUMÉ */}
      {totalOrders > 0 && (
        <Card className={feasibility?.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {feasibility?.ok ? (
                <>
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="text-green-700">Fabrication possible</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <span className="text-red-700">Fabrication impossible</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Calcul en cours…</p>
            ) : feasibility ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-white/50 p-2 rounded border">
                    <div className="text-muted-foreground font-mono">Total</div>
                    <div className="font-bold text-lg">
                      {feasibility.summary.total_components}
                    </div>
                  </div>
                  <div className="bg-green-100 p-2 rounded border">
                    <div className="text-green-700 font-mono">OK</div>
                    <div className="font-bold text-lg text-green-700">
                      {feasibility.summary.ok_count}
                    </div>
                  </div>
                  <div className="bg-red-100 p-2 rounded border">
                    <div className="text-red-700 font-mono">Manquants</div>
                    <div className="font-bold text-lg text-red-700">
                      {feasibility.summary.missing_count}
                    </div>
                  </div>
                </div>

                {!feasibility.ok && feasibility.summary.missing_count > 0 && (
                  <Alert className="border-red-200 bg-red-100/50">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800 ml-2">
                      {feasibility.summary.missing_count} composant
                      {feasibility.summary.missing_count > 1 ? "s" : ""} manquant
                      {feasibility.summary.missing_count > 1 ? "s" : ""} pour cette combinaison
                    </AlertDescription>
                  </Alert>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* DÉTAIL COMPOSANTS */}
      {totalOrders > 0 && feasibility && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Impact sur le stock (cumulé)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-32">Composant</TableHead>
                    <TableHead className="text-right w-20">Stock</TableHead>
                    <TableHead className="text-right w-20">Réservé</TableHead>
                    <TableHead className="text-right w-20">Disponible</TableHead>
                    <TableHead className="text-right w-20">Cumul besoin</TableHead>
                    <TableHead className="text-right w-16">Manque</TableHead>
                    <TableHead className="text-right w-20">Après prod</TableHead>
                    <TableHead className="text-center w-16">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feasibility.components.map((comp) => (
                    <TableRow
                      key={comp.composant_id}
                      className={
                        comp.status === "OK"
                          ? "bg-green-50 hover:bg-green-100"
                          : comp.status === "LOW"
                            ? "bg-orange-50 hover:bg-orange-100"
                            : "bg-red-50 hover:bg-red-100"
                      }
                    >
                      <TableCell>
                        <div className="font-medium text-xs">{comp.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {comp.reference}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatQty(comp.stock)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-orange-600">
                        {formatQty(comp.reserved)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {formatQty(comp.available)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold">
                        {formatQty(comp.needed)}
                      </TableCell>
                      <TableCell className="text-right">
                        {comp.missing > 0 ? (
                          <span className="font-mono text-xs font-semibold text-red-600">
                            -{formatQty(comp.missing)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            comp.status === "MISSING"
                              ? "font-mono text-xs font-bold text-red-600"
                              : comp.status === "LOW"
                                ? "font-mono text-xs font-bold text-orange-600"
                                : "font-mono text-xs text-green-600"
                          }
                        >
                          {formatQty(comp.after_production)}
                        </span>
                        <div className="text-[10px] text-muted-foreground">
                          min: {formatQty(comp.min_stock)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={
                            comp.status === "OK"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : comp.status === "LOW"
                                ? "bg-orange-100 text-orange-800 border-orange-200"
                                : "bg-red-100 text-red-800 border-red-200"
                          }
                        >
                          {comp.status === "OK" ? "✓" : comp.status === "LOW" ? "⚠" : "✗"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
