export interface ReconciliationItemInput {
  productId: string;
  acceptedQuantityKg: number;
  rejectedQuantityKg: number;
  rejectQuality?: string;
  rejectNotes?: string;
}

export function validateReconciliationItems(
  items: ReconciliationItemInput[],
  sentByProduct: Map<string, number>,
): string | null {
  if (!items.length) return "Hasil pabrik belum diisi.";
  for (const item of items) {
    const sent = sentByProduct.get(item.productId) ?? 0;
    const accepted = Number(item.acceptedQuantityKg);
    const rejected = Number(item.rejectedQuantityKg);
    if (!Number.isFinite(accepted) || accepted < 0 || !Number.isFinite(rejected) || rejected < 0) {
      return "Berat diterima dan reject harus nol atau lebih.";
    }
    if (Number((accepted + rejected).toFixed(3)) > Number(sent.toFixed(3))) {
      return "Berat diterima dan reject tidak boleh melebihi berat yang dikirim.";
    }
  }
  return null;
}
