"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireRole } from "@/lib/security/auth";
import type { ProfileStatus, Role } from "@/types";
import { revalidatePath } from "next/cache";

export interface SystemUserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: ProfileStatus;
  createdAt: string;
}

export async function getSystemUsersAction(): Promise<SystemUserItem[]> {
  await requireRole(["OWNER"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((user) => ({
    id: user.id,
    name: user.full_name,
    email: user.email,
    role: user.role as Role,
    status: user.status as ProfileStatus,
    createdAt: new Date(user.created_at).toLocaleDateString("id-ID"),
  }));
}

async function setApproval(userId: string, status: "APPROVED" | "REJECTED", role: Role = "STAFF") {
  try {
    await requireRole(["OWNER"]);
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return { error: "ID pengguna tidak valid." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("manage_user_approval", {
      p_user_id: userId,
      p_status: status,
      p_role: role,
    });
    if (error) throw error;
    revalidatePath("/settings/users");
    return { success: true, message: status === "APPROVED" ? "Pengguna berhasil disetujui." : "Pendaftaran pengguna ditolak." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal memperbarui status pengguna.") };
  }
}

export async function approveUserAction(userId: string, role: Role = "STAFF") {
  return setApproval(userId, "APPROVED", role);
}

export async function rejectUserAction(userId: string) {
  return setApproval(userId, "REJECTED");
}
