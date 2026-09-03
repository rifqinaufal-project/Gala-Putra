import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { getExpensesAction } from "@/lib/actions/expenses";
import { formatCurrency } from "@/lib/utils";
import { AddExpenseDialog } from "@/components/expenses/add-expense-dialog";
import { MetricCard } from "@/components/dashboard/metric-card";
import { DollarSign, Receipt, PieChart, TrendingUp } from "lucide-react";
import { ExpenseTable } from "@/components/expenses/expense-table";
import { requireRole } from "@/lib/security/auth";

export const metadata: Metadata = {
  title: "Pengeluaran Operasional",
};

export default async function ExpensesPage() {
  await requireRole(["OWNER", "FINANCE"]);
  const expenses = await getExpensesAction();
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalCount = expenses.length;
  const avgExpense = totalCount > 0 ? Math.round(totalExpenses / totalCount) : 0;

  // Calculate top category
  const categoryMap: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
  });
  let topCategory = "—";
  let topCategoryAmount = 0;
  Object.entries(categoryMap).forEach(([cat, amt]) => {
    if (amt > topCategoryAmount) {
      topCategoryAmount = amt;
      topCategory = cat;
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengeluaran Operasional"
        description="Kelola biaya pengeluaran operasional di luar biaya invoice"
      >
        <AddExpenseDialog />
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          accent="red"
          title="Total Pengeluaran"
          value={totalExpenses}
          isCurrency
          icon={DollarSign}
        />
        <MetricCard
          title="Jumlah Transaksi"
          value={totalCount}
          suffix="transaksi"
          icon={Receipt}
        />
        <MetricCard
          title="Kategori Terbesar"
          value={topCategory}
          suffix={topCategoryAmount > 0 ? `(${formatCurrency(topCategoryAmount)})` : ""}
          icon={PieChart}
        />
        <MetricCard
          title="Rata-rata Pengeluaran"
          value={avgExpense}
          isCurrency
          icon={TrendingUp}
        />
      </div>

      {/* Table */}
      <div className="erp-surface overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Riwayat Pengeluaran Operasional</h3>
        </div>
        <ExpenseTable expenses={expenses} totalExpenses={totalExpenses} />
      </div>
    </div>
  );
}
