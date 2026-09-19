"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireApprovedUser, requireRole } from "@/lib/security/auth";
import { validateLoadInput, type LoadInput } from "@/lib/domain/loads";
import type { Load, LoadCost, LoadItem, LoadStatus } from "@/types";

function relatedRow(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  return value as Record<string, unknown> | undefined;
}

export async function createLoadAction(payload: LoadInput) {
  const invalid = validateLoadInput(payload);
  if (invalid) return { error: invalid };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const productIds = [...new Set(payload.items.map((item) => item.productId))];
    const { data: productRows, error: productError } = await supabase
      .from("products")
      .select("id,default_selling_price")
      .in("id", productIds);
    if (productError) throw productError;

    const defaultSellingPrices = new Map(
      (productRows ?? []).map((product) => [product.id, Number(product.default_selling_price ?? 0)]),
    );
    const normalizedPayload: LoadInput = {
      ...payload,
      items: payload.items.map((item) => ({
        ...item,
        // A load always creates a factory invoice. If no selling price was
        // entered, start at cost so the transaction can be completed with 0%
        // margin and edited later through the invoice workflow.
        sellingPricePerKg: item.sellingPricePerKg && item.sellingPricePerKg > 0
          ? item.sellingPricePerKg
          : defaultSellingPrices.get(item.productId) || item.purchasePricePerKg,
      })),
    };
    const { data, error } = await supabase.rpc("create_load_transaction", { p_payload: normalizedPayload });
    if (error) throw error;
    revalidatePath("/loads");
    revalidatePath("/invoices");
    revalidatePath("/reports/supplier-payables");
    revalidatePath("/dashboard");
    return { success: true, ...(data as { loadId: string; loadNumber: string; invoiceId: string; invoiceNumber: string; totalKg: number }), message: "Muatan dan invoice pabrik berhasil dibuat." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal membuat muatan.") };
  }
}

export async function updateLoadAction(loadId: string, payload: LoadInput) {
  const invalid = validateLoadInput(payload);
  if (invalid) return { error: invalid };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const productIds = [...new Set(payload.items.map((item) => item.productId))];
    const { data: productRows, error: productError } = await supabase
      .from("products")
      .select("id,default_selling_price")
      .in("id", productIds);
    if (productError) throw productError;
    const defaultSellingPrices = new Map(
      (productRows ?? []).map((product) => [product.id, Number(product.default_selling_price ?? 0)]),
    );
    const normalizedPayload: LoadInput = {
      ...payload,
      items: payload.items.map((item) => ({
        ...item,
        sellingPricePerKg: item.sellingPricePerKg && item.sellingPricePerKg > 0
          ? item.sellingPricePerKg
          : defaultSellingPrices.get(item.productId) || item.purchasePricePerKg,
      })),
    };
    const { error: preparationError } = await supabase.rpc("prepare_load_for_maintenance", { p_load_id: loadId });
    if (preparationError) throw preparationError;
    const { data, error } = await supabase.rpc("update_load_transaction", {
      p_load_id: loadId,
      p_payload: normalizedPayload,
    });
    if (error) throw error;
    revalidatePath("/loads");
    revalidatePath(`/loads/${loadId}`);
    revalidatePath(`/loads/${loadId}/edit`);
    revalidatePath("/invoices");
    revalidatePath("/reports/supplier-payables");
    revalidatePath("/dashboard");
    return { success: true, ...(data as { loadId: string; loadNumber: string }), message: "Muatan berhasil diperbarui." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal memperbarui muatan.") };
  }
}

export async function deleteLoadAction(loadId: string) {
  if (!loadId) return { error: "Muatan tidak valid." };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_load_transaction", { p_load_id: loadId });
    if (error) throw error;
    revalidatePath("/loads");
    revalidatePath("/invoices");
    revalidatePath("/reports/supplier-payables");
    revalidatePath("/dashboard");
    revalidatePath("/stock");
    return { success: true, ...(data as { loadNumber: string }), message: "Muatan berhasil dihapus." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menghapus muatan.") };
  }
}

export async function forceDeleteLoadAction(loadId: string) {
  if (!loadId) return { error: "Muatan tidak valid." };
  try {
    await requireRole(["OWNER"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("force_delete_load_transaction", { p_load_id: loadId });
    if (error) throw error;
    revalidatePath("/loads");
    revalidatePath("/invoices");
    revalidatePath("/reports/supplier-payables");
    revalidatePath("/dashboard");
    revalidatePath("/stock");
    return { success: true, ...(data as { loadNumber: string }), message: "Muatan berhasil dihapus permanen." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menghapus muatan permanen.") };
  }
}

export async function getLoadsAction(): Promise<Load[]> {
  await requireApprovedUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loads")
    .select("id,load_number,load_date,destination_id,invoice_id,invoice_basis,status,total_quantity_kg,total_purchase_cost,total_load_cost,total_accepted_kg,total_rejected_kg,notes,created_at,customers(name),invoices(invoice_number),load_items(id,source_id,product_id,product_name_snapshot,product_size_snapshot,input_quantity,input_unit,quantity_kg,purchase_price_per_kg,selling_price_per_kg,purchase_total,notes,suppliers(name)),load_costs(id,category,name,amount,notes)")
    .order("load_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const value = row as Record<string, unknown>;
    const customer = relatedRow(value.customers);
    const invoice = relatedRow(value.invoices);
    const rawItems = Array.isArray(value.load_items) ? value.load_items as Array<Record<string, unknown>> : [];
    const rawCosts = Array.isArray(value.load_costs) ? value.load_costs as Array<Record<string, unknown>> : [];
    const items: LoadItem[] = rawItems.map((item) => {
      const source = relatedRow(item.suppliers);
      return {
        id: String(item.id), sourceId: String(item.source_id), sourceName: String(source?.name ?? "Sumber tidak tersedia"),
        productId: String(item.product_id), productName: String(item.product_name_snapshot), productSize: item.product_size_snapshot ? String(item.product_size_snapshot) : undefined,
        inputQuantity: Number(item.input_quantity), inputUnit: item.input_unit as LoadItem["inputUnit"], quantityKg: Number(item.quantity_kg), purchasePricePerKg: Number(item.purchase_price_per_kg), sellingPricePerKg: item.selling_price_per_kg == null ? undefined : Number(item.selling_price_per_kg), purchaseTotal: Number(item.purchase_total), notes: item.notes ? String(item.notes) : undefined,
      };
    });
    const costs: LoadCost[] = rawCosts.map((cost) => ({ id: String(cost.id), category: String(cost.category), name: String(cost.name), amount: Number(cost.amount), notes: cost.notes ? String(cost.notes) : undefined }));
    return {
      id: String(value.id), loadNumber: String(value.load_number), loadDate: String(value.load_date), destinationId: String(value.destination_id), destinationName: String(customer?.name ?? "Pabrik tidak tersedia"),
      invoiceId: value.invoice_id ? String(value.invoice_id) : undefined, invoiceNumber: invoice?.invoice_number ? String(invoice.invoice_number) : undefined,
      invoiceBasis: value.invoice_basis as Load["invoiceBasis"], status: value.status as LoadStatus, totalQuantityKg: Number(value.total_quantity_kg), totalPurchaseCost: Number(value.total_purchase_cost), totalLoadCost: Number(value.total_load_cost), totalAcceptedKg: value.total_accepted_kg == null ? undefined : Number(value.total_accepted_kg), totalRejectedKg: value.total_rejected_kg == null ? undefined : Number(value.total_rejected_kg), notes: value.notes ? String(value.notes) : undefined, createdAt: String(value.created_at), items, costs,
    };
  });
}

export async function getLoadByIdAction(id: string): Promise<Load | null> {
  const loads = await getLoadsAction();
  return loads.find((load) => load.id === id) ?? null;
}
