"use client";

import { useState } from "react";
import { MobileBottomNav, Sidebar, MobileSidebar } from "@/components/app-shell/sidebar";
import { Topbar, type UserProfileInfo } from "@/components/app-shell/topbar";
import type { CompanyProfile } from "@/lib/company-store";
import type { Role } from "@/types";

export function DashboardShell({ children, user, company, notificationCount }: {
  children: React.ReactNode;
  user: UserProfileInfo;
  company: CompanyProfile;
  notificationCount: number;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = user.role as Role;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background p-0 lg:p-1.5">
      <div className="relative hidden shrink-0 lg:flex">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} user={user} role={role} company={company} />
      </div>
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} user={user} role={role} company={company} />
      <MobileBottomNav role={role} onMenuOpen={() => setMobileOpen(true)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMobileMenuToggle={() => setMobileOpen(true)} user={user} notificationCount={notificationCount} />
        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-transparent pt-[68px] lg:rounded-[22px] lg:bg-white/75 lg:pt-0">
          <div className="mx-auto w-full max-w-[1480px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10 lg:pt-8 xl:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
