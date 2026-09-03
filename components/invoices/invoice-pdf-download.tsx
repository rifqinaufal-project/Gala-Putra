"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoicePdfDocument } from "./invoice-pdf-document";
import type { CompanyProfilePublic, Invoice, PublicInvoice } from "@/types";

export async function handleDownloadInvoicePdf(invoice: Invoice | PublicInvoice, company?: CompanyProfilePublic) {
  try {
    const blob = await pdf(<InvoicePdfDocument invoice={invoice} company={company} />).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Invoice_${invoice.invoiceNumber?.replace(/\//g, "-") ?? "Draft"}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to generate invoice PDF:", error);
  }
}

interface InvoicePdfDownloadProps {
  invoice: Invoice | PublicInvoice;
  company?: CompanyProfilePublic;
}

export function InvoicePdfDownload({ invoice, company }: InvoicePdfDownloadProps) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    await handleDownloadInvoicePdf(invoice, company);
    setLoading(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5 mr-1.5" />
      )}
      {loading ? "Menyiapkan PDF..." : "Download PDF"}
    </Button>
  );
}
