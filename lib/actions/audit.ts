"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/security/auth";
import type { AuditLog } from "@/types";

export async function getAuditLogsAction(limit = 200): Promise<AuditLog[]> {
  await requirePermission("view_audit_log");
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_logs").select("id,user_id,user_name,entity_name,entity_id,action,payload,created_at").order("created_at", { ascending: false }).limit(safeLimit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((log) => ({
    id: log.id, userId: log.user_id ?? "system", userName: log.user_name, entityName: log.entity_name,
    entityId: log.entity_id, action: log.action, afterData: log.payload as Record<string, unknown> | undefined, createdAt: log.created_at,
  }));
}
