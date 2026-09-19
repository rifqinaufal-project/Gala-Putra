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
  try { await requireRole(["OWNER"]); const supabase = await createClient(); const { data, error } = await supabase.rpc("force_delete_supplier", { p_supplier_id: id }); if (error) throw error; revalidatePath("/suppliers"); revalidatePath("/stock"); revalidatePath("/loads"); revalidatePath("/reports/supplier-payables"); revalidatePath("/dashboard"); return { success: true, ...(data as { name: string }), message: "Supplier berhasil dihapus beserta data terkait." }; }
  catch (error) { return { error: normalizeActionError(error, "Gagal menghapus supplier.") }; }
}
export async function getSuppliersAction() {
  await requireApprovedUser(); const supabase = await createClient(); const { data, error } = await supabase.from("suppliers").select("id,name,contact_name,phone,address,status,source_type,created_at,updated_at").order("created_at", { ascending: false }).limit(5000); if (error) throw new Error(error.message);
  return (data ?? []).map((supplier) => ({ id: supplier.id, name: supplier.name, contactName: supplier.contact_name, phone: supplier.phone, address: supplier.address, partnerType: supplier.source_type, status: supplier.status as SupplierStatus, createdAt: supplier.created_at, updatedAt: supplier.updated_at }));
}
