"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, CheckCircle2, Eye, EyeOff, Fish, Loader2, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { signUpAction } from "@/lib/actions/auth";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!fullName || !email || !password || !confirmPassword) {
      setError("Semua kolom wajib diisi.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok dengan password.");
      return;
    }

    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("fullName", fullName);
    formData.append("email", email);
    formData.append("password", password);
    formData.append("confirmPassword", confirmPassword);

    const res = await signUpAction(formData);
    setLoading(false);

    if (res?.error) {
      const errStr = res.error ? String(res.error) : "";
      if (!errStr || errStr === "{}" || errStr === "[object Object]") {
        setError("Gagal mendaftar. Email mungkin sudah terdaftar atau terjadi kendala server.");
      } else {
        setError(errStr);
      }
    } else if (res?.success) {
      setSuccessMessage(
        res.message ||
          "Pendaftaran berhasil. Akun Anda sudah aktif dan siap digunakan."
      );
    }
  };

  return (
    <main
      id="main-content"
      className="flex min-h-[100dvh] items-center justify-center bg-[#f3f4f6] p-3 sm:p-5 lg:h-[100dvh] lg:overflow-hidden lg:p-7"
    >
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] w-full max-w-[1080px] overflow-hidden rounded-[24px] border border-white/80 bg-white p-2 shadow-[0_24px_80px_-40px_rgba(28,25,23,0.28)] sm:min-h-[calc(100dvh-2.5rem)] sm:p-3 lg:h-[min(720px,calc(100dvh-3.5rem))] lg:min-h-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:rounded-[26px]">
        <section className="relative hidden min-h-0 overflow-hidden rounded-[18px] bg-[#0d5267] lg:block">
          <Image src="/seafood-login.png" alt="Kotak ikan dan seafood segar di tepi laut" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,37,49,0.34)_0%,rgba(5,37,49,0.06)_45%,rgba(5,37,49,0.78)_100%)]" />
          <div className="relative flex h-full min-h-0 flex-col justify-between p-7 text-white xl:p-9">
            <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm"><Fish className="size-5" /></span><div><p className="text-sm font-semibold tracking-[-0.02em]">Gala Putra</p><p className="text-[10px] uppercase tracking-[0.18em] text-white/65">Seafood operations</p></div></div>
            <div className="max-w-md"><p className="mb-3 flex items-center gap-2 text-xs font-medium text-white/75"><Waves className="size-3.5" /> Workspace operasional</p><h2 className="max-w-[11ch] text-4xl font-semibold leading-[0.98] tracking-[-0.06em] xl:text-5xl">Mulai kelola seafood dengan rapi.</h2><p className="mt-4 max-w-sm text-sm leading-6 text-white/75">Buat akun untuk mencatat muatan, invoice, pembayaran, dan aktivitas Gala Putra.</p></div>
            <div className="flex items-end justify-between gap-4 text-xs text-white/65"><span>Akun baru langsung aktif sebagai Staff</span><ArrowUpRight className="size-4" /></div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col justify-center px-5 py-5 sm:px-9 lg:px-11 xl:px-14" aria-labelledby="register-title">
          <div className="mx-auto w-full max-w-[370px]">
            <div className="mb-5 flex items-center gap-3 lg:hidden"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Fish className="size-5" /></span><div><p className="text-sm font-semibold">Gala Putra</p><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Seafood operations</p></div></div>
            <div className="mb-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Akses workspace</p><h1 id="register-title" className="text-3xl font-semibold tracking-[-0.055em] text-foreground">Buat akun Gala Putra</h1><p className="mt-1.5 text-sm leading-5 text-muted-foreground">Daftarkan akun baru untuk masuk ke workspace operasional.</p></div>

            {successMessage ? (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="size-5 shrink-0 text-emerald-500" /><span>Akun berhasil dibuat</span></div><p className="text-xs leading-5 text-emerald-700">{successMessage}</p><Link href="/login" className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">Kembali ke login</Link></div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-2.5">
                <div><label htmlFor="fullName" className="mb-1 block text-xs font-semibold text-foreground">Nama lengkap <span className="text-red-500">*</span></label><Input id="fullName" type="text" placeholder="Contoh: Budi Santoso" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9 rounded-xl text-sm" autoComplete="name" required /></div>
                <div><label htmlFor="email" className="mb-1 block text-xs font-semibold text-foreground">Email <span className="text-red-500">*</span></label><Input id="email" type="email" placeholder="email@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 rounded-xl text-sm" autoComplete="email" required /></div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"><div><label htmlFor="password" className="mb-1 block text-xs font-semibold text-foreground">Password <span className="text-red-500">*</span></label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} placeholder="Min. 8 karakter" value={password} onChange={(e) => setPassword(e.target.value)} className="h-9 rounded-xl pr-10 text-sm" autoComplete="new-password" required /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button></div></div><div><label htmlFor="confirmPassword" className="mb-1 block text-xs font-semibold text-foreground">Konfirmasi <span className="text-red-500">*</span></label><Input id="confirmPassword" type={showPassword ? "text" : "password"} placeholder="Ulangi password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-9 rounded-xl text-sm" autoComplete="new-password" required /></div></div>
                <p className="rounded-xl bg-muted px-3 py-1.5 text-[11px] leading-4 text-muted-foreground">Akun baru langsung aktif sebagai Staff. Role Owner dan Finance hanya dapat ditetapkan oleh Owner.</p>
                {error && <div className="space-y-0.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert"><p className="font-semibold">Pendaftaran gagal</p><p className="text-red-600">{error}</p></div>}
                <Button type="submit" className="mt-1 h-10 w-full rounded-xl text-sm font-semibold" disabled={loading}>{loading && <Loader2 className="mr-2 size-4 animate-spin" />}{loading ? "Membuat akun..." : "Daftar akun"}</Button>
              </form>
            )}

            <div className="mt-4 border-t border-border pt-3 text-center text-xs text-muted-foreground">Sudah memiliki akun? <Link href="/login" className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">Masuk di sini</Link></div>
            <p className="mt-4 text-center text-[10px] text-muted-foreground">© 2026 Gala Putra. Semua hak dilindungi.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
