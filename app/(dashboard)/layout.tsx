import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/app-shell/dashboard-shell";
import { getApprovedUser } from "@/lib/security/auth";
import { getCompanyProfileAction } from "@/lib/actions/company";
import { getNotificationSummaryAction } from "@/lib/actions/dashboard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const [company, notifications] = await Promise.all([
    getCompanyProfileAction(),
    getNotificationSummaryAction(),
  ]);

  return (
    <DashboardShell
      company={company}
      notificationCount={notifications.total}
      user={{ name: user.name, email: user.email, role: user.role, initial: user.name.charAt(0).toUpperCase() }}
    >
      {children}
    </DashboardShell>
  );
}
