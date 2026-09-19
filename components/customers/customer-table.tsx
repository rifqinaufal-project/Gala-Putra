"use client";

import { useState, useMemo } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import type { Customer } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  MoreHorizontal,
  Edit,
  Power,
  Trash2,
  Tag,
  Loader2,
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageSquare,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toggleCustomerStatusAction, deleteCustomerAction } from "@/lib/actions/customers";
import { EditCustomerDialog } from "./edit-customer-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";

interface CustomerTableProps {
  customers: Customer[];
  canManage?: boolean;
}

export function CustomerTable({ customers, canManage = false }: CustomerTableProps) {
  const router = useRouter();
  const [customersList, setCustomersList] = useState<Customer[]>(customers);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Stats calculation
  const totalCount = customersList.length;
  const activeCount = customersList.filter((c) => c.status === "ACTIVE").length;
  const inactiveCount = customersList.filter((c) => c.status === "INACTIVE").length;
  const avgTermDays = totalCount > 0
    ? Math.round(customersList.reduce((acc, c) => acc + (c.paymentTermDays || 7), 0) / totalCount)
    : 7;

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customersList.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.contactName.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        (c.email && c.email.toLowerCase().includes(search.toLowerCase()));

      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && c.status === "ACTIVE") ||
        (statusFilter === "INACTIVE" && c.status === "INACTIVE");

      return matchSearch && matchStatus;
    });
  }, [customersList, search, statusFilter]);

  const handleToggleStatus = async (customer: Customer) => {
    setLoadingId(customer.id);
    const res = await toggleCustomerStatusAction(customer.id, customer.status);
    setLoadingId(null);
    if (res.error) {
      toast.error(`Gagal: ${res.error}`);
    } else {
      toast.success(res.message || "Status restoran berhasil diperbarui");
      router.refresh();
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCustomer) return;
    const idToDelete = deletingCustomer.id;
    setLoadingId(idToDelete);

    // Optimistic update
    setCustomersList((prev) => prev.filter((c) => c.id !== idToDelete));
    setDeletingCustomer(null);

    const res = await deleteCustomerAction(idToDelete);
    setLoadingId(null);
    if (res.error) {
      toast.error(`Gagal menghapus: ${res.error}`);
      // Revert optimistic update
      setCustomersList(customers);
    } else {
      if (res.isWarning) {
        toast.warning(res.message);
        router.refresh();
      } else {
        toast.success(res.message || "Restoran berhasil dihapus");
        router.refresh();
      }
    }
  };

  const getWaLink = (phone: string, name: string) => {
    const cleaned = phone.replace(/\D/g, "");
    const formatted = cleaned.startsWith("0") ? "62" + cleaned.slice(1) : cleaned;
    const msg = encodeURIComponent(`Halo ${name}, kami dari Gala Putra...`);
    return `https://wa.me/${formatted}?text=${msg}`;
  };

  return (
    <div className="space-y-5">
      {/* ─── Metric Cards ─── */}
      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        <MetricCard
          title="Total restoran"
          value={totalCount}
          suffix="restoran"
          icon={Building2}
          accent="sky"
        />
        <MetricCard
          title="Restoran aktif"
          value={activeCount}
          suffix={`${inactiveCount} nonaktif`}
          icon={CheckCircle2}
          accent="emerald"
        />
        <MetricCard
          title="Rata-rata termin"
          value={avgTermDays}
          suffix="hari"
          icon={Clock}
          accent="stone"
        />
      </div>

      {/* ─── Search & Filters Bar ─── */}
      <div className="erp-surface flex flex-col items-center justify-between gap-3 p-4 sm:flex-row sm:p-5">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama restoran, PIC, no hp..."
            className="h-10 pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`min-h-9 px-3.5 py-2 text-xs rounded-xl font-semibold cursor-pointer transition-all ${
              statusFilter === "ALL"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Semua ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ACTIVE")}
            className={`min-h-9 px-3.5 py-2 text-xs rounded-xl font-semibold cursor-pointer transition-all ${
              statusFilter === "ACTIVE"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Aktif ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("INACTIVE")}
            className={`min-h-9 px-3.5 py-2 text-xs rounded-xl font-semibold cursor-pointer transition-all ${
              statusFilter === "INACTIVE"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Nonaktif ({inactiveCount})
          </button>
        </div>
      </div>

      {/* ─── Customers Table ─── */}
      <div className="erp-surface overflow-hidden">
        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-semibold py-3">
                  Nama Restoran
                </TableHead>
                <TableHead className="text-xs font-semibold py-3">
                  Kontak & PIC
                </TableHead>
                <TableHead className="text-xs font-semibold py-3">
                  Alamat Tagihan
                </TableHead>
                <TableHead className="text-xs font-semibold py-3">
                  Termin Bayar
                </TableHead>
                <TableHead className="text-xs font-semibold py-3">
                  Status
                </TableHead>
                {canManage && <TableHead className="w-12 py-3" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48">
                    <EmptyState
                      icon={Building2}
                      title="Tidak ada restoran"
                      description={
                        search
                          ? "Tidak ada restoran yang cocok dengan pencarian."
                          : "Belum ada data restoran yang terdaftar."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((c) => {
                  const initial = c.name.trim().charAt(0).toUpperCase();
                  return (
                    <TableRow
                      key={c.id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                            {initial}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {c.name}
                            </p>
                            {c.email && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {c.email}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-slate-800">
                            {c.contactName}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {c.phone}
                            </span>
                            {c.phone && (
                              <a
                                href={getWaLink(c.phone, c.contactName)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-1.5 py-0.5 rounded-md border border-emerald-200 transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-2.5 h-2.5" /> WA
                              </a>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <p className="text-xs text-muted-foreground max-w-[220px] line-clamp-2 leading-relaxed flex items-start gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          {c.billingAddress || "—"}
                        </p>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          variant="outline"
                          className="bg-slate-50 text-slate-700 font-medium text-xs border-slate-200"
                        >
                          <Clock className="w-3 h-3 mr-1 text-slate-500" />
                          {c.paymentTermDays} Hari
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        {c.status === "ACTIVE" ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-medium text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />{" "}
                            Aktif
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-slate-100 text-slate-600 font-medium text-xs gap-1"
                          >
                            <XCircle className="w-3 h-3 text-slate-400" />{" "}
                            Nonaktif
                          </Badge>
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell className="py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="inline-flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                              aria-label="Aksi restoran"
                            >
                              {loadingId === c.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="w-4 h-4" />
                              )}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-48 shadow-lg rounded-xl"
                            >
                              <DropdownMenuItem
                                className="cursor-pointer text-sm"
                                onClick={() => setEditingCustomer(c)}
                              >
                                <Edit className="w-4 h-4 mr-2 text-blue-600" />{" "}
                                Edit Data Restoran
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer text-sm">
                                <Link
                                  href="/pricing/selling"
                                  className="flex items-center w-full"
                                >
                                  <Tag className="w-4 h-4 mr-2 text-indigo-600" />{" "}
                                  Atur Harga Khusus
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer text-sm"
                                onClick={() => handleToggleStatus(c)}
                              >
                                <Power className="w-4 h-4 mr-2 text-amber-600" />
                                {c.status === "ACTIVE"
                                  ? "Nonaktifkan Restoran"
                                  : "Aktifkan Restoran"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer text-sm text-red-600 focus:text-red-600"
                                onClick={() => setDeletingCustomer(c)}
                              >
                                <Trash2 className="w-4 h-4 mr-2 text-red-600" />{" "}
                                Hapus Restoran
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile card list */}
        <div className="lg:hidden">
          {filteredCustomers.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Tidak ada restoran"
              description={
                search
                  ? "Tidak ada restoran yang cocok dengan pencarian."
                  : "Belum ada data restoran yang terdaftar."
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {filteredCustomers.map((c) => {
                const initial = c.name.trim().charAt(0).toUpperCase();
                return (
                  <div
                    key={c.id}
                    className="p-4 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">
                            {c.name}
                          </p>
                          {c.status === "ACTIVE" ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Aktif
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-slate-100 text-slate-600 text-xs gap-1"
                            >
                              <XCircle className="w-3 h-3" /> Nonaktif
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-slate-700">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {c.contactName} · {c.phone}
                          </span>
                          {c.phone && (
                            <a
                              href={getWaLink(c.phone, c.contactName)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-1.5 py-0.5 rounded-md border border-emerald-200 ml-1"
                            >
                              <MessageSquare className="w-2.5 h-2.5" /> WA
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {c.paymentTermDays}{" "}
                            Hari
                          </span>
                          {c.billingAddress && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                              <MapPin className="w-3 h-3 shrink-0" />{" "}
                              {c.billingAddress}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 text-slate-500 shrink-0 cursor-pointer"
                          aria-label="Aksi restoran"
                        >
                          {loadingId === c.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="w-5 h-5" />
                          )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            className="cursor-pointer text-sm"
                            onClick={() => setEditingCustomer(c)}
                          >
                            <Edit className="w-4 h-4 mr-2 text-blue-600" /> Edit
                            Data Restoran
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer text-sm">
                            <Link
                              href="/pricing/selling"
                              className="flex items-center w-full"
                            >
                              <Tag className="w-4 h-4 mr-2 text-indigo-600" />{" "}
                              Atur Harga Khusus
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer text-sm"
                            onClick={() => handleToggleStatus(c)}
                          >
                            <Power className="w-4 h-4 mr-2 text-amber-600" />
                            {c.status === "ACTIVE"
                              ? "Nonaktifkan Restoran"
                              : "Aktifkan Restoran"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-sm text-red-600 focus:text-red-600"
                            onClick={() => setDeletingCustomer(c)}
                          >
                            <Trash2 className="w-4 h-4 mr-2 text-red-600" />{" "}
                            Hapus Restoran
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border bg-slate-50/50 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Menampilkan {filteredCustomers.length} dari {customers.length}{" "}
            restoran
          </span>
          <span className="hidden sm:inline">Gala Putra ERP</span>
        </div>
      </div>

      {canManage && editingCustomer && (
        <EditCustomerDialog
          customer={editingCustomer}
          open={!!editingCustomer}
          onOpenChange={(open) => {
            if (!open) setEditingCustomer(null);
          }}
        />
      )}

      {canManage && deletingCustomer && (
        <ConfirmDialog
          open={!!deletingCustomer}
          onOpenChange={(open) => {
            if (!open) setDeletingCustomer(null);
          }}
          title="Hapus Restoran?"
          description={`Hapus permanen "${deletingCustomer.name}" beserta seluruh invoice, muatan, dan pembayaran terkait? Tindakan ini tidak dapat dibatalkan.`}
          confirmLabel="Hapus Restoran"
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}
