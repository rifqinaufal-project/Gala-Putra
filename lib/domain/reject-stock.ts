import { convertToKg, type WeightUnit } from "./weights.ts";

export interface RejectStockSaleItemInput {
  productId: string;
  quantity: number;
  unit: WeightUnit;
  sellingPricePerKg: number;
}

export function validateRejectStockSaleItem(item: RejectStockSaleItemInput, availableKg: number): string | null {
  const quantityKg = convertToKg(item.quantity, item.unit);
  if (!item.productId || quantityKg <= 0 || !Number.isFinite(item.sellingPricePerKg) || item.sellingPricePerKg <= 0) {
    return "Produk, berat, dan harga jual per kg wajib valid.";
  }
  if (quantityKg > availableKg) return "Jumlah penjualan melebihi stok reject yang tersedia.";
  return null;
}
