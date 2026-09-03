"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireRole } from "@/lib/security/auth";
import type { PaymentMethod } from "@/types";

export type SupplierBillStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";

export interface SupplierPayable {
  id: string;
  billNumber: string;
  supplierId: string;
  supplierName: string;
  supplierReference?: string;
  billDate: string;
  dueDate?: string;
  status: SupplierBillStatus;
  total: number;
  totalPaid: number;
  remainingBalance: number;
  notes?: string;
}

export interface CreateSupplierBillPayload {
  supplierId: string;
  supplierReference?: string;
  billDate: string;
  dueDate?: string;
  total: number;
  notes?: string;
}

export interface CreateSupplierPaymentPayload {
  supplierBillId: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
}

const PAYABLES_PATH = "/reports/supplier-payables";

export async function createSupplierBillAction(payload: CreateSupplierBillPayload) {
  if (!payload.supplierId || !payload.billDate || !Number.isFinite(payload.total) || payload.total <= 0) {
    return { error: "Supplier, tanggal tagihan, dan total wajib valid." };
  }
  if (payload.dueDate && payload.dueDate < payload.billDate) {
    return { error: "Jatuh tempo tidak boleh sebelum tanggal tagihan." };
  }

  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_supplier_bill_transaction", { p_payload: payload });
    if (error) throw error;
    revalidatePath(PAYABLES_PATH);
    revalidatePath("/dashboard");
    return { success: true, ...(data as { supplierBillId: string; billNumber: string }), message: "Tagihan supplier berhasil dicatat." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal mencatat tagihan supplier.") };
  }
}

export async function createSupplierPaymentAction(payload: CreateSupplierPaymentPayload) {
  if (!payload.supplierBillId || !payload.paymentDate || !Number.isFinite(payload.amount) || payload.amount <= 0) {
    return { error: "Tagihan, tanggal, dan nominal pembayaran wajib valid." };
  }

  try {
    await requireRole(["OWNER", "FINANCE"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_supplier_payment_transaction", {
      p_supplier_bill_id: payload.supplierBillId,
      p_amount: payload.amount,
      p_payment_date: payload.paymentDate,
      p_method: payload.method,
      p_reference_number: payload.referenceNumber ?? null,
      p_notes: payload.notes ?? null,
    });
    if (error) throw error;
    revalidatePath(PAYABLES_PATH);
    revalidatePath("/dashboard");
    return { success: true, paymentId: data as string, message: "Pembayaran ke supplier berhasil dicatat." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal mencatat pembayaran supplier.") };
  }
}

export async function getSupplierPayablesAction(startDate?: string, endDate?: string, limit = 500): Promise<SupplierPayable[]> {
  await requireRole(["OWNER", "FINANCE"]);
  const supabase = await createClient();
  let query = supabase
    .from("supplier_bills")
    .select("id,bill_number,supplier_id,supplier_reference,bill_date,due_date,status,total,total_paid,remaining_balance,notes,suppliers(name)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 5000)));
  if (startDate) query = query.gte("bill_date", startDate);
  if (endDate) query = query.lte("bill_date", endDate);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const today = new Date().toISOString().slice(0, 10);
  return (data ?? []).map((bill) => {
    const status = bill.status as Exclude<SupplierBillStatus, "OVERDUE">;
    const overdue = (status === "OPEN" || status === "PARTIALLY_PAID") && Boolean(bill.due_date) && bill.due_date < today;
    const supplier = Array.isArray(bill.suppliers) ? bill.suppliers[0] : bill.suppliers;
    return {
      id: bill.id,
      billNumber: bill.bill_number,
      supplierId: bill.supplier_id,
      supplierName: supplier?.name ?? "Supplier tidak tersedia",
      supplierReference: bill.supplier_reference ?? undefined,
      billDate: bill.bill_date,
      dueDate: bill.due_date ?? undefined,
      status: overdue ? "OVERDUE" : status,
      total: Number(bill.total),
      totalPaid: Number(bill.total_paid),
      remainingBalance: Number(bill.remaining_balance),
      notes: bill.notes ?? undefined,
    };
  });
}
