"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireRole } from "@/lib/security/auth";
import { calculateMargin, getStockStatus, validateStockAdjustment, validateStockReceiptCancellation, validateStockReceiptPayload, validateStockSettings, type StockReceiptInput, type StockSettingsInput } from "@/lib/domain/inventory";
import type { StockBalance, StockBatch, StockMovement, StockMovementType } from "@/types";

export interface InventorySnapshot {
  balances: StockBalance[];
  movements: StockMovement[];
  batches: StockBatch[];
}

export async function getInventorySummaryAction(): Promise<number> {
  await requireRole(["OWNER", "FINANCE"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_inventory_summary");
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

function relatedRow(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  return value as Record<string, unknown> | undefined;
}

export async function getInventoryAction(): Promise<InventorySnapshot> {
  await requireRole(["OWNER", "FINANCE"]);
  const supabase = await createClient();
  const [balanceResult, movementResult, receiptItemResult, batchResult] = await Promise.all([
    supabase.from("stock_balances").select("product_id,quantity,minimum_quantity,average_unit_cost,updated_at,products(name,sku,size,category,default_unit,default_selling_price,status)").order("updated_at", { ascending: false }).limit(5000),
    supabase.from("stock_movements").select("id,product_id,product_name_snapshot,unit,movement_type,quantity_delta,balance_after,supplier_id,customer_id,invoice_id,receipt_id,receipt_item_id,notes,occurred_at,suppliers(name),customers(name),invoices(invoice_number),stock_receipts(receipt_number,cancelled_at),stock_receipt_items(unit_cost)").order("occurred_at", { ascending: false }).limit(100),
    supabase.from("stock_receipt_items").select("product_id,unit_cost,created_at,stock_receipts!inner(supplier_id,cancelled_at)").order("created_at", { ascending: false }).limit(5000),
    supabase.from("stock_batches").select("id,product_id,supplier_id,quantity_received,quantity_remaining,unit_cost,received_at,expiry_date,status,notes,suppliers(name)").order("received_at", { ascending: false }).limit(5000),
  ]);
  if (balanceResult.error) throw new Error(balanceResult.error.message);
  if (movementResult.error) throw new Error(movementResult.error.message);
  if (receiptItemResult.error) throw new Error(receiptItemResult.error.message);
  if (batchResult.error) throw new Error(batchResult.error.message);

  const purchaseFacts = new Map<string, { latestCost?: number; suppliers: Set<string> }>();
  for (const row of receiptItemResult.data ?? []) {
    const value = row as Record<string, unknown>;
    const receipt = relatedRow(value.stock_receipts);
    if (receipt?.cancelled_at) continue;
    const productId = String(value.product_id);
    const fact = purchaseFacts.get(productId) ?? { suppliers: new Set<string>() };
    if (fact.latestCost === undefined) fact.latestCost = Number(value.unit_cost ?? 0);
    if (receipt?.supplier_id) fact.suppliers.add(String(receipt.supplier_id));
    purchaseFacts.set(productId, fact);
  }

  const balances = (balanceResult.data ?? []).map((row) => {
    const value = row as Record<string, unknown>;
    const product = relatedRow(value.products) ?? {};
    const quantity = Number(value.quantity ?? 0);
    const averageUnitCost = Number(value.average_unit_cost ?? 0);
    const defaultSellingPrice = Number(product.default_selling_price ?? 0);
    const purchaseFact = purchaseFacts.get(String(value.product_id));
    const margin = calculateMargin(defaultSellingPrice, averageUnitCost);
    return {
      productId: String(value.product_id),
      productName: String(product.name ?? "Produk tidak tersedia"),
      sku: product.sku ? String(product.sku) : undefined,
      size: product.size ? String(product.size) : undefined,
      unit: String(product.default_unit ?? "unit"),
      category: product.category ? String(product.category) : "Tanpa kategori",
      productStatus: product.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      quantity,
      minimumQuantity: Number(value.minimum_quantity ?? 0),
      averageUnitCost,
      defaultSellingPrice,
      stockValue: quantity * averageUnitCost,
      latestPurchaseCost: purchaseFact?.latestCost,
      supplierCount: purchaseFact?.suppliers.size ?? 0,
      marginNominal: margin.nominal,
      marginPercentage: margin.percentage,
      stockStatus: getStockStatus(quantity, Number(value.minimum_quantity ?? 0)),
      updatedAt: String(value.updated_at),
    } satisfies StockBalance;
  });

  const movements = (movementResult.data ?? []).map((row) => {
    const value = row as Record<string, unknown>;
    const supplier = relatedRow(value.suppliers);
    const customer = relatedRow(value.customers);
    const invoice = relatedRow(value.invoices);
    const receipt = relatedRow(value.stock_receipts);
    const receiptItem = relatedRow(value.stock_receipt_items);
    return {
      id: String(value.id),
      productId: String(value.product_id),
      productName: String(value.product_name_snapshot),
      unit: String(value.unit),
      movementType: value.movement_type as StockMovementType,
      quantityDelta: Number(value.quantity_delta ?? 0),
      balanceAfter: Number(value.balance_after ?? 0),
      supplierName: supplier?.name ? String(supplier.name) : undefined,
      customerName: customer?.name ? String(customer.name) : undefined,
      invoiceNumber: invoice?.invoice_number ? String(invoice.invoice_number) : undefined,
      receiptId: value.receipt_id ? String(value.receipt_id) : undefined,
      receiptNumber: receipt?.receipt_number ? String(receipt.receipt_number) : undefined,
      receiptCancelledAt: receipt?.cancelled_at ? String(receipt.cancelled_at) : undefined,
      purchaseUnitCost: receiptItem?.unit_cost ? Number(receiptItem.unit_cost) : undefined,
      notes: value.notes ? String(value.notes) : undefined,
      occurredAt: String(value.occurred_at),
    } satisfies StockMovement;
  });
  const batches = (batchResult.data ?? []).map((row) => {
    const value = row as Record<string, unknown>;
    const supplier = relatedRow(value.suppliers);
    return {
      id: String(value.id), productId: String(value.product_id), supplierId: value.supplier_id ? String(value.supplier_id) : undefined,
      supplierName: supplier?.name ? String(supplier.name) : undefined,
      quantityReceived: Number(value.quantity_received ?? 0), quantityRemaining: Number(value.quantity_remaining ?? 0),
      unitCost: Number(value.unit_cost ?? 0), receivedAt: String(value.received_at), expiryDate: value.expiry_date ? String(value.expiry_date) : undefined,
      status: String(value.status), notes: value.notes ? String(value.notes) : undefined,
    } satisfies StockBatch;
  });
  return { balances, movements, batches };
}

export async function createStockReceiptAction(payload: StockReceiptInput) {
  const validationError = validateStockReceiptPayload(payload);
  if (validationError) return { error: validationError };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_stock_receipt_transaction", { p_payload: payload });
    if (error) throw error;
    revalidatePath("/stock");
    revalidatePath("/products");
    revalidatePath("/pricing/purchase");
    revalidatePath("/reports/supplier-payables");
    revalidatePath("/dashboard");
    return { success: true, ...(data as { receiptId: string; receiptNumber: string; supplierBillId?: string; total: number }), message: "Penerimaan stok berhasil dicatat." };
  } catch (error) {
    return {
      error: normalizeActionError(
        error,
        "Gagal mencatat penerimaan stok. Pastikan migration inventory_management sudah diterapkan ke Supabase.",
      ),
    };
  }
}

export async function cancelStockReceiptAction(receiptId: string, reason: string) {
  const validationError = validateStockReceiptCancellation(receiptId, reason);
  if (validationError) return { error: validationError };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancel_stock_receipt_transaction", {
      p_receipt_id: receiptId,
      p_reason: reason.trim(),
    });
    if (error) throw error;
    revalidatePath("/stock");
    revalidatePath("/products");
    revalidatePath("/reports/supplier-payables");
    revalidatePath("/dashboard");
    return { success: true, ...(data as { receiptNumber: string; supplierBillVoided: boolean }), message: "Penerimaan stok berhasil dibatalkan." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal membatalkan penerimaan stok.") };
  }
}

export async function forceDeleteStockReceiptAction(receiptId: string) {
  if (!receiptId) return { error: "Penerimaan stok tidak valid." };
  try {
    await requireRole(["OWNER"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("force_delete_stock_receipt", { p_receipt_id: receiptId });
    if (error) throw error;
    revalidatePath("/stock");
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/reports/supplier-payables");
    return { success: true, ...(data as { receiptNumber: string; invoiceHistoryPreserved: boolean }), message: "Pembelian supplier dan data stok terkait berhasil dihapus." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menghapus pembelian supplier secara permanen.") };
  }
}

export async function adjustStockAction(productId: string, quantityDelta: number, notes: string) {
  const validationError = validateStockAdjustment(productId, quantityDelta, notes);
  if (validationError) return { error: validationError };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("adjust_stock_transaction", { p_product_id: productId, p_quantity_delta: quantityDelta, p_notes: notes });
    if (error) throw error;
    revalidatePath("/stock");
    revalidatePath("/products");
    return { success: true, quantity: Number(data), message: "Stok berhasil disesuaikan." };
  } catch (error) {
    return {
      error: normalizeActionError(
        error,
        "Gagal menyesuaikan stok. Pastikan migration inventory_management sudah diterapkan ke Supabase.",
      ),
    };
  }
}

export async function updateStockSettingsAction(payload: StockSettingsInput) {
  const validationError = validateStockSettings(payload);
  if (validationError) return { error: validationError };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_stock_count_transaction", {
      p_product_id: payload.productId,
      p_target_quantity: payload.targetQuantity,
      p_minimum_quantity: payload.minimumQuantity,
      p_notes: payload.notes?.trim() || null,
    });
    if (error) throw error;
    revalidatePath("/stock");
    revalidatePath("/products");
    revalidatePath("/dashboard");
    return {
      success: true,
      ...(data as { quantity: number; minimumQuantity: number; quantityDelta: number }),
      message: "Stok aktual dan batas minimum berhasil disimpan.",
    };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menyimpan stok aktual.") };
  }
}

export async function setStockMinimumAction(productId: string, minimumQuantity: number) {
  if (!productId || !Number.isFinite(minimumQuantity) || minimumQuantity < 0) return { error: "Batas minimum stok tidak valid." };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_stock_minimum", { p_product_id: productId, p_minimum_quantity: minimumQuantity });
    if (error) throw error;
    revalidatePath("/stock");
    return { success: true, minimumQuantity: Number(data), message: "Batas minimum stok berhasil disimpan." };
  } catch (error) {
    return {
      error: normalizeActionError(
        error,
        "Gagal menyimpan batas minimum stok. Pastikan migration inventory_management sudah diterapkan ke Supabase.",
      ),
    };
  }
}
