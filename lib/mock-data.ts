// ─── Mock Data — Gala Putra ERP ───

import type {
  Customer,
  DashboardMetrics,
  Expense,
  InternalCostBreakdown,
  Invoice,
  Payment,
  Product,
  ProductCost,
  ProfitDataPoint,
  SalesDataPoint,
  Supplier,
} from "@/types";

// ─── Empty Mock Data (Using Real Database Data Only) ───

export const mockMetrics: DashboardMetrics = {
  ordersInPeriod: 0,
  ordersInPeriodChange: 0,
  revenueInPeriod: 0,
  revenueInPeriodChange: 0,
  transactionProfitInPeriod: 0,
  transactionMarginInPeriod: 0,
  operatingExpensesInPeriod: 0,
  netProfitInPeriod: 0,
  netMarginInPeriod: 0,
  receivables: 0,
  overdueCount: 0,
  totalDirectCostsInPeriod: 0,
};

export const mockSalesData: SalesDataPoint[] = [];

export const mockProfitData: ProfitDataPoint[] = [];

export const mockInternalCosts: InternalCostBreakdown[] = [];

export const mockProducts: Product[] = [];

export const mockProductCosts: ProductCost[] = [];

export const mockCustomers: Customer[] = [];

export const mockSuppliers: Supplier[] = [];

export const mockInvoices: Invoice[] = [];

export const mockPayments: Payment[] = [];

export const mockExpenses: Expense[] = [];
