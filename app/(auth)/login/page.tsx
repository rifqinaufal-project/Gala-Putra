"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Eye, EyeOff, Fish, Loader2, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { signInAction } from "@/lib/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Email dan password wajib diisi.");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    const res = await signInAction(formData);
    if (res?.error) {
      setError(res.error);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <main
      id="main-content"
      className="flex min-h-[100dvh] items-center justify-center bg-[#f3f4f6] p-3 sm:p-5 lg:h-[100dvh] lg:overflow-hidden lg:p-7"
    >
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] w-full max-w-[1080px] overflow-hidden rounded-[24px] border border-white/80 bg-white p-2 shadow-[0_24px_80px_-40px_rgba(28,25,23,0.28)] sm:min-h-[calc(100dvh-2.5rem)] sm:p-3 lg:h-[min(720px,calc(100dvh-3.5rem))] lg:min-h-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.95fr)] lg:rounded-[26px]">
        <section className="relative hidden min-h-0 overflow-hidden rounded-[18px] bg-[#0d5267] lg:block" aria-label="Gala Putra seafood">
          <Image src="/seafood-login.png" alt="Kotak ikan dan seafood segar di tepi laut" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,37,49,0.34)_0%,rgba(5,37,49,0.06)_45%,rgba(5,37,49,0.78)_100%)]" />
          <div className="relative flex h-full min-h-0 flex-col justify-between p-7 text-white xl:p-9">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm"><Fish className="size-5" /></span>
              <div><p className="text-sm font-semibold tracking-[-0.02em]">Gala Putra</p><p className="text-[10px] uppercase tracking-[0.18em] text-white/65">Seafood operations</p></div>
            </div>
            <div className="max-w-md">
              <p className="mb-3 flex items-center gap-2 text-xs font-medium text-white/75"><Waves className="size-3.5" /> Dari laut ke pencatatan yang lebih rapi</p>
              <h2 className="max-w-[11ch] text-4xl font-semibold leading-[0.98] tracking-[-0.06em] xl:text-5xl">Kelola seafood lebih mudah.</h2>
              <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">Pantau muatan, invoice, pembayaran, dan alur operasional Gala Putra dari satu workspace.</p>
            </div>
            <div className="flex items-end justify-between gap-4 text-xs text-white/65"><span>Designed &amp; Developed by <a href="https://github.com/Rifqin-11" target="_blank" rel="noreferrer" className="font-semibold text-white underline decoration-white/40 underline-offset-4 transition-colors hover:text-white hover:decoration-white">Rifqin11</a></span><ArrowUpRight className="size-4" /></div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col justify-center px-5 py-7 sm:px-9 lg:px-11 xl:px-14" aria-labelledby="login-title">
          <div className="mx-auto w-full max-w-[370px]">
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Fish className="size-5" /></span>
              <div><p className="text-sm font-semibold">Gala Putra</p><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Seafood operations</p></div>
            </div>
            <div className="mb-6">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Akses workspace</p>
              <h1 id="login-title" className="text-3xl font-semibold tracking-[-0.055em] text-foreground sm:text-4xl">Masuk ke Gala Putra</h1>
              <p className="mt-2 max-w-sm text-sm leading-5 text-muted-foreground">Gunakan akun Anda untuk melanjutkan ke dashboard operasional.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-xs font-semibold text-foreground">Email</label>
                <Input id="email" type="email" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl text-sm" autoComplete="email" required />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="password" className="block text-xs font-semibold text-foreground">Password</label><span className="text-[11px] text-muted-foreground">Minimal 8 karakter</span></div>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="Masukkan password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl pr-12 text-sm" autoComplete="current-password" required />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                </div>
              </div>

              {error && <div className="space-y-0.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert"><p className="font-semibold">Gagal masuk</p><p className="text-red-600">{error}</p></div>}

              <Button type="submit" className="mt-1 h-11 w-full rounded-xl text-sm font-semibold" disabled={loading}>{loading && <Loader2 className="mr-2 size-4 animate-spin" />}{loading ? "Memverifikasi..." : "Masuk sistem"}</Button>
            </form>

            <div className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">Belum memiliki akun? <a href="/register" className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">Daftar akun baru</a></div>
            <p className="mt-6 text-center text-[10px] text-muted-foreground">© 2026 Gala Putra. Semua hak dilindungi.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
