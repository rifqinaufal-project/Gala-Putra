"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  Fish,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Truck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import type { CompanyProfile } from "@/lib/company-store";
import type { Role } from "@/types";
import type { UserProfileInfo } from "@/components/app-shell/topbar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navGroups = [
  {
    label: "Operasional",
    items: [
      { label: "Ringkasan", href: "/dashboard", icon: LayoutDashboard },
      { label: "Produk & stok", href: "/stock", icon: Boxes },
       { label: "Muatan ke pabrik", href: "/loads", icon: Truck },
    ],
  },
  {
    label: "Transaksi",
    items: [
      { label: "Invoice", href: "/invoices", icon: FileText },
      { label: "Pembayaran", href: "/payments", icon: CreditCard },
      { label: "Pengeluaran", href: "/expenses", icon: Receipt },
    ],
  },
  {
    label: "Relasi bisnis",
    items: [
       { label: "Pabrik & pembeli", href: "/customers", icon: UtensilsCrossed },
       { label: "TPI & sumber", href: "/suppliers", icon: Truck },
    ],
  },
  {
    label: "Laporan",
    items: [
      { label: "Penjualan", href: "/reports/sales", icon: BarChart3 },
      { label: "Laba", href: "/reports/profit", icon: BarChart3 },
      { label: "Piutang", href: "/reports/receivables", icon: BarChart3 },
       { label: "Hutang TPI / sumber", href: "/reports/supplier-payables", icon: Landmark },
      { label: "Biaya langsung", href: "/reports/internal-costs", icon: BarChart3 },
    ],
  },
] as const;

const settingItems = [
  { label: "Profil bisnis", href: "/settings/company", icon: Settings },
  { label: "Pengguna", href: "/settings/users", icon: Settings },
  { label: "Audit log", href: "/settings/audit-logs", icon: Settings },
] as const;

function canAccess(href: string, role: Role) {
  if (role === "OWNER") return true;
  if (role === "FINANCE") return !href.startsWith("/settings/");
  return ["/dashboard", "/invoices", "/customers", "/suppliers", "/loads"].includes(href);
}

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

function Brand({ company, collapsed = false }: { company: CompanyProfile; collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center",
        collapsed ? "justify-center" : "gap-3",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sidebar-border bg-white p-1 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.08)]">
        {company.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt={company.name}
            className="size-full object-contain"
          />
        ) : (
          <Fish className="size-4 text-primary" strokeWidth={2.2} />
        )}
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.015em] text-sidebar-primary">
            {company.name || "Gala Putra"}
          </p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground">
            Operations
          </p>
        </div>
      )}
    </div>
  );
}

function NavigationLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed = false,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-10 items-center rounded-[10px] text-[0.8125rem] font-medium transition-[background-color,color,transform] duration-200 active:scale-[0.985]",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active
          ? "bg-sidebar-active text-sidebar-accent-foreground shadow-[0_8px_20px_-14px_rgba(0,0,0,0.12)]"
          : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-primary",
      )}
    >
      <Icon className="size-[1.05rem] shrink-0" strokeWidth={active ? 2.25 : 1.8} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && active && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function Navigation({
  role,
  pathname,
  collapsed = false,
  onNavigate,
}: {
  role: Role;
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  if (collapsed) {
    const flatItems = [
      ...navGroups.flatMap<{ label: string; href: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }>((group) => [...group.items]),
      ...settingItems,
    ];
    return (
      <nav aria-label="Navigasi utama" className="space-y-1 px-2 py-3">
        {flatItems.filter((item) => canAccess(item.href, role)).map((item) => (
          <NavigationLink key={item.href} {...item} active={isActivePath(pathname, item.href)} collapsed onNavigate={onNavigate} />
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Navigasi utama" className="space-y-5 px-3 py-4">
      {navGroups.map((group) => {
        const visibleItems = group.items.filter((item) => canAccess(item.href, role));
        if (visibleItems.length === 0) return null;
        return (
          <section key={group.label} aria-labelledby={`nav-${group.label.replaceAll(" ", "-")}`}>
          <p id={`nav-${group.label.replaceAll(" ", "-")}`} className="mb-1.5 px-3 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/70">
              {group.label}
            </p>
            <div className="space-y-1">
              {visibleItems.map((item) => (
                <NavigationLink key={item.href} {...item} active={isActivePath(pathname, item.href)} onNavigate={onNavigate} />
              ))}
            </div>
          </section>
        );
      })}

      {settingItems.some((item) => canAccess(item.href, role)) && (
        <section className="border-t border-sidebar-border pt-4" aria-labelledby="nav-pengaturan">
          <p id="nav-pengaturan" className="mb-1.5 px-3 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/70">Pengaturan</p>
          <div className="space-y-1">
            {settingItems.filter((item) => canAccess(item.href, role)).map((item) => (
              <NavigationLink key={item.href} {...item} active={isActivePath(pathname, item.href)} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      )}
    </nav>
  );
}

function UserPanel({ user, collapsed = false }: { user?: UserProfileInfo; collapsed?: boolean }) {
  const userName = user?.name || "Owner";
  const userEmail = user?.email || "email@mail.com";
  const initial = user?.initial || userName.charAt(0).toUpperCase();

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" onClick={async () => signOutAction()} className="flex size-10 items-center justify-center rounded-xl text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-primary" aria-label="Keluar" />}
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">{initial}</span>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">{userName} · keluar</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-hover/70 p-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">{initial}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-sidebar-primary">{userName}</p>
        <p className="mt-0.5 truncate text-[10px] text-sidebar-foreground">{userEmail}</p>
      </div>
      <button type="button" onClick={async () => signOutAction()} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-red-50 hover:text-red-600" aria-label="Keluar" title="Keluar">
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user?: UserProfileInfo;
  role: Role;
  company: CompanyProfile;
}

export function Sidebar({ collapsed, onToggle, user, role, company }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className={cn("relative flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300", collapsed ? "w-[76px]" : "w-[256px]")}>
      <div className={cn("flex h-[72px] shrink-0 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        <Brand company={company} collapsed={collapsed} />
        {!collapsed && (
          <button type="button" onClick={onToggle} className="flex size-9 items-center justify-center rounded-[10px] text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-primary" aria-label="Ciutkan navigasi">
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button type="button" onClick={onToggle} className="mx-auto mt-3 flex size-10 items-center justify-center rounded-[10px] text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-primary" aria-label="Buka navigasi">
          <PanelLeftOpen className="size-4" />
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Navigation role={role} pathname={pathname} collapsed={collapsed} />
      </div>
      <div className={cn("shrink-0 border-t border-sidebar-border", collapsed ? "flex justify-center p-3" : "p-3")}>
        <UserPanel user={user} collapsed={collapsed} />
      </div>
    </aside>
  );
}

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
  user?: UserProfileInfo;
  role: Role;
  company: CompanyProfile;
}

export function MobileSidebar({ open, onClose, user, role, company }: MobileSidebarProps) {
  const pathname = usePathname();
  return (
    <>
      <button type="button" aria-label="Tutup menu" onClick={onClose} className={cn("fixed inset-0 z-40 bg-[#535579]/25 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} />
      <aside aria-label="Menu mobile" aria-hidden={!open} className={cn("fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[330px] flex-col border-r border-sidebar-border bg-sidebar shadow-[24px_0_70px_-30px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out lg:hidden", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <Brand company={company} />
          <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-[10px] text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-primary" aria-label="Tutup navigasi">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">
          <Navigation role={role} pathname={pathname} onNavigate={onClose} />
        </div>
        <div className="shrink-0 border-t border-sidebar-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <UserPanel user={user} />
        </div>
      </aside>
    </>
  );
}

export function MobileBottomNav({ role, onMenuOpen }: { role: Role; onMenuOpen: () => void }) {
  const pathname = usePathname();
  const quickItems = role === "STAFF"
    ? [
        { label: "Beranda", href: "/dashboard", icon: LayoutDashboard },
        { label: "Invoice", href: "/invoices", icon: FileText },
        { label: "Produk", href: "/products", icon: Package },
        { label: "Restoran", href: "/customers", icon: UtensilsCrossed },
      ]
    : [
        { label: "Beranda", href: "/dashboard", icon: LayoutDashboard },
        { label: "Invoice", href: "/invoices", icon: FileText },
        { label: "Stok", href: "/stock", icon: Boxes },
        { label: "Restoran", href: "/customers", icon: UtensilsCrossed },
      ];

  return (
    <nav aria-label="Navigasi cepat mobile" className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-[18px] border border-sidebar-border bg-sidebar/95 px-1.5 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_20px_55px_-20px_rgba(0,0,0,0.14)] backdrop-blur-xl lg:hidden">
      {quickItems.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.625rem] font-medium transition-colors", active ? "bg-sidebar-active text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-primary")}>
            <Icon className="size-4" strokeWidth={active ? 2.3 : 1.8} />
            <span>{item.label}</span>
          </Link>
        );
      })}
        <button type="button" onClick={onMenuOpen} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.625rem] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-primary" aria-label="Buka semua menu">
        <Menu className="size-4" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
