import { requireRole } from "@/lib/security/auth";

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["OWNER", "FINANCE"]);
  return children;
}
