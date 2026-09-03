"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireApprovedUser, requirePermission } from "@/lib/security/auth";
import { isPublicInvoice, sanitizeInvoiceForRole } from "@/lib/domain/invoices";
import type { DirectCostCategory, Invoice, PublicInvoice } from "@/types";

export interface CreateInvoicePayload {
  customerId: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
  discount?: number;
  status: "DRAFT" | "ISSUED";
  items: Array<{
    productId: string;
    description?: string;
    quantity: number;
    marginQuantity?: number;
    unit?: string;
    sellingPrice?: number;
    purchasePrice?: number;
  }>;
  costs: Array<{ category: DirectCostCategory; name: string; amount: number; notes?: string }>;
  invoiceType?: "STANDARD_SALE" | "REJECT_STOCK_SALE" | "FACTORY_LOAD";
}

function validateCreatePayload(payload: CreateInvoicePayload) {
  if (!payload.customerId || !payload.issueDate || payload.items.length === 0) return "Restoran, tanggal, dan item invoice wajib diisi.";
  if (payload.items.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.marginQuantity ?? 0) || (item.marginQuantity ?? 0) < 0)) return "Semua item harus memiliki produk, jumlah, dan margin yang valid.";
  if ((payload.discount ?? 0) < 0) return "Diskon tidak boleh negatif.";
  if (payload.costs.some((cost) => !cost.name.trim() || !Number.isFinite(cost.amount) || cost.amount <= 0)) return "Biaya internal tidak valid.";
  return null;
}

export async function createInvoiceAction(payload: CreateInvoicePayload) {
  const validationError = validateCreatePayload(payload);
  if (validationError) return { error: validationError };

  try {
    const user = await requirePermission("create_invoice_draft");
    if (payload.status === "ISSUED" && user.role === "STAFF") return { error: "Staff hanya dapat menyimpan invoice sebagai draft." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_invoice_transaction", { p_payload: payload });
    if (error) throw error;
    const result = data as { invoiceId: string; invoiceNumber?: string; publicToken: string };
    revalidatePath("/dashboard");
    revalidatePath("/invoices");
    if (payload.status === "ISSUED") revalidatePath("/stock");
    return { success: true, ...result, message: payload.status === "ISSUED" ? "Invoice berhasil diterbitkan." : "Draft invoice berhasil disimpan." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menyimpan invoice.") };
  }
}

export async function getInvoicesAction(startDate?: string, endDate?: string, includeDirectCosts = false, includeItems = false): Promise<Invoice[]> {
  const user = await requireApprovedUser();
  const supabase = await createClient();
  const optimizedResult = await supabase.rpc("get_invoices_secure_range", {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
    p_limit: 5000,
    p_include_items: includeItems,
    p_include_direct_costs: includeDirectCosts,
  });
  const isMissingOptimizedRpc = optimizedResult.error?.code === "42883" || /get_invoices_secure_range|schema cache/i.test(optimizedResult.error?.message ?? "");
  const { data, error } = isMissingOptimizedRpc
    ? await supabase.rpc("get_invoices_secure", { p_invoice_id: null })
    : optimizedResult;
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data as Invoice[] : [];
  return rows
    .filter((invoice) => (!startDate || invoice.issueDate >= startDate) && (!endDate || invoice.issueDate <= endDate))
    .map((invoice) => sanitizeInvoiceForRole(invoice, user.role !== "STAFF"));
}

export async function getInvoiceByIdAction(id: string): Promise<(Invoice & { customerPhone?: string }) | null> {
  const user = await requireApprovedUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invoices_secure", { p_invoice_id: id });
  if (error) throw new Error(error.message);
  const invoice = Array.isArray(data) ? data[0] as (Invoice & { customerPhone?: string }) | undefined : undefined;
  return invoice ? sanitizeInvoiceForRole(invoice, user.role !== "STAFF") : null;
}

export async function getPublicInvoiceAction(token: string): Promise<PublicInvoice | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_invoice", { p_token: token });
  if (error) throw new Error(error.message);
  return isPublicInvoice(data) ? data : null;
}

export async function deleteInvoiceAction(id: string) {
  try {
    const supabase = await createClient();
    const user = await requireApprovedUser();
    if (user.role !== "OWNER") return { error: "Hanya Owner yang dapat menghapus invoice." };
    const { error } = await supabase.rpc("force_delete_invoice", { p_invoice_id: id });
    if (error) throw error;
    revalidatePath("/dashboard");
    revalidatePath("/invoices");
    revalidatePath("/stock");
    revalidatePath("/payments");
    return { success: true, message: "Invoice berhasil dihapus beserta semua data terkait." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menghapus invoice.") };
  }
}

export async function voidInvoiceAction(id: string, reason?: string) {
  try {
    await requirePermission("void_invoice");
    const supabase = await createClient();
    const { error } = await supabase.rpc("void_invoice", { p_invoice_id: id, p_reason: reason ?? null });
    if (error) throw error;
    revalidatePath("/dashboard");
    revalidatePath("/invoices");
    revalidatePath("/stock");
    return { success: true, message: "Invoice berhasil dibatalkan tanpa menghapus riwayat." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal membatalkan invoice.") };
  }
}

export async function issueInvoiceAction(id: string) {
  try {
    await requirePermission("issue_invoice");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("issue_invoice", { p_invoice_id: id });
    if (error) throw error;
    revalidatePath("/dashboard"); revalidatePath("/invoices"); revalidatePath(`/invoices/${id}`); revalidatePath("/stock");
    return { success: true, invoiceNumber: data as string, message: "Draft berhasil diterbitkan." };
  } catch (error) { return { error: normalizeActionError(error, "Gagal menerbitkan draft.") }; }
}

export interface UpdateInvoicePayload {
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  discount?: number;
  items: Array<{
    productId: string;
    description?: string;
    quantity: number;
    marginQuantity?: number;
    unit?: string;
    sellingPrice?: number;
    purchasePrice?: number;
  }>;
  costs: Array<{ category: DirectCostCategory; name: string; amount: number; notes?: string }>;
}

export async function updateInvoiceAction(id: string, payload: UpdateInvoicePayload) {
  try {
    await requirePermission("issue_invoice"); // reuse OWNER/FINANCE permission
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_invoice_transaction", {
      p_invoice_id: id,
      p_payload: payload,
    });
    if (error) throw error;
    revalidatePath("/dashboard");
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    revalidatePath("/stock");
    return { success: true, ...(data as object), message: "Invoice berhasil diperbarui." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal memperbarui invoice.") };
  }
}
