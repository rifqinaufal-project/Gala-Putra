"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CopyAccountButtonProps {
  accountNumber: string;
}

export function CopyAccountButton({ accountNumber }: CopyAccountButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
      toast.success("Nomor rekening berhasil disalin!");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
      toast.error("Gagal menyalin nomor rekening");
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="h-9 px-3 text-xs font-semibold gap-1.5 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-all shrink-0"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-emerald-700 font-bold">Disalin</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 text-blue-600" />
          <span>Salin Rekening</span>
        </>
      )}
    </Button>
  );
}
