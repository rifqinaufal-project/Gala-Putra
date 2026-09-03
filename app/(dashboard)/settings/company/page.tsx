"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Fish, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  defaultCompanyProfile,
  INDONESIAN_BANKS,
  type CompanyProfile,
  type CompanyBankAccountInput,
} from "@/lib/company-store";
import { getCompanyProfileAction, updateCompanyProfileAction } from "@/lib/actions/company";
import { createClient } from "@/lib/supabase/client";

const bankOptions = INDONESIAN_BANKS.map((label) => ({
  label,
  value: label.replace(/\s*\([^)]*\)$/, ""),
}));

function emptyAccount(): CompanyBankAccountInput {
  return { bankName: "BCA", bankAccount: "", bankHolder: "", isPrimary: false };
}

export default function CompanySettingsPage() {
  const [profile, setProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const dbProfile = await getCompanyProfileAction();
        setProfile(dbProfile);
      } catch (err) {
        console.error("Failed to load profile from database:", err);
        toast.error("Profil bisnis gagal dimuat dari database.");
      } finally {
        // Errors are surfaced through the toast above.
      }
    }
    fetchProfile();
  }, []);

  const updateAccount = useCallback(
    (index: number, patch: Partial<CompanyBankAccountInput>) => {
      setProfile((prev) => {
        const list = prev.bankAccounts ?? [];
        const next = list.map((account, i) => (i === index ? { ...account, ...patch } : account));
        return { ...prev, bankAccounts: next };
      });
    },
    [],
  );

  const addAccount = useCallback(() => {
    setProfile((prev) => ({
      ...prev,
      bankAccounts: [...(prev.bankAccounts ?? []), emptyAccount()],
    }));
  }, []);

  const removeAccount = useCallback((index: number) => {
    setProfile((prev) => {
      const list = (prev.bankAccounts ?? []).filter((_, i) => i !== index);
      if (list.length === 0) {
        // Always keep at least one editable account row.
        list.push(emptyAccount());
      } else {
        // Ensure exactly one primary.
        if (!list.some((account) => account.isPrimary)) list[0] = { ...list[0], isPrimary: true };
      }
      return { ...prev, bankAccounts: list };
    });
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error("Logo harus JPG, PNG, WebP, atau SVG dengan ukuran maksimal 2 MB.");
      return;
    }
    setLogoFile(file);
    setProfile((prev) => ({ ...prev, logoUrl: URL.createObjectURL(file) }));
    toast.success("Logo dipilih. Simpan perubahan untuk mengunggahnya.");
  };

  const handleRemoveLogo = () => {
    const updated = { ...profile, logoUrl: undefined };
    setProfile(updated);
    setLogoFile(null);
    toast.info("Logo dihapus. Menggunakan logo default.");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let payload = profile;
    if (logoFile) {
      const supabase = createClient();
      const extension = logoFile.name.split(".").pop()?.toLowerCase() || "png";
      const path = `logo/company-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("company-assets").upload(path, logoFile, { upsert: false });
      if (uploadError) {
        setLoading(false);
        toast.error(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("company-assets").getPublicUrl(path);
      payload = { ...profile, logoUrl: data.publicUrl };
    }

    const res = await updateCompanyProfileAction(payload);
    setLoading(false);

    if (res.error) {
      toast.error(`Gagal menyimpan: ${res.error}`);
    } else {
      setProfile(payload);
      setLogoFile(null);
      toast.success(res.message || "Profil bisnis berhasil diperbarui.");
    }
  };

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Profil bisnis"
        description="Atur identitas dan rekening yang tampil pada invoice, PDF, dan halaman pelanggan."
      />

      <form onSubmit={handleSave}>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-8">
          <section
            className="erp-surface overflow-hidden"
            aria-labelledby="business-identity-title"
          >
            <div className="border-b border-border px-5 py-5 sm:px-6">
              <div className="flex items-start gap-4">
                <span className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  01
                </span>
                <div>
                  <h2
                    id="business-identity-title"
                    className="text-base font-semibold tracking-[-0.02em] text-foreground"
                  >
                    Identitas bisnis
                  </h2>
                  <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                    Data di bagian ini menjadi identitas resmi pada dokumen
                    penjualan.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-7 p-5 sm:p-6">
              <div className="grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center">
                <div className="flex size-28 items-center justify-center overflow-hidden rounded-[18px] border border-border bg-muted/45">
                  {profile.logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={profile.logoUrl}
                      alt={`Logo ${profile.name || "bisnis"}`}
                      className="size-full object-contain p-3"
                    />
                  ) : (
                    <Fish
                      className="size-9 text-foreground"
                      strokeWidth={1.7}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Logo bisnis
                  </p>
                  <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
                    Gunakan JPG, PNG, WebP, atau SVG maksimal 2 MB. Logo akan
                    dipakai pada invoice digital dan PDF.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 min-[430px]:flex-row">
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-white px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted">
                      <Upload className="size-3.5" />
                      <span>
                        {logoFile ? "Ganti pilihan logo" : "Pilih logo"}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        onChange={handleLogoUpload}
                        className="sr-only"
                      />
                    </label>
                    {profile.logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveLogo}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <X className="size-3.5" /> Hapus logo
                      </Button>
                    )}
                  </div>
                  {logoFile && (
                    <p className="mt-2 truncate text-[11px] text-muted-foreground">
                      Dipilih: {logoFile.name}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 border-t border-border pt-6">
                <div>
                  <label
                    htmlFor="company-name"
                    className="mb-1.5 block text-xs font-medium text-foreground"
                  >
                    Nama bisnis <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="company-name"
                    value={profile.name}
                    onChange={(event) =>
                      setProfile({ ...profile, name: event.target.value })
                    }
                    placeholder="Gala Putra"
                    className="font-medium"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="company-address"
                    className="mb-1.5 block text-xs font-medium text-foreground"
                  >
                    Alamat kantor atau gudang
                  </label>
                  <textarea
                    id="company-address"
                    value={profile.address}
                    onChange={(event) =>
                      setProfile({ ...profile, address: event.target.value })
                    }
                    placeholder="Alamat lengkap bisnis"
                    className="min-h-24 w-full resize-y rounded-[10px] border border-input bg-white px-3 py-2.5 text-sm leading-6 outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 hover:border-[#ababa6] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="company-phone"
                      className="mb-1.5 block text-xs font-medium text-foreground"
                    >
                      Telepon atau WhatsApp
                    </label>
                    <Input
                      id="company-phone"
                      value={profile.phone}
                      onChange={(event) =>
                        setProfile({ ...profile, phone: event.target.value })
                      }
                      placeholder="0812XXXXXXXX"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="company-email"
                      className="mb-1.5 block text-xs font-medium text-foreground"
                    >
                      Email bisnis
                    </label>
                    <Input
                      id="company-email"
                      type="email"
                      value={profile.email}
                      onChange={(event) =>
                        setProfile({ ...profile, email: event.target.value })
                      }
                      placeholder="email@mail.com"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="company-website"
                      className="mb-1.5 block text-xs font-medium text-foreground"
                    >
                      Website{" "}
                      <span className="text-muted-foreground">(opsional)</span>
                    </label>
                    <Input
                      id="company-website"
                      value={profile.website}
                      onChange={(event) =>
                        setProfile({ ...profile, website: event.target.value })
                      }
                      placeholder="www.website.id"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="company-npwp"
                      className="mb-1.5 block text-xs font-medium text-foreground"
                    >
                      NPWP{" "}
                      <span className="text-muted-foreground">(opsional)</span>
                    </label>
                    <Input
                      id="company-npwp"
                      value={profile.npwp}
                      onChange={(event) =>
                        setProfile({ ...profile, npwp: event.target.value })
                      }
                      placeholder="00.000.000.0-000.000"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              className="border-t border-border px-5 py-5 sm:px-6"
              aria-labelledby="business-bank-title"
            >
              <div className="mb-5 flex items-start gap-4">
                <span className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  02
                </span>
                <div>
                  <h2
                    id="business-bank-title"
                    className="text-base font-semibold tracking-[-0.02em] text-foreground"
                  >
                    Rekening pembayaran
                  </h2>
                  <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                    Pelanggan akan melihat rekening ini pada petunjuk pembayaran
                    invoice.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {(profile.bankAccounts?.length ? profile.bankAccounts : [emptyAccount()]).map((account, index) => (
                  <div
                    key={account.id ?? `account-${index}`}
                    className="rounded-xl border border-border bg-surface-subtle/40 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Rekening {index + 1}
                        {account.isPrimary && (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 normal-case tracking-normal">
                            Utama
                          </span>
                        )}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAccount(index)}
                        className="text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        aria-label={`Hapus rekening ${index + 1}`}
                      >
                        <Trash2 className="size-3.5" /> Hapus
                      </Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-foreground">
                          Nama bank <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={account.bankName || "BCA"}
                          onValueChange={(value) =>
                            updateAccount(index, { bankName: value || "BCA" })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pilih bank" />
                          </SelectTrigger>
                          <SelectContent>
                            {bankOptions.map((bank) => (
                              <SelectItem key={bank.value} value={bank.value}>
                                {bank.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-foreground">
                          Nomor rekening <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={account.bankAccount}
                          onChange={(event) =>
                            updateAccount(index, { bankAccount: event.target.value })
                          }
                          placeholder="1234567890"
                          inputMode="numeric"
                          className="font-mono font-medium"
                          required
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-xs font-medium text-foreground">
                          Nama pemilik rekening{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={account.bankHolder}
                          onChange={(event) =>
                            updateAccount(index, { bankHolder: event.target.value })
                          }
                          placeholder="Gala Putra"
                          className="font-medium"
                          required
                        />
                      </div>
                    </div>
                    {!account.isPrimary &&
                      (profile.bankAccounts?.length ?? 1) > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() =>
                            setProfile((prev) => ({
                              ...prev,
                              bankAccounts: (prev.bankAccounts ?? []).map((item, i) => ({
                                ...item,
                                isPrimary: i === index,
                              })),
                            }))
                          }
                        >
                          Jadikan rekening utama
                        </Button>
                      )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addAccount}
                  className="w-full border-dashed"
                >
                  <Plus className="size-4" /> Tambah rekening
                </Button>
              </div>
            </div>
          </section>

          <aside className="space-y-5 lg:sticky lg:top-6">
            <section
              className="overflow-hidden rounded-[20px] bg-[#1b1b1a] p-5 text-white shadow-[0_24px_60px_-32px_rgba(0,0,0,0.75)]"
              aria-labelledby="invoice-preview-title"
            >
              <div className="flex items-center justify-between border-b border-white/15 pb-4">
                <p
                  id="invoice-preview-title"
                  className="text-xs font-medium text-white/65"
                >
                  Pratinjau invoice
                </p>
                <span className="font-mono text-[10px] tracking-[0.16em] text-white/45">
                  INVOICE
                </span>
              </div>
              <div className="py-6">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 text-[#1b1b1a]">
                    {profile.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.logoUrl}
                        alt="Pratinjau logo bisnis"
                        className="size-full object-contain"
                      />
                    ) : (
                      <Fish className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold tracking-[-0.025em]">
                      {profile.name || "Nama bisnis"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-white/55">
                      {profile.address || "Alamat bisnis akan tampil di sini"}
                    </p>
                  </div>
                </div>
                <p className="mt-4 break-words text-[11px] leading-5 text-white/55">
                  {[profile.phone, profile.email].filter(Boolean).join(" · ") ||
                    "Kontak bisnis belum diisi"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.055] p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Pembayaran transfer
                </p>
                {profile.bankAccounts?.length ? (
                  <div className="mt-3 space-y-3">
                    {profile.bankAccounts.map((account, i) => (
                      <div key={i}>
                        <p className="text-sm font-semibold">{account.bankName || "Nama bank"}</p>
                        <p className="mt-0.5 break-all font-mono text-lg tracking-[0.03em]">
                          {account.bankAccount || "0000000000"}
                        </p>
                        <p className="text-[11px] text-white/55">
                          a.n. {account.bankHolder || "Nama pemilik rekening"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <p className="mt-3 text-sm font-semibold">{profile.bankName || "Nama bank"}</p>
                    <p className="mt-1 break-all font-mono text-lg tracking-[0.03em]">
                      {profile.bankAccount || "0000000000"}
                    </p>
                    <p className="mt-2 text-[11px] text-white/55">
                      a.n. {profile.bankHolder || "Nama pemilik rekening"}
                    </p>
                  </>
                )}
              </div>
            </section>

            <div className="border-y border-border py-4">
              <p className="text-sm font-semibold text-foreground">
                Simpan profil bisnis
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Perubahan diterapkan ke invoice baru dan pratinjau pelanggan.
              </p>
              <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="mt-4 w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Menyimpan
                  </>
                ) : (
                  "Simpan perubahan"
                )}
              </Button>
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
}
