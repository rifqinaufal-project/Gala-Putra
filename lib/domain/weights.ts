export type WeightUnit = "GRAM" | "KG" | "TON";

const UNIT_TO_KG: Record<WeightUnit, number> = {
  GRAM: 0.001,
  KG: 1,
  TON: 1000,
};

export function convertToKg(quantity: number, unit: WeightUnit): number {
  if (!Number.isFinite(quantity) || quantity < 0) return 0;
  return Number((quantity * UNIT_TO_KG[unit]).toFixed(3));
}

export function formatWeightKg(quantityKg: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(quantityKg)} kg`;
}

export function formatWeightTon(quantityKg: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(quantityKg / 1000)} ton`;
}

export function validateWeight(quantity: number, unit: WeightUnit): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return "Berat harus lebih dari nol.";
  if (!(unit in UNIT_TO_KG)) return "Satuan berat tidak valid.";
  return null;
}
