"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireRole } from "@/lib/security/auth";
import type { Expense } from "@/types";

export interface CreateExpensePayload { category: string; description: string; amount: number; expenseDate: string }
export interface UpdateExpensePayload extends CreateExpensePayload { id: string }

function validate(payload: CreateExpensePayload) {
  if (!payload.category.trim() || !payload.description.trim() || !payload.expenseDate) return "Kategori, deskripsi, dan tanggal wajib diisi.";
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) return "Nominal pengeluaran harus lebih dari nol.";
  return null;
}

export async function createExpenseAction(payload: CreateExpensePayload) {
  const invalid = validate(payload); if (invalid) return { error: invalid };
  try {
    const user = await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient();
    const { error } = await supabase.from("expenses").insert({ category: payload.category.trim(), description: payload.description.trim(), amount: payload.amount, expense_date: payload.expenseDate, recorded_by: user.id });
    if (error) throw error; revalidatePath("/expenses"); revalidatePath("/dashboard"); revalidatePath("/reports/profit"); return { success: true, message: "Pengeluaran berhasil dicatat." };
  } catch (error) { return { error: normalizeActionError(error, "Gagal mencatat pengeluaran.") }; }
}

export async function updateExpenseAction(payload: UpdateExpensePayload) {
  const invalid = validate(payload); if (invalid) return { error: invalid };
  try { await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient(); const { error } = await supabase.from("expenses").update({ category: payload.category.trim(), description: payload.description.trim(), amount: payload.amount, expense_date: payload.expenseDate }).eq("id", payload.id); if (error) throw error; revalidatePath("/expenses"); revalidatePath("/dashboard"); revalidatePath("/reports/profit"); return { success: true, message: "Pengeluaran berhasil diperbarui." }; }
  catch (error) { return { error: normalizeActionError(error, "Gagal memperbarui pengeluaran.") }; }
}

export async function deleteExpenseAction(id: string) {
  try { await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient(); const { error } = await supabase.from("expenses").delete().eq("id", id); if (error) throw error; revalidatePath("/expenses"); revalidatePath("/dashboard"); revalidatePath("/reports/profit"); return { success: true, message: "Pengeluaran berhasil dihapus." }; }
  catch (error) { return { error: normalizeActionError(error, "Gagal menghapus pengeluaran.") }; }
}

export async function getExpensesAction(startDate?: string, endDate?: string, limit = 500): Promise<Expense[]> {
  await requireRole(["OWNER", "FINANCE"]); const supabase = await createClient();
  let query = supabase.from("expenses").select("id,category,description,amount,expense_date,recorded_by,created_at").order("expense_date", { ascending: false }).limit(Math.max(1, Math.min(limit, 5000)));
  if (startDate) query = query.gte("expense_date", startDate);
  if (endDate) query = query.lte("expense_date", endDate);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const userIds = [...new Set((data ?? []).map((expense) => expense.recorded_by).filter((id): id is string => Boolean(id)))];
  const { data: profiles, error: profileError } = userIds.length ? await supabase.from("profiles").select("id,full_name").in("id", userIds) : { data: [], error: null };
  if (profileError) throw new Error(profileError.message);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  return (data ?? []).map((expense) => ({ id: expense.id, userId: expense.recorded_by ?? "system", userName: names.get(expense.recorded_by ?? "") ?? "System", category: expense.category, description: expense.description, amount: Number(expense.amount), expenseDate: expense.expense_date, createdAt: expense.created_at }));
}
