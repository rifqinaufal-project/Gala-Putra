"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireApprovedUser, requireRole } from "@/lib/security/auth";
import type { Product, ProductStatus } from "@/types";

export interface ProductOption {
  id: string;
  name: string;
  size?: string;
  defaultUnit: string;
  status: ProductStatus;
}

export interface CreateProductPayload { sku?: string; name: string; category: string; size?: string; defaultUnit: string; defaultSellingPrice?: number; activeCost?: number }
export interface UpdateProductPayload {
  id: string;
  sku?: string;
  name: string;
  category: string;
  size?: string;
  defaultUnit: string;
  defaultSellingPrice?: number;
  status?: ProductStatus;
}

function validate(payload: CreateProductPayload) {
  if (!payload.name.trim() || !payload.category.trim() || !payload.defaultUnit.trim()) return "Nama, kategori, dan satuan produk wajib diisi.";
  if ((payload.defaultSellingPrice ?? 0) < 0 || (payload.activeCost ?? 0) < 0) return "Harga produk tidak boleh negatif.";
  return null;
}

export async function createProductAction(payload: CreateProductPayload) {
  const invalid = validate(payload); if (invalid) return { error: invalid };
  try {
    await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient();
    const { data, error } = await supabase.from("products").insert({ sku: payload.sku?.trim() || null, name: payload.name.trim(), category: payload.category.trim(), size: payload.size?.trim() || null, default_unit: payload.defaultUnit.trim(), default_selling_price: payload.defaultSellingPrice ?? 0, status: "ACTIVE" }).select("id").single();
    if (error) throw error;
    if ((payload.activeCost ?? 0) > 0) {
      const { error: costError } = await supabase.rpc("set_product_average_cost", { p_product_id: data.id, p_supplier_id: null, p_unit_cost: payload.activeCost, p_effective_at: new Date().toISOString(), p_notes: "HPP awal produk" });
      if (costError) throw new Error(`Produk dibuat, tetapi HPP gagal disimpan: ${costError.message}`);
    }
    revalidatePath("/products"); revalidatePath("/stock"); revalidatePath("/pricing/purchase"); return { success: true, message: "Produk berhasil ditambahkan." };
  } catch (error) { return { error: normalizeActionError(error, "Gagal menambahkan produk.") }; }
}

export async function updateProductAction(payload: UpdateProductPayload) {
  const invalid = validate(payload); if (invalid) return { error: invalid };
  try {
    await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient();
    const { error } = await supabase.from("products").update({ sku: payload.sku?.trim() || null, name: payload.name.trim(), category: payload.category.trim(), size: payload.size?.trim() || null, default_unit: payload.defaultUnit.trim(), default_selling_price: payload.defaultSellingPrice ?? 0, status: payload.status }).eq("id", payload.id);
    if (error) throw error;
    revalidatePath("/products"); revalidatePath("/stock"); revalidatePath("/pricing/purchase"); return { success: true, message: "Produk berhasil diperbarui." };
  } catch (error) { return { error: normalizeActionError(error, "Gagal memperbarui produk.") }; }
}

export async function adjustProductAverageCostAction(productId: string, newCost: number, reason: string) {
  if (!productId || !Number.isFinite(newCost) || newCost <= 0) return { error: "HPP baru harus lebih besar dari nol." };
  if (typeof reason !== "string" || !reason.trim()) return { error: "Alasan penyesuaian HPP wajib diisi." };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("adjust_product_average_cost", {
      p_product_id: productId,
      p_new_cost: newCost,
      p_reason: reason.trim(),
    });
    if (error) throw error;
    revalidatePath("/products");
    revalidatePath("/stock");
    revalidatePath("/dashboard");
    return { success: true, ...(data as { oldCost: number; newCost: number }), message: "HPP rata-rata berhasil disesuaikan dan tercatat di audit." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menyesuaikan HPP produk.") };
  }
}

export async function toggleProductStatusAction(id: string, currentStatus: ProductStatus) {
  try { await requireRole(["OWNER", "FINANCE"]); const next = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE"; const supabase = await createClient(); const { error } = await supabase.from("products").update({ status: next }).eq("id", id); if (error) throw error; revalidatePath("/products"); return { success: true, message: `Status produk diubah ke ${next}.` }; }
  catch (error) { return { error: normalizeActionError(error, "Gagal mengubah status produk.") }; }
}

export async function deleteProductAction(id: string) {
  try {
    await requireRole(["OWNER"]); const supabase = await createClient();
    const { data, error } = await supabase.rpc("force_delete_product", { p_product_id: id });
    if (error) throw error;
    revalidatePath("/products"); revalidatePath("/stock"); revalidatePath("/pricing/purchase"); revalidatePath("/pricing/selling"); revalidatePath("/dashboard");
    return { success: true, ...(data as { productName: string; invoiceHistoryPreserved: boolean }), message: "Produk dan seluruh data stok/pembeliannya berhasil dihapus. Invoice tetap tersimpan sebagai snapshot." };
  } catch (error) { return { error: normalizeActionError(error, "Gagal menghapus produk.") }; }
}

export async function getProductsAction(): Promise<Product[]> {
  const user = await requireApprovedUser();
  const supabase = await createClient();

  // Run products and stock_balances as separate queries to avoid Supabase
  // embedded-join ambiguity that causes stock_balances to return empty arrays.
  const [{ data, error }, { data: stockData, error: stockError }] = await Promise.all([
    supabase
      .from("products")
      .select("id,sku,name,category,size,default_unit,default_selling_price,status,created_at,updated_at,product_costs(unit_cost,effective_at,ended_at)")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("stock_balances")
      .select("product_id,quantity,minimum_quantity,average_unit_cost")
      .limit(5000),
  ]);

  if (error) throw new Error(error.message);
  if (stockError) throw new Error(stockError.message);

  // Build a lookup map for O(1) access per product
  const stockMap = new Map<string, { quantity: number; minimum_quantity: number; average_unit_cost: number }>();
  for (const row of stockData ?? []) {
    stockMap.set(String(row.product_id), {
      quantity: Number(row.quantity ?? 0),
      minimum_quantity: Number(row.minimum_quantity ?? 0),
      average_unit_cost: Number(row.average_unit_cost ?? 0),
    });
  }

  return (data ?? []).map((row) => {
    const product = row as Record<string, unknown>;
    const costs = Array.isArray(product.product_costs) ? product.product_costs as Array<Record<string, unknown>> : [];
    const stock = stockMap.get(String(product.id));
    const active = costs.filter((cost) => !cost.ended_at).sort((a, b) => new Date(String(b.effective_at)).getTime() - new Date(String(a.effective_at)).getTime())[0];
    const selling = Number(product.default_selling_price ?? 0);
    const activeCost = stock?.average_unit_cost || Number(active?.unit_cost ?? 0);
    return {
      id: String(product.id),
      sku: product.sku ? String(product.sku) : undefined,
      name: String(product.name),
      category: String(product.category),
      size: product.size ? String(product.size) : undefined,
      defaultUnit: String(product.default_unit),
      defaultSellingPrice: selling,
      activeCost: user.role === "STAFF" ? undefined : activeCost,
      estimatedMargin: user.role !== "STAFF" && selling > 0 && activeCost > 0 ? Number((((selling - activeCost) / selling) * 100).toFixed(1)) : undefined,
      stockQuantity: stock?.quantity ?? 0,
      minimumStock: stock?.minimum_quantity ?? 0,
      status: product.status as ProductStatus,
      createdAt: String(product.created_at),
      updatedAt: String(product.updated_at),
    };
  });
}

export async function getProductOptionsAction(): Promise<ProductOption[]> {
  await requireApprovedUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("products")
    .select("id,name,size,default_unit,status")
    .order("name", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    size: product.size ?? undefined,
    defaultUnit: product.default_unit,
    status: product.status as ProductStatus,
  }));
}
