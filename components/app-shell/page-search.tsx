"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Command, Search } from "lucide-react";
import type { Role } from "@/types";

type PageEntry = { label: string; group: string; href: string; roles?: Role[] };

const pages: PageEntry[] = [
  { label: "Ringkasan bisnis", group: "Operasional", href: "/dashboard" },
  { label: "Muatan ke pabrik", group: "Operasional", href: "/loads", roles: ["OWNER", "FINANCE"] },
  { label: "Produk dan stok", group: "Operasional", href: "/stock", roles: ["OWNER", "FINANCE"] },
  { label: "Invoice", group: "Transaksi", href: "/invoices" },
  { label: "Pembayaran", group: "Transaksi", href: "/payments" },
  { label: "Pengeluaran", group: "Transaksi", href: "/expenses", roles: ["OWNER", "FINANCE"] },
  { label: "Pabrik dan pembeli", group: "Relasi bisnis", href: "/customers" },
  { label: "TPI dan sumber", group: "Relasi bisnis", href: "/suppliers" },
  { label: "Penjualan", group: "Laporan", href: "/reports/sales", roles: ["OWNER", "FINANCE"] },
  { label: "Laba", group: "Laporan", href: "/reports/profit", roles: ["OWNER", "FINANCE"] },
  { label: "Piutang", group: "Laporan", href: "/reports/receivables", roles: ["OWNER", "FINANCE"] },
  { label: "Hutang TPI dan sumber", group: "Laporan", href: "/reports/supplier-payables", roles: ["OWNER", "FINANCE"] },
  { label: "Biaya langsung", group: "Laporan", href: "/reports/internal-costs", roles: ["OWNER", "FINANCE"] },
  { label: "Profil bisnis", group: "Pengaturan", href: "/settings/company", roles: ["OWNER"] },
  { label: "Pengguna", group: "Pengaturan", href: "/settings/users", roles: ["OWNER"] },
  { label: "Audit log", group: "Pengaturan", href: "/settings/audit-logs", roles: ["OWNER"] },
];

function PageSearchResult({ entry, onSelect }: { entry: PageEntry; onSelect: () => void }) {
  return (
    <Link
      href={entry.href}
      onClick={onSelect}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent focus-visible:bg-accent"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-white group-hover:text-accent-foreground">
        <ArrowRight className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{entry.label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{entry.group}</span>
      </span>
      <span className="hidden text-[10px] text-muted-foreground sm:block">Buka</span>
    </Link>
  );
}

export function PageSearch({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const availablePages = useMemo(() => pages.filter((page) => !page.roles || page.roles.includes(role)), [role]);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return availablePages.slice(0, 6);
    return availablePages.filter((page) => `${page.label} ${page.group}`.toLowerCase().includes(normalized)).slice(0, 8);
  }, [availablePages, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  return (
    <div className="relative min-w-0 flex-1 max-w-xl">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center gap-2 rounded-xl border border-border/70 bg-white/75 px-3 text-left text-xs text-muted-foreground shadow-[0_1px_1px_rgba(0,0,0,0.04)] transition-colors hover:border-primary/30 hover:bg-white"
        aria-label="Cari halaman"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Cari halaman...</span>
        <span className="hidden items-center gap-0.5 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex"><Command className="size-2.5" /> K</span>
      </button>

      {open && (
        <>
          <button type="button" aria-label="Tutup pencarian" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-transparent" />
          <div className="absolute left-0 top-12 z-50 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-popover p-2 shadow-dropdown">
            <div className="flex items-center gap-2 border-b border-border px-2 pb-2">
              <Search className="size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari menu atau halaman"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                aria-label="Cari menu atau halaman"
              />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">Esc</button>
            </div>
            <div className="max-h-80 overflow-y-auto pt-1">
              {results.length > 0 ? results.map((entry) => <PageSearchResult key={entry.href} entry={entry} onSelect={() => setOpen(false)} />) : <p className="px-3 py-8 text-center text-xs text-muted-foreground">Halaman tidak ditemukan</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
