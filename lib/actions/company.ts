"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireApprovedUser, requireRole } from "@/lib/security/auth";
import { defaultCompanyProfile, type CompanyProfile } from "@/lib/company-store";

export async function getCompanyProfileAction(): Promise<CompanyProfile> {
  await requireApprovedUser();
  const supabase = await createClient();
  const [{ data, error }, { data: accountRows, error: accountError }] = await Promise.all([
    supabase.from("company_profile").select("id,name,address,phone,email,website,npwp,bank_name,bank_account,bank_holder,logo_url").limit(1).maybeSingle(),
    supabase.from("company_bank_accounts").select("id,bank_name,bank_account,bank_holder,is_primary").order("is_primary", { ascending: false }).order("created_at", { ascending: true }),
  ]);
  if (error) throw new Error(error.message);
  if (accountError) throw new Error(accountError.message);
  if (!data) return defaultCompanyProfile;
  const bankAccounts = (accountRows ?? []).map((account) => ({
    id: String(account.id),
    bankName: String(account.bank_name),
    bankAccount: String(account.bank_account),
    bankHolder: String(account.bank_holder),
    isPrimary: Boolean(account.is_primary),
  }));
  return {
    name: data.name,
    address: data.address ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    website: data.website ?? "",
    npwp: data.npwp ?? "",
    bankName: data.bank_name,
    bankAccount: data.bank_account,
    bankHolder: data.bank_holder,
    logoUrl: data.logo_url ?? undefined,
    bankAccounts,
  };
}

export async function updateCompanyProfileAction(payload: CompanyProfile) {
  try {
    await requireRole(["OWNER"]);
    if (!payload.name.trim()) return { error: "Nama bisnis wajib diisi." };
    const bankAccounts = (payload.bankAccounts ?? []).filter(
      (account) => account.bankName.trim() && account.bankAccount.trim() && account.bankHolder.trim(),
    );
    const primary = bankAccounts.find((account) => account.isPrimary) ?? bankAccounts[0];
    if (!primary) return { error: "Minimal satu rekening pembayaran wajib diisi." };
    if (payload.logoUrl?.startsWith("data:")) return { error: "Logo harus diunggah ke Storage, bukan disimpan sebagai Base64." };
    const supabase = await createClient();

    const { data: profileData, error: profileError } = await supabase.from("company_profile").select("id").limit(1).maybeSingle();
    if (profileError) throw profileError;
    if (!profileData?.id) return { error: "Profil bisnis belum tersedia." };

    // Keep single-row columns in sync with the primary account for compatibility.
    const syncPayload: Record<string, unknown> = {
      ...payload,
      bankName: primary.bankName,
      bankAccount: primary.bankAccount,
      bankHolder: primary.bankHolder,
    };
    const { error: rpcError } = await supabase.rpc("update_company_profile", { p_payload: syncPayload });
    if (rpcError) throw rpcError;

    // Replace bank account rows idempotently.
    await supabase.from("company_bank_accounts").delete().eq("company_profile_id", profileData.id);
    if (bankAccounts.length > 0) {
      const { error: insertError } = await supabase.from("company_bank_accounts").insert(
        bankAccounts.map((account, index) => ({
          company_profile_id: profileData.id,
          bank_name: account.bankName.trim(),
          bank_account: account.bankAccount.trim(),
          bank_holder: account.bankHolder.trim(),
          is_primary: index === 0,
        })),
      );
      if (insertError) throw insertError;
    }

    revalidatePath("/settings/company");
    revalidatePath("/invoices");
    return { success: true, message: "Profil bisnis berhasil diperbarui." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menyimpan profil bisnis.") };
  }
}
