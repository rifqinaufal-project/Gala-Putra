import { convertToKg, type WeightUnit } from "./weights.ts";

export type LoadInvoiceBasis = "DEPARTURE" | "ACCEPTED";

export interface LoadItemInput {
  sourceId: string;
  productId: string;
  quantity: number;
  unit: WeightUnit;
  purchasePricePerKg: number;
  sellingPricePerKg?: number;
  notes?: string;
}

export interface LoadCostInput {
  category: "ICE" | "DELIVERY" | "FUEL" | "TOLL" | "PARKING" | "LABOR" | "OTHER";
  name: string;
  amount: number;
  notes?: string;
}

export interface LoadInput {
  loadDate: string;
  destinationId: string;
  invoiceBasis: LoadInvoiceBasis;
  notes?: string;
  items: LoadItemInput[];
  costs: LoadCostInput[];
}

export function getLoadItemKg(item: LoadItemInput): number {
  return convertToKg(item.quantity, item.unit);
}

export function getLoadTotalKg(items: LoadItemInput[]): number {
  return Number(items.reduce((total, item) => total + getLoadItemKg(item), 0).toFixed(3));
}

export function validateLoadInput(payload: LoadInput): string | null {
  if (!payload?.loadDate || !payload.destinationId) return "Tanggal dan pabrik tujuan wajib diisi.";
  if (!Array.isArray(payload.items) || payload.items.length === 0) return "Tambahkan minimal satu item ikan.";
  if (payload.items.some((item) => !item.sourceId || !item.productId || getLoadItemKg(item) <= 0 || !Number.isFinite(item.purchasePricePerKg) || item.purchasePricePerKg <= 0)) {
    return "Semua item harus memiliki sumber, ikan, berat, dan harga beli per kg yang valid.";
  }
  if (payload.costs.some((cost) => !cost.name.trim() || !Number.isFinite(cost.amount) || cost.amount <= 0)) {
    return "Biaya muatan tidak valid.";
  }
  return null;
}
