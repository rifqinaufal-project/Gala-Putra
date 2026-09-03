import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicInvoiceAction } from "@/lib/actions/invoices";
import { formatCurrency, formatDate, parseProductDescription } from "@/lib/utils";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoicePdfDownload } from "@/components/invoices/invoice-pdf-download";
import { CopyAccountButton } from "@/components/invoices/copy-account-button";
import { CreditCard } from "lucide-react";

export const metadata: Metadata = {
  title: "Invoice — Gala Putra",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerInvoicePreviewPage({ params }: PageProps) {
  const { id } = await params;
  const invoice = await getPublicInvoiceAction(id);
  if (!invoice) notFound();

  return (
    <div className="min-h-screen bg-[#f8fafc] py-8 sm:py-12 px-4 sm:px-6 font-sans text-slate-800 antialiased">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-bold text-sm flex items-center justify-center">
              {invoice.company.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold text-slate-900 text-sm tracking-tight">{invoice.company.name}</span>
          </div>

          <InvoicePdfDownload invoice={invoice} />
        </div>

        {/* Clean Invoice Paper Card */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 sm:p-10 space-y-8">

          {/* Header Info */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-100 pb-6">
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-slate-900">{invoice.company.name}</h1>
              <p className="text-xs text-slate-500">{invoice.company.address}</p>
              <p className="text-xs text-slate-500">{invoice.company.phone}{invoice.company.email ? ` · ${invoice.company.email}` : ""}</p>
            </div>

            <div className="sm:text-right space-y-1">
              <div className="flex items-center sm:justify-end gap-2">
                <span className="text-xs font-semibold text-slate-400">INVOICE</span>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <p className="text-lg font-mono font-bold text-slate-900">
                {invoice.invoiceNumber ?? "DRAFT"}
              </p>
              <p className="text-xs text-slate-500">
                Tanggal: <span className="text-slate-800 font-medium">{formatDate(invoice.issueDate)}</span>
              </p>
              {invoice.dueDate && (
                <p className="text-xs text-slate-500">
                  Jatuh Tempo: <span className="text-slate-800 font-medium">{formatDate(invoice.dueDate)}</span>
                </p>
              )}
            </div>
          </div>

          {/* Customer info */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              TAGIHAN KEPADA:
            </p>
            <p className="text-base font-bold text-slate-900">{invoice.customerName}</p>
            {invoice.customerPhone && (
              <p className="text-xs text-slate-500">Telp: {invoice.customerPhone}</p>
            )}
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                  <th className="py-2.5 px-2 w-8">No</th>
                  <th className="py-2.5 px-3">Deskripsi Produk</th>
                  <th className="py-2.5 px-3">Ukuran / Size</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3">Satuan</th>
                  <th className="py-2.5 px-3 text-right">Harga</th>
                  <th className="py-2.5 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {invoice.items.map((item, idx) => {
                  const { name, size } = parseProductDescription(
                    item.descriptionSnapshot,
                    (item as unknown as { size?: string }).size
                  );
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-2 text-slate-400 text-center">{idx + 1}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900">
                        {name}
                      </td>
                      <td className="py-3 px-3">
                        {size !== "—" ? (
                          <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 font-medium rounded text-[11px]">
                            {size}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-medium">{Number((item.quantity + (item.marginQuantity ?? 0)).toFixed(3)).toString()}</td>
                      <td className="py-3 px-3 text-slate-500">{item.unit}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{formatCurrency(item.sellingPriceSnapshot)}</td>
                      <td className="py-3 px-3 text-right tabular-nums font-semibold text-slate-900">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end border-t border-slate-200 pt-4">
            <div className="w-64 space-y-2 text-xs">
              {invoice.discount > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Diskon:</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(invoice.discount)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-1 border-t border-slate-100 text-sm">
                <span className="font-bold text-slate-900">Total Tagihan:</span>
                <span className="font-bold text-slate-900 text-base">{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* Payment Info Box */}
          <div className="bg-blue-50/60 rounded-xl p-5 border-2 border-blue-200/80 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <CreditCard className="w-4 h-4 text-blue-600 shrink-0" />
              <p className="font-bold text-sm">Informasi Pembayaran Transfer Bank</p>
            </div>

            {(invoice.company.bankAccounts?.length
              ? invoice.company.bankAccounts
              : [{ id: "legacy", bankName: invoice.company.bankName, bankAccount: invoice.company.bankAccount, bankHolder: invoice.company.bankHolder, isPrimary: true }]
            ).map((account, index) => (
              <div key={account.id ?? index} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-blue-100 shadow-2xs">
                <div className="space-y-0.5">
                  <p className="text-xs text-slate-500 font-medium">
                    {account.isPrimary ? "Rekening utama · " : ""}Bank {account.bankName}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-base text-blue-900 tracking-wider">
                      {account.bankAccount}
                    </span>
                    <CopyAccountButton accountNumber={account.bankAccount} />
                  </div>
                </div>
                <div className="sm:text-right border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0">
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Atas Nama (A.N.)</p>
                  <p className="text-xs font-bold text-slate-900">{account.bankHolder}</p>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} {invoice.company.name}
        </p>

      </div>
    </div>
  );
}
