"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompanyProfilePublic, Invoice } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface WhatsAppButtonProps {
  invoice: Invoice;
  customerPhone?: string;
  company: CompanyProfilePublic;
}

export function WhatsAppButton({ invoice, customerPhone, company }: WhatsAppButtonProps) {
  const handleSendWhatsApp = () => {
    // 1. Format phone number
    const rawPhone = customerPhone || "";
    if (!rawPhone) {
      toast.error("Nomor WhatsApp restoran belum tersedia.");
      return;
    }
    let cleanPhone = rawPhone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "62" + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith("62")) {
      cleanPhone = "62" + cleanPhone;
    }

    // 2. Build public preview link
    let origin = process.env.NEXT_PUBLIC_APP_URL || "https://gala-putra.vercel.app";
    if (typeof window !== "undefined" && window.location.origin && !window.location.origin.includes("localhost")) {
      origin = window.location.origin;
    }
    if (!invoice.publicToken) {
      toast.error("Token publik invoice belum tersedia. Terapkan migrasi database terbaru.");
      return;
    }
    const previewUrl = `${origin}/preview/invoices/${invoice.publicToken}`;

    // 3. Format message cleanly with online invoice link
    const customerName = invoice.customerName || "Pelanggan";
    const invoiceNum = invoice.invoiceNumber ?? "Draft";
    const dateStr = formatDate(invoice.issueDate);
    const totalStr = formatCurrency(invoice.total);
    const dueDateStr = invoice.dueDate ? formatDate(invoice.dueDate) : "-";

    const bankAccounts = company.bankAccounts?.length
      ? company.bankAccounts
      : [{ id: "legacy", bankName: company.bankName, bankAccount: company.bankAccount, bankHolder: company.bankHolder, isPrimary: true }];

    const messageLines = [
      `Halo *${customerName}*,\n`,
      `Berikut rincian Invoice resmi dari *${company.name}*:`,
      `-  *Nomor Invoice*: ${invoiceNum}`,
      `-  *Tanggal*: ${dateStr}`,
      `-  *Total Tagihan*: ${totalStr}`,
      `-  *Jatuh Tempo*: ${dueDateStr}\n`,
      `- *Lihat & Download PDF Invoice Online*:`,
      `${previewUrl}\n`,
      `Mohon dapat melakukan pembayaran via Transfer Bank:`,
      ...bankAccounts.map((account) => `- *${account.bankName}*: ${account.bankAccount} a.n. ${account.bankHolder}`),
      ``,
      `Terima kasih atas kerja samanya!`
    ];

    const message = messageLines.join("\n");
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

    // 4. Open WhatsApp in new tab
    window.open(whatsappUrl, "_blank");

    toast.success("Membuka WhatsApp dengan Link Invoice Online!", {
      duration: 3000,
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSendWhatsApp}
      className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 transition-colors cursor-pointer"
    >
      <MessageCircle className="w-3.5 h-3.5 mr-1.5 fill-emerald-600/20 text-emerald-600" />
      Kirim ke WhatsApp
    </Button>
  );
}
