import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DirectCostCategory, InvoiceStatus } from "@/types";

// ─── Class merge ───

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ─── Currency & Number Formatters ───

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace(/\u00a0/g, " ");
}

export function formatCurrencyCompact(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `Rp ${(amount / 1_000_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000_000) {
    return `Rp ${(amount / 1_000_000).toFixed(1)}Jt`;
  }
  if (amount >= 1_000) {
    return `Rp ${(amount / 1_000).toFixed(0)}Rb`;
  }
  return `Rp ${amount}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(3)).toString();
}

export function getBillingQuantity(quantity: number, marginQuantity = 0): number {
  return Number((quantity + marginQuantity).toFixed(3));
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(dateStr));
}

export function formatDateShort(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

export function formatDatetime(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

// ─── Invoice Calculation ───

export interface InvoiceCalcItem {
  quantity: number;
  billingQuantity?: number;
  purchaseQuantity?: number;
  sellingPrice: number;
  purchasePrice: number;
}

export interface InvoiceCalcCost {
  amount: number;
}

export function calculateInvoice(
  items: InvoiceCalcItem[],
  directCosts: InvoiceCalcCost[],
  discount: number
) {
  const subtotal = items.reduce(
    (sum, item) => sum + (item.billingQuantity ?? item.quantity) * item.sellingPrice,
    0
  );
  const totalProductCost = items.reduce(
    (sum, item) => sum + (item.purchaseQuantity ?? item.quantity) * item.purchasePrice,
    0
  );
  const totalDirectCost = directCosts.reduce((sum, c) => sum + c.amount, 0);
  const revenue = subtotal - discount;
  const productProfit = revenue - totalProductCost;
  const transactionProfit = productProfit - totalDirectCost;
  const transactionMargin =
    revenue === 0 ? 0 : (transactionProfit / revenue) * 100;

  return {
    subtotal,
    revenue,
    totalProductCost,
    totalDirectCost,
    productProfit,
    transactionProfit,
    transactionMargin,
  };
}

// ─── Status helpers ───

export function getInvoiceStatusLabel(status: InvoiceStatus): string {
  const map: Record<InvoiceStatus, string> = {
    DRAFT: "Draft",
    ISSUED: "Diterbitkan",
    PARTIALLY_PAID: "Dibayar Sebagian",
    PAID: "Lunas",
    OVERDUE: "Jatuh Tempo",
    VOID: "Dibatalkan",
  };
  return map[status];
}

export function getDirectCostLabel(category: DirectCostCategory): string {
  const map: Record<DirectCostCategory, string> = {
    PACKAGING: "Packaging",
    ICE: "Es",
    SHIPPING: "Pengiriman",
    FUEL: "Bensin",
    TOLL: "Tol",
    PARKING: "Parkir",
    COURIER: "Kurir",
    PRODUCT_LOSS: "Penyusutan",
    OTHER: "Lainnya",
  };
  return map[category];
}

export function parseProductDescription(desc: string, itemSize?: string) {
  if (!desc) return { name: "", size: "—" };

  // If itemSize is explicitly provided from database/model
  if (itemSize && itemSize.trim() && itemSize !== "—") {
    const cleanName = desc
      .replace(/\s*\[.*?\]\s*/g, " ")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .trim();
    return { name: cleanName || desc, size: itemSize.trim() };
  }

  const str = desc.trim();

  // 1. Check for [...] at end
  const bracketMatch = str.match(/^(.*?)\s*\[(.*?)\]$/);
  if (bracketMatch) {
    return { name: bracketMatch[1].trim(), size: bracketMatch[2].trim() };
  }

  // 2. Check for (...) at end
  const parenMatch = str.match(/^(.*?)\s*\((.*?)\)$/);
  if (parenMatch) {
    return { name: parenMatch[1].trim(), size: parenMatch[2].trim() };
  }

  // 3. Fallback for any trailing [size] or (size) in string
  const trailingMatch = str.match(/^(.*?)\s*[\(\[](.*?)[\)\]]\s*$/);
  if (trailingMatch) {
    return { name: trailingMatch[1].trim(), size: trailingMatch[2].trim() };
  }

  return { name: str, size: "—" };
}
