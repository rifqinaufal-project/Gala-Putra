import type { Metadata } from "next";
import { requireRole } from "@/lib/security/auth";
import { CompanySettingsForm } from "@/components/settings/company-settings-form";

export const metadata: Metadata = {
  title: "Profil bisnis — Gala Putra",
};

export default async function CompanySettingsPage() {
  const { role } = await requireRole(["OWNER", "FINANCE"]);
  return <CompanySettingsForm readOnly={role === "FINANCE"} />;
}
