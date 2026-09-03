"use client";

import { useState } from "react";
import type { Expense } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
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
import { EmptyState } from "@/components/ui/empty-state";
import { MoreHorizontal, Edit, Trash2, Loader2, Receipt } from "lucide-react";
import { deleteExpenseAction } from "@/lib/actions/expenses";
import { EditExpenseDialog } from "./edit-expense-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface ExpenseTableProps {
  expenses: Expense[];
  totalExpenses: number;
}

export function ExpenseTable({ expenses, totalExpenses }: ExpenseTableProps) {
  const router = useRouter();
  const [expensesList, setExpensesList] = useState<Expense[]>(expenses);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    if (!deletingExpense) return;
    const idToDelete = deletingExpense.id;
    setLoadingId(idToDelete);
    
    // Optimistic update
    setExpensesList((prev) => prev.filter((e) => e.id !== idToDelete));
    setDeletingExpense(null);

    const res = await deleteExpenseAction(idToDelete);
    setLoadingId(null);
    if (res.error) {
      toast.error(`Gagal menghapus: ${res.error}`);
      // Revert optimistic update
      setExpensesList(expenses);
    } else {
      toast.success(res.message || "Pengeluaran berhasil dihapus");
      router.refresh();
    }
  };

  const renderActions = (expense: Expense) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-stone-100 hover:text-foreground"
        aria-label={`Aksi untuk pengeluaran ${expense.description}`}
      >
        {loadingId === expense.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem className="cursor-pointer" onClick={() => setEditingExpense(expense)}>
          <Edit className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          Edit Data
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-red-600 focus:text-red-600"
          onClick={() => setDeletingExpense(expense)}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5 text-red-600" />
          Hapus Data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs font-semibold">Tanggal</TableHead>
              <TableHead className="text-xs font-semibold">Kategori</TableHead>
              <TableHead className="text-xs font-semibold">Deskripsi</TableHead>
              <TableHead className="text-xs font-semibold">Dicatat oleh</TableHead>
              <TableHead className="text-xs font-semibold text-right">Nominal</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {expensesList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48">
                  <EmptyState
                    icon={Receipt}
                    title="Tidak ada pengeluaran"
                    description="Belum ada data pengeluaran yang terdaftar."
                  />
                </TableCell>
              </TableRow>
            ) : (
              expensesList.map((e) => (
                <TableRow key={e.id} className="hover:bg-muted/20">
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(e.expenseDate)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    <span className="inline-block px-2.5 py-0.5 bg-amber-50 text-amber-800 text-xs font-medium rounded-full border border-amber-200">
                      {e.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.description}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.userName}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums text-red-600">
                    -{formatCurrency(e.amount)}
                  </TableCell>
                  <TableCell>{renderActions(e)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="divide-y divide-border lg:hidden">
        {expensesList.length === 0 ? (
          <div className="py-12">
            <EmptyState icon={Receipt} title="Tidak ada pengeluaran" description="Belum ada data pengeluaran yang terdaftar." />
          </div>
        ) : (
          expensesList.map((expense) => (
            <article key={expense.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                    {expense.category}
                  </span>
                  <p className="mt-2 line-clamp-2 text-sm font-medium leading-relaxed text-stone-900">{expense.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <p className="text-sm font-bold tabular-nums text-red-600">-{formatCurrency(expense.amount)}</p>
                  {renderActions(expense)}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-xs">
                <div>
                  <p className="text-stone-500">Tanggal</p>
                  <p className="mt-0.5 font-medium text-stone-800">{formatDate(expense.expenseDate)}</p>
                </div>
                <div className="text-right">
                  <p className="text-stone-500">Dicatat oleh</p>
                  <p className="mt-0.5 font-medium text-stone-800">{expense.userName || "—"}</p>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {expensesList.length} pengeluaran
        </p>
        <div className="text-sm font-bold">
          Total: {formatCurrency(totalExpenses)}
        </div>
      </div>

      {editingExpense && (
        <EditExpenseDialog
          expense={editingExpense}
          open={!!editingExpense}
          onOpenChange={(open) => {
            if (!open) setEditingExpense(null);
          }}
        />
      )}

      {deletingExpense && (
        <ConfirmDialog
          open={!!deletingExpense}
          onOpenChange={(open) => {
            if (!open) setDeletingExpense(null);
          }}
          title="Hapus Pengeluaran?"
          description={`Apakah Anda yakin ingin menghapus data pengeluaran "${deletingExpense.description}"?`}
          confirmLabel="Hapus Data"
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
