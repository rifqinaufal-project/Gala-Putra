"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireRole } from "@/lib/security/auth";
import { validateReconciliationItems, type ReconciliationItemInput } from "@/lib/domain/reconciliation";

export interface FinalizeReconciliationPayload {
  reconciliationDate: string;
  notes?: string;
  items: ReconciliationItemInput[];
}

export async function finalizeLoadReconciliationAction(loadId: string, payload: FinalizeReconciliationPayload) {
  if (!loadId || !payload?.items?.length) return { error: "Hasil pabrik belum diisi." };
  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data: sentRows, error: sentError } = await supabase.from("load_items").select("product_id,quantity_kg").eq("load_id", loadId);
    if (sentError) throw sentError;
    const sentByProduct = new Map<string, number>();
    for (const row of sentRows ?? []) sentByProduct.set(row.product_id, (sentByProduct.get(row.product_id) ?? 0) + Number(row.quantity_kg));
    const invalid = validateReconciliationItems(payload.items, sentByProduct);
    if (invalid) return { error: invalid };
    const { data, error } = await supabase.rpc("finalize_load_reconciliation_transaction", { p_load_id: loadId, p_payload: payload });
    if (error) throw error;
    revalidatePath(`/loads/${loadId}`);
    revalidatePath(`/loads/${loadId}/reconcile`);
    revalidatePath("/loads");
    revalidatePath("/stock");
    revalidatePath("/products");
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    return { success: true, ...(data as { reconciliationId: string; totalAcceptedKg: number; totalRejectedKg: number; invoiceId: string }), message: "Hasil pabrik berhasil direkonsiliasi dan reject masuk stok." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menyimpan rekonsiliasi pabrik.") };
  }
}
