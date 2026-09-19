"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string; code?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const forbidden =
    error.code === "FORBIDDEN" ||
    error.name === "AuthorizationError" ||
    error.message === "Anda tidak memiliki hak akses untuk tindakan ini.";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-[18px] border border-border bg-card px-6 py-16 text-center shadow-card">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-xl font-bold text-muted-foreground">
        403
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-foreground">
        {forbidden ? "Akses dibatasi" : "Terjadi kesalahan"}
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {forbidden
          ? "Anda tidak memiliki hak akses untuk membuka halaman ini. Silakan hubungi Owner untuk mengubah peran akun Anda."
          : "Terjadi kendala saat memuat halaman. Silakan coba lagi."}
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
          Kembali ke Dashboard
        </Link>
        {!forbidden && (
          <Button variant="outline" size="sm" onClick={reset}>
            Coba lagi
          </Button>
        )}
      </div>
    </div>
  );
}
