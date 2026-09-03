"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireApprovedUser, requireRole } from "@/lib/security/auth";
import type { SupplierStatus } from "@/types";

export interface CreateSupplierPayload { name: string; contactName: string; phone: string; address: string; sourceType?: "TPI" | "PERORANGAN" | "LAINNYA" }
export interface UpdateSupplierPayload extends CreateSupplierPayload { id: string; status?: SupplierStatus }

function invalid(payload: CreateSupplierPayload) { return !payload.name.trim() || !payload.contactName.trim() || !payload.phone.trim() || !payload.address.trim(); }

export async function createSupplierAction(payload: CreateSupplierPayload) {
  if (invalid(payload)) return { error: "Data wajib supplier belum lengkap." };
  try { await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient(); const { error } = await supabase.from("suppliers").insert({ name: payload.name.trim(), contact_name: payload.contactName.trim(), phone: payload.phone.trim(), address: payload.address.trim(), source_type: payload.sourceType ?? "TPI", status: "ACTIVE" }); if (error) throw error; revalidatePath("/suppliers"); return { success: true, message: "Sumber berhasil ditambahkan." }; }
  catch (error) { return { error: normalizeActionError(error, "Gagal menambahkan supplier.") }; }
}
export async function updateSupplierAction(payload: UpdateSupplierPayload) {
  if (invalid(payload)) return { error: "Data wajib supplier belum lengkap." };
  try { await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient(); const { error } = await supabase.from("suppliers").update({ name: payload.name.trim(), contact_name: payload.contactName.trim(), phone: payload.phone.trim(), address: payload.address.trim(), source_type: payload.sourceType ?? "TPI", status: payload.status }).eq("id", payload.id); if (error) throw error; revalidatePath("/suppliers"); return { success: true, message: "Sumber berhasil diperbarui." }; }
  catch (error) { return { error: normalizeActionError(error, "Gagal memperbarui supplier.") }; }
}
export async function toggleSupplierStatusAction(id: string, currentStatus: SupplierStatus) {
  try { await requireRole(["OWNER", "FINANCE"]); const next = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE"; const supabase = await createClient(); const { error } = await supabase.from("suppliers").update({ status: next }).eq("id", id); if (error) throw error; revalidatePath("/suppliers"); return { success: true, message: `Status supplier diubah ke ${next}.` }; }
  catch (error) { return { error: normalizeActionError(error, "Gagal mengubah status supplier.") }; }
}
export async function deleteSupplierAction(id: string) {
  try { await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient(); const { count, error: countError } = await supabase.from("product_costs").select("id", { count: "exact", head: true }).eq("supplier_id", id); if (countError) throw countError; if ((count ?? 0) > 0) { const { error } = await supabase.from("suppliers").update({ status: "INACTIVE" }).eq("id", id); if (error) throw error; revalidatePath("/suppliers"); return { success: true, isWarning: true, message: "Supplier memiliki riwayat HPP dan dinonaktifkan tanpa menghapus histori." }; } const { error } = await supabase.from("suppliers").delete().eq("id", id); if (error) throw error; revalidatePath("/suppliers"); return { success: true, isWarning: false, message: "Supplier berhasil dihapus." }; }
  catch (error) { return { error: normalizeActionError(error, "Gagal menghapus supplier.") }; }
}
export async function getSuppliersAction() {
  await requireApprovedUser(); const supabase = await createClient(); const { data, error } = await supabase.from("suppliers").select("id,name,contact_name,phone,address,status,source_type,created_at,updated_at").order("created_at", { ascending: false }).limit(5000); if (error) throw new Error(error.message);
  return (data ?? []).map((supplier) => ({ id: supplier.id, name: supplier.name, contactName: supplier.contact_name, phone: supplier.phone, address: supplier.address, partnerType: supplier.source_type, status: supplier.status as SupplierStatus, createdAt: supplier.created_at, updatedAt: supplier.updated_at }));
}
