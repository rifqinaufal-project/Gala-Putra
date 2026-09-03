"use client";

import { Bell, Building2, ChevronDown, LogOut, Menu, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { usePathname, useRouter } from "next/navigation";
import { signOutAction } from "@/lib/actions/auth";
import { PageSearch } from "@/components/app-shell/page-search";
import type { Role } from "@/types";

const pathLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/notes": "Catatan Pribadi",
  "/products": "Produk",
  "/stock": "Stok, Harga & Modal",
  "/pricing/purchase": "Harga Beli",
  "/pricing/selling": "Harga Jual Restoran",
  "/invoices": "Invoice",
  "/invoices/new": "Buat Invoice",
  "/payments": "Pembayaran",
  "/customers": "Restoran",
  "/suppliers": "Supplier",
  "/expenses": "Pengeluaran",
  "/reports/sales": "Laporan Penjualan",
  "/reports/profit": "Laporan Laba",
  "/reports/receivables": "Piutang",
  "/reports/supplier-payables": "Hutang Supplier",
  "/reports/internal-costs": "Biaya Internal",
  "/settings/company": "Profil Bisnis",
  "/settings/users": "Profil & Pengguna",
  "/settings/audit-logs": "Audit Log",
};

export interface UserProfileInfo {
  name: string;
  email: string;
  role: string;
  initial: string;
}

interface TopbarProps {
  onMobileMenuToggle: () => void;
  user?: UserProfileInfo;
  notificationCount?: number;
}

export function Topbar({ onMobileMenuToggle, user, notificationCount = 0 }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const userName = user?.name || "Owner";
  const userEmail = user?.email || "email@mail.com";
  const userInitial = user?.initial || userName.charAt(0).toUpperCase();

  // Build breadcrumb from pathname
  const segments = pathname.split("/").filter(Boolean);
  const contextualLabel = pathname.startsWith("/invoices/")
    ? pathname.endsWith("/edit")
      ? "Edit Invoice"
      : "Detail Invoice"
    : undefined;
  const currentLabel =
    pathLabels[pathname] || contextualLabel ||
    (segments.length > 0
      ? segments[segments.length - 1]
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "Dashboard");

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[68px] shrink-0 items-center gap-3 border-b border-border/70 bg-white/80 px-3 backdrop-blur-xl sm:px-5 lg:static lg:h-[72px] lg:bg-transparent lg:px-8">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="rounded-xl border border-border/70 bg-white lg:hidden"
        onClick={onMobileMenuToggle}
        aria-label="Buka menu"
      >
        <Menu className="w-5 h-5" />
      </Button>

      <div className="hidden min-w-0 flex-1 lg:block">
        <div className="flex items-center gap-1.5 text-[0.68rem] font-medium text-muted-foreground">
          <span>Gala Putra</span>
          <span className="text-border-strong">/</span>
          <span className="text-primary/70">{currentLabel}</span>
        </div>
      </div>

      <PageSearch role={(user?.role ?? "STAFF") as Role} />

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-xl"
          aria-label="Notifikasi"
          onClick={() => router.push("/reports/receivables")}
          title={`${notificationCount} notifikasi perlu ditinjau`}
        >
          <Bell className="w-4 h-4" />
          {notificationCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-md border-2 border-white bg-red-600 px-0.5 text-[8px] font-bold text-white">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-transparent px-1.5 py-1.5 transition-colors hover:border-border hover:bg-white/80 sm:px-2"
              aria-label="Menu pengguna"
            >
              <Avatar className="size-8 rounded-[10px]">
                <AvatarFallback className="rounded-[10px] bg-accent text-xs font-semibold text-accent-foreground">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="hidden max-w-[150px] text-left sm:block">
                <p className="text-xs font-medium leading-tight truncate">
                  {userName}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight truncate">
                  {userEmail}
                </p>
              </div>
              <ChevronDown className="w-3 h-3 text-muted-foreground hidden sm:block" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 rounded-2xl border border-border p-1.5 shadow-dropdown"
          >
            {/* User info */}
            <div className="flex items-center gap-3 px-3 py-3 mb-1">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-stone-900 truncate">
                  {userName}
                </p>
                <p className="text-xs text-stone-400 truncate">{userEmail}</p>
                <span className="mt-1 inline-flex items-center rounded-md border border-primary/15 bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {user?.role ?? "USER"}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator className="my-1" />
            {user?.role === "OWNER" && (
              <>
                <DropdownMenuItem
                  onClick={() => router.push("/settings/users")}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-stone-700 cursor-pointer hover:bg-stone-50 focus:bg-stone-50"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                    <UserRound className="size-3.5 text-primary" />
                  </div>
                  <span>Profil & Pengguna</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/settings/company")}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-stone-700 cursor-pointer hover:bg-stone-50 focus:bg-stone-50"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                    <Building2 className="size-3.5 text-primary" />
                  </div>
                  <span>Pengaturan Bisnis</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1" />
              </>
            )}
            <DropdownMenuItem
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-red-600 cursor-pointer hover:bg-red-50 focus:bg-red-50 focus:text-red-600"
              onClick={async () => {
                await signOutAction();
              }}
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-50">
                <LogOut className="size-3.5 text-red-500" />
              </div>
              <span className="font-medium">Keluar</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
