import test from "node:test";
import assert from "node:assert/strict";
import { convertToKg, formatWeightKg, formatWeightTon } from "../lib/domain/weights.ts";
import { getLoadTotalKg } from "../lib/domain/loads.ts";
import { validateReconciliationItems } from "../lib/domain/reconciliation.ts";
import { calculateInvoice, formatCurrency } from "../lib/utils.ts";
import { createCsv } from "../lib/csv.ts";
import { getEffectiveInvoiceStatus, isPublicInvoice, sanitizeInvoiceForRole } from "../lib/domain/invoices.ts";
import { ROLE_PERMISSIONS, type Invoice } from "../types/index.ts";
import { calculateMargin, calculateWeightedAverageCost, getStockMovementLabel, getStockStatus, normalizeProductUnit, validateStockAdjustment, validateStockReceiptCancellation, validateStockReceiptPayload, validateStockSettings } from "../lib/domain/inventory.ts";
import { normalizeActionError } from "../lib/security/errors.ts";

const invoice: Invoice = {
  id: "11111111-1111-1111-1111-111111111111", publicToken: "22222222-2222-2222-2222-222222222222",
  invoiceNumber: "INV/2026/07/0001", customerId: "33333333-3333-3333-3333-333333333333", customerName: "Restoran",
  issueDate: "2026-07-01", dueDate: "2026-07-08", status: "ISSUED", subtotal: 100_000, discount: 0, total: 100_000,
  totalProductCost: 60_000, totalDirectCost: 5_000, productProfit: 40_000, transactionProfit: 35_000, transactionMargin: 35,
  items: [{ id: "1", productId: "p", descriptionSnapshot: "Ikan", unit: "kg", quantity: 1, sellingPriceSnapshot: 100_000, purchasePriceSnapshot: 60_000, subtotal: 100_000, totalPurchaseCost: 60_000, productProfit: 40_000 }],
  directCosts: [{ id: "1", category: "SHIPPING", name: "Kirim", amount: 5_000 }], totalPaid: 0, remainingBalance: 100_000,
  createdBy: "u", createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
};

test("invoice calculations include discounts and direct costs", () => {
  const result = calculateInvoice([{ quantity: 2, sellingPrice: 50_000, purchasePrice: 30_000 }], [{ amount: 5_000 }], 10_000);
  assert.deepEqual(result, { subtotal: 100_000, revenue: 90_000, totalProductCost: 60_000, totalDirectCost: 5_000, productProfit: 30_000, transactionProfit: 25_000, transactionMargin: 25_000 / 90_000 * 100 });
});

test("weight units normalize to kilograms and ton display", () => {
  assert.equal(convertToKg(500, "GRAM"), 0.5);
  assert.equal(convertToKg(1, "TON"), 1000);
  assert.equal(getLoadTotalKg([
    { sourceId: "s1", productId: "p1", quantity: 500, unit: "GRAM", purchasePricePerKg: 10 },
    { sourceId: "s2", productId: "p2", quantity: 1, unit: "TON", purchasePricePerKg: 10 },
  ]), 1000.5);
  assert.equal(formatWeightKg(1000.5), "1.000,5 kg");
  assert.equal(formatWeightTon(1000.5), "1,001 ton");
});

test("product weight units use kilograms for canonical load and reject stock", () => {
  assert.equal(normalizeProductUnit("ton"), "kg");
  assert.equal(normalizeProductUnit("tons"), "kg");
  assert.equal(normalizeProductUnit("kg"), "kg");
  assert.equal(normalizeProductUnit("ekor"), "ekor");
});

test("factory reconciliation cannot exceed sent weight", () => {
  const sent = new Map([["p1", 100]]);
  assert.equal(validateReconciliationItems([{ productId: "p1", acceptedQuantityKg: 80, rejectedQuantityKg: 20 }], sent), null);
  assert.match(validateReconciliationItems([{ productId: "p1", acceptedQuantityKg: 81, rejectedQuantityKg: 20 }], sent) ?? "", /tidak boleh melebihi/);
});

test("overdue status is derived without mutating database state", () => {
  assert.equal(getEffectiveInvoiceStatus("ISSUED", "2026-07-08", new Date("2026-07-09T00:00:00Z")), "OVERDUE");
  assert.equal(getEffectiveInvoiceStatus("PAID", "2026-07-08", new Date("2026-07-09T00:00:00Z")), "PAID");
});

test("staff DTO removes internal financial fields", () => {
  const safe = sanitizeInvoiceForRole(invoice, false);
  assert.equal(safe.totalProductCost, 0);
  assert.equal(safe.items[0].purchasePriceSnapshot, 0);
  assert.deepEqual(safe.directCosts, []);
});

test("permission matrix keeps sensitive capabilities away from staff", () => {
  assert.equal(ROLE_PERMISSIONS.STAFF.includes("view_profit"), false);
  assert.equal(ROLE_PERMISSIONS.FINANCE.includes("record_payment"), true);
  assert.equal(ROLE_PERMISSIONS.OWNER.includes("manage_users"), true);
});

test("public invoice validator requires a public-safe contract", () => {
  assert.equal(isPublicInvoice({ publicToken: "t", invoiceNumber: "n", customerName: "c", items: [], company: {} }), true);
  assert.equal(isPublicInvoice(invoice), false);
});

test("CSV generator escapes formulas, commas, and quotes as text cells", () => {
  const csv = createCsv(["Name", "Value", "Formula"], [["A, B", 'He said "ok"', "=2+2"]]);
  assert.equal(csv, '"Name","Value","Formula"\r\n"A, B","He said ""ok""","\'=2+2"');
});

test("currency formatting keeps Indonesian thousand separators readable", () => {
  assert.equal(formatCurrency(1250000), "Rp 1.250.000");
});

test("stock receipt validation rejects duplicate products and invalid quantities", () => {
  const base = { supplierId: "supplier", receivedDate: "2026-08-03", items: [{ productId: "p1", quantity: 2, unitCost: 50_000 }] };
  assert.equal(validateStockReceiptPayload(base), null);
  assert.match(validateStockReceiptPayload({ ...base, items: [...base.items, { productId: "p1", quantity: 1, unitCost: 40_000 }] }) ?? "", /satu kali/);
  assert.match(validateStockReceiptPayload({ ...base, items: [{ ...base.items[0], quantity: 0 }] }) ?? "", /valid/);
});

test("stock receipt validation accepts numeric formatted-currency values", () => {
  assert.equal(validateStockReceiptPayload({
    supplierId: "supplier",
    receivedDate: "2026-08-03",
    items: [{ productId: "p1", quantity: 2, unitCost: 85000 }],
  }), null);
});

test("stock adjustment requires a reason and movement labels stay readable", () => {
  assert.match(validateStockAdjustment("p1", 1, "") ?? "", /Alasan/);
  assert.equal(validateStockAdjustment("p1", -2, "Stok opname"), null);
  assert.equal(getStockMovementLabel("SALE_OUT"), "Keluar untuk invoice");
});

test("stock receipt cancellation requires both a receipt and reason", () => {
  assert.match(validateStockReceiptCancellation("", "Salah harga") ?? "", /tidak valid/);
  assert.match(validateStockReceiptCancellation("receipt-1", "") ?? "", /Alasan/);
  assert.equal(validateStockReceiptCancellation("receipt-1", "Harga supplier salah"), null);
});

test("weighted-average HPP combines current stock with a differently priced receipt", () => {
  assert.equal(calculateWeightedAverageCost(10, 50_000, 5, 65_000), 55_000);
  assert.equal(calculateWeightedAverageCost(0, 0, 5, 65_000), 65_000);
  assert.equal(calculateWeightedAverageCost(20, 70_000, 20, 85_000), 77_500);
});

test("margin and minimum-stock status use HPP summary without confusing it with supplier price", () => {
  assert.deepEqual(calculateMargin(100_000, 73_333), { nominal: 26_667, percentage: 26.667 });
  assert.equal(getStockStatus(0, 5), "Habis");
  assert.equal(getStockStatus(5, 5), "Menipis");
  assert.equal(getStockStatus(6, 5), "Aman");
});

test("stock opname accepts an absolute target balance", () => {
  assert.equal(validateStockSettings({ productId: "p1", targetQuantity: 15, minimumQuantity: 5, notes: "Stok opname" }), null);
  assert.match(validateStockSettings({ productId: "p1", targetQuantity: -1, minimumQuantity: 0 }) ?? "", /aktual/);
});

test("action errors expose structured database details", () => {
  const error = normalizeActionError(
    {
      message: "function create_stock_receipt_transaction(jsonb) does not exist",
      code: "42883",
      details: "Could not find the function in the schema cache",
      hint: "Verify the function name and arguments",
    },
    "fallback",
  );
  assert.match(error, /Fungsi database belum tersedia/);
  assert.match(error, /Kode: 42883/);
  assert.match(error, /Detail:/);
  assert.match(error, /Petunjuk:/);
});
