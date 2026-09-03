import { requireRole } from "@/lib/security/auth";

export default async function PricingLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["OWNER", "FINANCE"]);
  return children;
}
