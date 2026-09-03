"use client";

import { useState } from "react";
import { CreditCard, Loader2, Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createPaymentAction } from "@/lib/actions/payments";
import type { Invoice, PaymentMethod } from "@/types";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

interface RecordPaymentDialogProps {
  defaultInvoiceId?: string;
  invoices?: Invoice[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function RecordPaymentDialog({
  defaultInvoiceId,
  invoices,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: RecordPaymentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (val: boolean) => {
    if (isControlled && controlledOnOpenChange) {
      controlledOnOpenChange(val);
    } else {
      setInternalOpen(val);
    }
  };

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const invoicesList = invoices ?? [];
  const [invoiceId, setInvoiceId] = useState(defaultInvoiceId || "");
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [notes, setNotes] = useState("");

  const activeInvoiceId = invoiceId || defaultInvoiceId || "";
  const selectedInvoice = invoicesList.find((i) => i.id === activeInvoiceId);

  const resetForm = () => {
    setAmount(0);
    setProofFile(null);
    setFileName("");
    setNotes("");
    setError("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      setError("Bukti pembayaran harus berupa JPG, PNG, WebP, atau PDF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran bukti pembayaran maksimal 5 MB.");
      return;
    }
    setError("");
    setFileName(file.name);
    setProofFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const targetId = activeInvoiceId;

    if (!targetId || amount <= 0) {
      setError("Pilih invoice dan masukkan jumlah bayar yang valid.");
      return;
    }

    setLoading(true);

    let proofPath: string | undefined;
    if (proofFile) {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        setLoading(false);
        setError("Sesi login tidak valid.");
        return;
      }
      const safeName = proofFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      proofPath = `${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(proofPath, proofFile, { upsert: false });
      if (uploadError) {
        setLoading(false);
        setError(uploadError.message);
        return;
      }
    }

    const res = await createPaymentAction({
      invoiceId: targetId,
      amount: amount,
      paymentDate,
      method,
      proofPath,
      notes: notes || undefined,
    });

    setLoading(false);

    if (res.error) {
      if (proofPath) await createClient().storage.from("payment-proofs").remove([proofPath]);
      setError(res.error);
    } else {
      resetForm();
      router.refresh();
      setOpen(false);
    }
  };

  return (
    <>
      {!isControlled &&
        (trigger ? (
          <div onClick={() => setOpen(true)}>{trigger}</div>
        ) : (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            className="h-10 px-4 text-xs"
          >
            <CreditCard className="w-3.5 h-3.5 mr-1" />
            Catat Pembayaran
          </Button>
        ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Catat Pembayaran Pelanggan</DialogTitle>
            <DialogDescription>
              Masukkan rincian pembayaran masuk dan unggah bukti transfer.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Invoice Target <span className="text-red-500">*</span>
              </label>
              <Select value={activeInvoiceId} onValueChange={(v) => setInvoiceId(v || "")}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Pilih Invoice...">
                    {selectedInvoice ? `${selectedInvoice.invoiceNumber ?? "DRAFT"} — ${selectedInvoice.customerName}` : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {invoicesList
                    .filter((i) => i.status !== "PAID" && i.status !== "VOID")
                    .map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoiceNumber ?? "DRAFT"} — {inv.customerName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {selectedInvoice && (
              <div className="p-2.5 bg-muted/40 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Invoice:</span>
                  <span className="font-semibold">
                    {formatCurrency(selectedInvoice.total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sisa Tagihan:</span>
                  <span className="font-bold text-amber-600">
                    {formatCurrency(selectedInvoice.remainingBalance)}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Jumlah Bayar (Rp) <span className="text-red-500">*</span>
                </label>
                <CurrencyInput
                  value={amount}
                  onChange={setAmount}
                  placeholder="5000000"
                  className="h-10 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Tanggal Pembayaran
                </label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Metode Bayar
              </label>
              <Select
                value={method}
                onValueChange={(v) => setMethod((v as PaymentMethod) || "TRANSFER")}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue>
                    {method === "TRANSFER"
                      ? "Transfer Bank"
                      : method === "CASH"
                      ? "Tunai / Cash"
                      : method === "CHECK"
                      ? "Cek / Bilyet Giro"
                      : "Lainnya"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRANSFER">Transfer Bank</SelectItem>
                  <SelectItem value="CASH">Tunai / Cash</SelectItem>
                  <SelectItem value="CHECK">Cek / Bilyet Giro</SelectItem>
                  <SelectItem value="OTHER">Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Upload Bukti Pembayaran / Transfer <span className="text-[10px] text-muted-foreground font-normal">(Opsional)</span>
              </label>
              {proofFile ? (
                <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate font-medium text-blue-900">{fileName || "Bukti Transfer"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProofFile(null);
                      setFileName("");
                    }}
                    className="text-muted-foreground hover:text-red-500 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 px-3 py-2.5 border border-dashed border-border hover:border-blue-500 rounded-lg cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/20">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-700">Pilih File Bukti (Gambar / PDF)</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Catatan (Opsional)
              </label>
              <Input
                placeholder="Pelunasan tahap 1..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </p>
            )}

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                Simpan Pembayaran
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
