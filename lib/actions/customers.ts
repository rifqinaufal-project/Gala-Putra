"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireApprovedUser, requireRole } from "@/lib/security/auth";
import type { CustomerStatus } from "@/types";

export interface CreateCustomerPayload { name: string; contactName: string; phone: string; email?: string; billingAddress: string; shippingAddress?: string; paymentTermDays: number; buyerType?: "PABRIK" | "PASAR" | "PERORANGAN" | "LAINNYA" }
export interface UpdateCustomerPayload extends CreateCustomerPayload { id: string; status?: CustomerStatus }

function validate(payload: CreateCustomerPayload) {
  if (!payload.name.trim() || !payload.contactName.trim() || !payload.phone.trim() || !payload.billingAddress.trim()) return "Data wajib restoran belum lengkap.";
  if (!Number.isInteger(payload.paymentTermDays) || payload.paymentTermDays < 0) return "Termin pembayaran tidak valid.";
  return null;
}

export async function createCustomerAction(payload: CreateCustomerPayload) {
  const invalid = validate(payload); if (invalid) return { error: invalid };
  try {
    await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient();
    const { error } = await supabase.from("customers").insert({ name: payload.name.trim(), contact_name: payload.contactName.trim(), phone: payload.phone.trim(), email: payload.email?.trim() || null, billing_address: payload.billingAddress.trim(), shipping_address: payload.shippingAddress?.trim() || payload.billingAddress.trim(), payment_term_days: payload.paymentTermDays, buyer_type: payload.buyerType ?? "PABRIK", status: "ACTIVE" });
    if (error) throw error; revalidatePath("/customers"); return { success: true, message: "Restoran berhasil ditambahkan." };
  } catch (error) { return { error: normalizeActionError(error, "Gagal menambahkan restoran.") }; }
}

export async function updateCustomerAction(payload: UpdateCustomerPayload) {
  const invalid = validate(payload); if (invalid) return { error: invalid };
  try {
    await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient();
    const { error } = await supabase.from("customers").update({ name: payload.name.trim(), contact_name: payload.contactName.trim(), phone: payload.phone.trim(), email: payload.email?.trim() || null, billing_address: payload.billingAddress.trim(), shipping_address: payload.shippingAddress?.trim() || payload.billingAddress.trim(), payment_term_days: payload.paymentTermDays, buyer_type: payload.buyerType ?? "PABRIK", status: payload.status }).eq("id", payload.id);
    if (error) throw error; revalidatePath("/customers"); return { success: true, message: "Restoran berhasil diperbarui." };
  } catch (error) { return { error: normalizeActionError(error, "Gagal memperbarui restoran.") }; }
}

export async function toggleCustomerStatusAction(id: string, currentStatus: CustomerStatus) {
  try {
    await requireRole(["OWNER", "FINANCE"]); const next = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE"; const supabase = await createClient();
    const { error } = await supabase.from("customers").update({ status: next }).eq("id", id); if (error) throw error;
    revalidatePath("/customers"); return { success: true, message: `Status restoran diubah ke ${next}.` };
  } catch (error) { return { error: normalizeActionError(error, "Gagal mengubah status restoran.") }; }
}

export async function deleteCustomerAction(id: string) {
  try {
    await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient();
    const { count, error: countError } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", id); if (countError) throw countError;
    if ((count ?? 0) > 0) {
      const { error } = await supabase.from("customers").update({ status: "INACTIVE" }).eq("id", id); if (error) throw error;
      revalidatePath("/customers"); return { success: true, isWarning: true, message: "Restoran memiliki riwayat invoice dan dinonaktifkan tanpa menghapus histori." };
    }
    const { error: priceError } = await supabase.from("customer_prices").delete().eq("customer_id", id); if (priceError) throw priceError;
    const { error } = await supabase.from("customers").delete().eq("id", id); if (error) throw error;
    revalidatePath("/customers"); return { success: true, message: "Restoran berhasil dihapus." };
  } catch (error) { return { error: normalizeActionError(error, "Gagal menghapus restoran.") }; }
}

export async function getCustomersAction() {
  await requireApprovedUser(); const supabase = await createClient();
  const { data, error } = await supabase.from("customers").select("id,name,contact_name,phone,email,billing_address,shipping_address,payment_term_days,status,buyer_type,created_at,updated_at").order("created_at", { ascending: false }).limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((customer) => ({ id: customer.id, name: customer.name, contactName: customer.contact_name, phone: customer.phone, email: customer.email ?? undefined, billingAddress: customer.billing_address, shippingAddress: customer.shipping_address ?? undefined, paymentTermDays: customer.payment_term_days, partnerType: customer.buyer_type, status: customer.status as CustomerStatus, createdAt: customer.created_at, updatedAt: customer.updated_at }));
}
