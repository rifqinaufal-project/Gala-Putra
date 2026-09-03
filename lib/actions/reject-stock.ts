"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireRole } from "@/lib/security/auth";
import { convertToKg, type WeightUnit } from "@/lib/domain/weights";
import type { RejectStockItem } from "@/types";

export interface RejectStockSalePayload {
  customerId: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
  items: Array<{ productId: string; quantity: number; unit: WeightUnit; sellingPricePerKg: number }>;
}

export async function getRejectStockAction(): Promise<RejectStockItem[]> {
  await requireRole(["OWNER", "FINANCE"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("reject_stock_balances").select("product_id,quantity_kg,average_unit_cost,updated_at,products(name,size)").gt("quantity_kg", 0).order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const quantityKg = Number(row.quantity_kg);
    return { productId: row.product_id, productName: product?.name ?? "Produk tidak tersedia", size: product?.size ?? undefined, quantityKg, averageUnitCost: Number(row.average_unit_cost), stockValue: quantityKg * Number(row.average_unit_cost), updatedAt: row.updated_at };
  });
}

export async function createRejectStockSaleAction(payload: RejectStockSalePayload) {
  if (!payload.customerId || !payload.items.length) return { error: "Pembeli dan minimal satu item wajib diisi." };
  if (payload.items.some((item) => convertToKg(item.quantity, item.unit) <= 0 || item.sellingPricePerKg <= 0)) return { error: "Berat dan harga jual per kg harus valid." };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_reject_stock_sale_transaction", { p_payload: payload });
    if (error) throw error;
    revalidatePath("/stock-reject");
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    return { success: true, ...(data as { invoiceId: string; invoiceNumber: string }), message: "Penjualan stok reject berhasil dibuat." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal membuat penjualan stok reject.") };
  }
}
