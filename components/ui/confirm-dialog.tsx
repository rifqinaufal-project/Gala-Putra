"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
  note?: string;
  confirmationText?: string;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Ya, Hapus",
  variant = "destructive",
  note,
  confirmationText,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white p-0 shadow-[0_24px_80px_-28px_rgba(28,25,23,0.45)] sm:max-w-lg"
      >
        <DialogHeader className="relative items-center px-6 pb-7 pt-9 text-center sm:px-10 sm:pb-9 sm:pt-11">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            aria-label="Tutup dialog"
          >
            <X className="size-4" />
          </Button>
          <div className="mb-5 flex size-16 items-center justify-center rounded-3xl border border-red-200 bg-red-50 text-red-600 shadow-sm sm:size-20">
            <AlertTriangle className="size-8 sm:size-9" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-3 max-w-sm text-pretty text-sm leading-6 text-muted-foreground sm:text-[15px]">
            {description}
          </DialogDescription>
          {note && (
            <p className="mt-5 max-w-sm rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-left text-xs leading-5 text-stone-600">
              {note}
            </p>
          )}
          {confirmationText && (
            <div className="mt-5 w-full max-w-sm text-left">
              <label className="text-xs font-semibold text-stone-700">Ketik <span className="font-bold text-stone-950">{confirmationText}</span> untuk melanjutkan</label>
              <Input
                value={typedConfirmation}
                onChange={(event) => setTypedConfirmation(event.target.value)}
                onKeyDown={(event) => {
                  // Destructive confirmation must require an explicit button click.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                className="mt-2 h-11 border-stone-300"
                autoComplete="off"
              />
            </div>
          )}
        </DialogHeader>

        <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-stone-50/80 px-5 py-5 sm:flex-row sm:justify-end sm:px-7">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl bg-white px-5 sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={loading || (confirmationText !== undefined && typedConfirmation !== confirmationText)}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            className="h-11 w-full rounded-xl px-5 sm:w-auto"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
