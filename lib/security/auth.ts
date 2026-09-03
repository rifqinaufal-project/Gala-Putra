import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ROLE_PERMISSIONS, type Permission, type ProfileStatus, type Role } from "@/types";
import { AuthorizationError } from "@/lib/security/errors";

export { AuthorizationError, normalizeActionError } from "@/lib/security/errors";

export interface ApprovedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: "APPROVED";
}

function isRole(value: unknown): value is Role {
  return value === "OWNER" || value === "FINANCE" || value === "STAFF";
}

async function getApprovedUserUncached(): Promise<ApprovedUser | null> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role, status")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "APPROVED" || !isRole(profile.role)) {
    return null;
  }

  return {
    id: authData.user.id,
    email: authData.user.email ?? "",
    name: profile.full_name,
    role: profile.role,
    status: "APPROVED",
  };
}

// Keep auth/profile lookup request-scoped when several server actions run
// during the same page render.
export const getApprovedUser = cache(getApprovedUserUncached);

export async function requireApprovedUser(): Promise<ApprovedUser> {
  const user = await getApprovedUser();
  if (!user) {
    throw new AuthorizationError("Sesi tidak valid atau akun belum disetujui.", "UNAUTHENTICATED");
  }
  return user;
}

export async function requireRole(allowedRoles: readonly Role[]): Promise<ApprovedUser> {
  const user = await requireApprovedUser();
  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError("Anda tidak memiliki hak akses untuk tindakan ini.");
  }
  return user;
}

export async function requirePermission(permission: Permission): Promise<ApprovedUser> {
  const user = await requireApprovedUser();
  if (!ROLE_PERMISSIONS[user.role].includes(permission)) {
    throw new AuthorizationError("Anda tidak memiliki hak akses untuk tindakan ini.");
  }
  return user;
}

export function hasPermission(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isApprovedStatus(status: ProfileStatus): status is "APPROVED" {
  return status === "APPROVED";
}
