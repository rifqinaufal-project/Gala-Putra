import { requireRole } from "@/lib/security/auth";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["OWNER"]);
  return children;
}
